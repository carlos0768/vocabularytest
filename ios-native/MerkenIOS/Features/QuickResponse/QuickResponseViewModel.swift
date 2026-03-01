import Foundation
import Speech
import AVFoundation
import OSLog
import UIKit

@MainActor
final class QuickResponseViewModel: ObservableObject {

    enum Phase: Equatable { case ready, listening, answered }
    enum Stage: Equatable { case loading, playing, completed, unsupported }

    // MARK: - Published state

    @Published private(set) var stage: Stage = .loading
    @Published private(set) var phase: Phase = .ready
    @Published private(set) var currentIndex = 0
    @Published private(set) var timeLeft: Double = timerDuration
    @Published private(set) var recognizedText = ""
    @Published private(set) var isCorrect = false
    @Published private(set) var isTimedOut = false
    @Published private(set) var correctCount = 0
    @Published private(set) var totalCount = 0
    @Published private(set) var timeoutCount = 0

    // MARK: - Constants

    static let timerDuration: Double = 3.0
    private static let defaultWordCount = 10
    private static let timerTick: Duration = .milliseconds(50)
    private static let gracePeriod: Duration = .milliseconds(300)

    // MARK: - Private state

    @Published private(set) var words: [Word] = []
    private var answered = false
    private var bestTranscript = ""
    private var allTranscripts: [String] = []
    private var pendingWordPatches: [String: WordPatch] = [:]

    private var timerTask: Task<Void, Never>?
    private var graceTask: Task<Void, Never>?

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    private let logger = Logger(subsystem: "MerkenIOS", category: "QuickResponseVM")

    var currentWord: Word? {
        words.indices.contains(currentIndex) ? words[currentIndex] : nil
    }

    var progress: Double {
        guard !words.isEmpty else { return 0 }
        let extra: Double = phase == .answered ? 1 : 0
        return Double(currentIndex + Int(extra)) / Double(words.count)
    }

    // MARK: - Load

    func load(projectId: String, preloadedWords: [Word]? = nil, using state: AppState) async {
        stage = .loading

        let authorized = await requestPermissions()
        guard authorized else {
            stage = .unsupported
            return
        }

        do {
            let allWords: [Word]
            if let preloadedWords, !preloadedWords.isEmpty {
                allWords = preloadedWords
            } else {
                allWords = try await state.activeRepository.fetchWords(projectId: projectId)
            }

            let unmastered = allWords.filter { $0.status != .mastered }
            let pool = unmastered.isEmpty ? allWords : unmastered

            guard !pool.isEmpty else {
                stage = .completed
                return
            }

            let sorted = QuizEngine.sortByStudyPriority(pool)
            words = Array(sorted.prefix(Self.defaultWordCount))
            stage = .playing
            startQuestion()
        } catch {
            logger.error("Failed to load words: \(error.localizedDescription)")
            stage = .completed
        }
    }

    // MARK: - Permissions

    private func requestPermissions() async -> Bool {
        guard speechRecognizer != nil else { return false }

        let speechStatus = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status)
            }
        }
        guard speechStatus == .authorized else { return false }

        let audioStatus: Bool
        if #available(iOS 17.0, *) {
            audioStatus = await AVAudioApplication.requestRecordPermission()
        } else {
            audioStatus = await withCheckedContinuation { cont in
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    cont.resume(returning: granted)
                }
            }
        }
        return audioStatus
    }

    // MARK: - Question lifecycle

    func startQuestion() {
        stopRecognition()
        graceTask?.cancel()
        graceTask = nil
        timerTask?.cancel()
        timerTask = nil

        answered = false
        bestTranscript = ""
        allTranscripts = []
        phase = .ready
        timeLeft = Self.timerDuration
        recognizedText = ""
        isCorrect = false
        isTimedOut = false
    }

    func beginListening() {
        guard phase == .ready else { return }
        phase = .listening
        startRecognition()
        startTimer()
    }

    func onRelease() {
        guard phase == .listening, !answered else { return }
        graceTask?.cancel()
        handleAnswer(transcript: bestTranscript, timedOut: false)
    }

    func moveToNext(using state: AppState) {
        if currentIndex + 1 >= words.count {
            stage = .completed
            stopRecognition()

            let accuracy = words.isEmpty ? 0 : Double(correctCount) / Double(words.count)
            if accuracy >= 0.8 {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }

            state.quizStatsStore.record(totalAnswered: totalCount, correctAnswered: correctCount)
            state.bumpDataVersion()

            Task(priority: .utility) { [weak self] in
                await self?.flushPendingUpdates(using: state)
            }
        } else {
            currentIndex += 1
            startQuestion()
        }
    }

    func restart(projectId: String, using state: AppState) async {
        Task(priority: .utility) { [weak self] in
            await self?.flushPendingUpdates(using: state)
        }

        currentIndex = 0
        correctCount = 0
        totalCount = 0
        timeoutCount = 0
        pendingWordPatches = [:]
        stage = .playing
        startQuestion()
    }

    func cleanup() {
        stopRecognition()
        timerTask?.cancel()
        graceTask?.cancel()
    }

    // MARK: - Answer handling (Web版の知見: grace period + bestTranscript fallback)

    private func handleAnswer(transcript: String, timedOut: Bool) {
        guard !answered else { return }
        guard let word = currentWord else { return }
        answered = true

        stopRecognition()
        timerTask?.cancel()
        graceTask?.cancel()

        let bestAvailable = transcript.isEmpty ? bestTranscript : transcript
        let normalizedExpected = normalize(word.english)

        var candidates = allTranscripts
        if !bestAvailable.isEmpty && !candidates.contains(bestAvailable) {
            candidates.insert(bestAvailable, at: 0)
        }

        let correct = candidates.contains { candidate in
            let n = normalize(candidate)
            return !n.isEmpty && fuzzyMatch(n, normalizedExpected)
        }

        let haptic = UIImpactFeedbackGenerator(style: correct ? .light : .heavy)
        haptic.impactOccurred()

        recognizedText = bestAvailable
        isCorrect = correct
        isTimedOut = timedOut && bestAvailable.isEmpty
        phase = .answered

        totalCount += 1
        if correct { correctCount += 1 }
        if timedOut && bestAvailable.isEmpty { timeoutCount += 1 }

        let patch = QuizEngine.statusPatch(for: word, isCorrect: correct)
        pendingWordPatches[word.id] = patch
    }

    private func normalize(_ s: String) -> String {
        s.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[^a-z0-9\\s]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    private func fuzzyMatch(_ answer: String, _ expected: String) -> Bool {
        if answer == expected { return true }
        let dist = levenshtein(answer, expected)
        let maxLen = max(answer.count, expected.count)
        guard maxLen > 0 else { return false }
        let threshold = maxLen <= 4 ? 1 : max(1, maxLen / 4)
        return dist <= threshold
    }

    private func levenshtein(_ a: String, _ b: String) -> Int {
        let a = Array(a)
        let b = Array(b)
        let m = a.count, n = b.count
        if m == 0 { return n }
        if n == 0 { return m }

        var prev = Array(0...n)
        var curr = [Int](repeating: 0, count: n + 1)

        for i in 1...m {
            curr[0] = i
            for j in 1...n {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
            }
            swap(&prev, &curr)
        }
        return prev[n]
    }

    // MARK: - Timer (Web版の知見: grace period で競合回避)

    private func startTimer() {
        let start = ContinuousClock.now

        timerTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.timerTick)
                guard let self, !Task.isCancelled else { return }
                guard !self.answered else { return }

                let elapsed = ContinuousClock.now - start
                let remaining = max(0, Self.timerDuration - elapsed.seconds)
                self.timeLeft = remaining

                if remaining <= 0 {
                    self.onTimerExpired()
                    return
                }
            }
        }
    }

    private func onTimerExpired() {
        guard !answered else { return }

        graceTask?.cancel()
        graceTask = Task { [weak self] in
            try? await Task.sleep(for: Self.gracePeriod)
            guard let self, !Task.isCancelled, !self.answered else { return }
            self.handleAnswer(transcript: self.bestTranscript, timedOut: true)
        }
    }

    // MARK: - Speech recognition

    private func startRecognition() {
        guard let speechRecognizer, speechRecognizer.isAvailable else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if #available(iOS 16.0, *) {
            request.addsPunctuation = false
        }
        request.contextualStrings = words.map { $0.english }
        recognitionRequest = request

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            logger.error("Audio session setup failed: \(error.localizedDescription)")
            return
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            logger.error("Audio engine start failed: \(error.localizedDescription)")
            return
        }

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }

                if let result {
                    let transcript = result.bestTranscription.formattedString

                    if !transcript.isEmpty {
                        self.bestTranscript = transcript
                        if !self.answered {
                            self.recognizedText = transcript
                        }
                    }

                    self.allTranscripts = result.transcriptions.map { $0.formattedString }

                    if result.isFinal {
                        self.graceTask?.cancel()
                        self.handleAnswer(transcript: transcript, timedOut: false)
                    }
                }

                if error != nil && !self.answered {
                    // Recognition ended with error — use bestTranscript via grace period
                    if self.graceTask == nil {
                        self.graceTask = Task { [weak self] in
                            try? await Task.sleep(for: Self.gracePeriod)
                            guard let self, !Task.isCancelled, !self.answered else { return }
                            self.handleAnswer(transcript: self.bestTranscript, timedOut: true)
                        }
                    }
                }
            }
        }
    }

    private func stopRecognition() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Persistence

    private func flushPendingUpdates(using state: AppState) async {
        let patches = pendingWordPatches
        pendingWordPatches.removeAll()

        for (wordId, patch) in patches {
            do {
                try await state.activeRepository.updateWord(id: wordId, patch: patch)
            } catch {
                logger.error("Failed to save word update: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - Duration helpers

private extension Swift.Duration {
    var seconds: Double {
        let (s, a) = components
        return Double(s) + Double(a) / 1_000_000_000_000_000_000
    }
}
