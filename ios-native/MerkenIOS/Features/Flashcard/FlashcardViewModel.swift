import Foundation
import AVFoundation
import OSLog

@MainActor
final class FlashcardViewModel: ObservableObject {
    enum Stage {
        case loading
        case viewing
        case empty
    }

    // ── UI-driving state ──
    @Published private(set) var stage: Stage = .loading
    @Published private(set) var currentIndex = 0
    @Published private(set) var isFlipped = false
    @Published private(set) var wordCount = 0
    @Published var japaneseFirst = false
    @Published var slowSpeed = false
    @Published private(set) var isAutoPlayEnabled = false
    @Published var errorMessage: String?
    @Published var shouldShowTinderSort = false  // set true to auto-trigger tinder sort

    // ── Non-published backing store ──
    private var words: [Word] = []
    private let logger = Logger(subsystem: "MerkenIOS", category: "FlashcardVM")
    private let synthesizer = AVSpeechSynthesizer()
    private var autoPlayTask: Task<Void, Never>?
    private let autoPlayFrontDelayNanoseconds: UInt64 = 2_400_000_000
    private let autoPlayBackDelayNanoseconds: UInt64 = 1_500_000_000

    init(initialWords: [Word]? = nil) {
        if let initialWords, !initialWords.isEmpty {
            setWords(initialWords)
        } else {
            stage = .loading
        }
    }

    var currentWord: Word? {
        words.indices.contains(currentIndex) ? words[currentIndex] : nil
    }

    var allWords: [Word] { words }

    var hasNext: Bool {
        currentIndex + 1 < words.count
    }

    var hasPrevious: Bool {
        currentIndex > 0
    }

    func setWords(_ preloaded: [Word]) {
        let prioritized = QuizEngine.sortByStudyPriority(preloaded)
        words = prioritized
        wordCount = prioritized.count
        currentIndex = 0
        isFlipped = false
        stage = prioritized.isEmpty ? .empty : .viewing
        if prioritized.isEmpty {
            stopAutoPlay()
        } else if isAutoPlayEnabled {
            restartAutoPlayLoop()
        }
        // Check if all words are brand new (never reviewed) → auto tinder sort
        checkFirstTimeSort()
    }

    private func checkFirstTimeSort() {
        guard !words.isEmpty else { return }
        let allNew = words.allSatisfy { $0.repetition == 0 && $0.lastReviewedAt == nil }
        if allNew {
            shouldShowTinderSort = true
        }
    }

    func load(projectId: String, using state: AppState) async {
        if words.isEmpty {
            stage = .loading
        }
        errorMessage = nil

        do {
            let fetched = try await state.activeRepository.fetchWords(projectId: projectId)
            let prioritized = QuizEngine.sortByStudyPriority(fetched)
            words = prioritized
            wordCount = prioritized.count
            currentIndex = 0
            isFlipped = false
            stage = prioritized.isEmpty ? .empty : .viewing
            if prioritized.isEmpty {
                stopAutoPlay()
            } else if isAutoPlayEnabled {
                restartAutoPlayLoop()
            }
            checkFirstTimeSort()
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            stage = words.isEmpty ? .empty : .viewing
            logger.error("Flashcard load failed: \(error.localizedDescription)")
        }
    }

    func goNext() {
        guard !words.isEmpty else { return }
        currentIndex = min(currentIndex + 1, words.count - 1)
        isFlipped = false
    }

    func goPrevious() {
        guard hasPrevious else { return }
        currentIndex -= 1
        isFlipped = false
    }

    func flipCard() {
        isFlipped.toggle()
    }

    func toggleAutoPlay() {
        if isAutoPlayEnabled {
            stopAutoPlay()
        } else {
            startAutoPlay()
        }
    }

    func stopAutoPlay() {
        autoPlayTask?.cancel()
        autoPlayTask = nil
        isAutoPlayEnabled = false
        deactivateBackgroundAudioSessionIfNeeded()
    }

    func speak() {
        guard let word = currentWord else { return }
        synthesizer.stopSpeaking(at: .immediate)
        let text = spokenText(for: word, isBackSide: isFlipped)
        let language = spokenLanguage(for: word, isBackSide: isFlipped)
        speak(text: text, language: language)
    }

    func toggleSpeed() {
        slowSpeed.toggle()
    }

    func toggleFavorite(using state: AppState) async {
        guard let word = currentWord else { return }
        let newValue = !word.isFavorite

        do {
            try await state.activeRepository.updateWord(
                id: word.id,
                patch: WordPatch(isFavorite: newValue)
            )

            // Update in-memory
            words[currentIndex] = Word(
                id: word.id,
                projectId: word.projectId,
                english: word.english,
                japanese: word.japanese,
                distractors: word.distractors,
                exampleSentence: word.exampleSentence,
                exampleSentenceJa: word.exampleSentenceJa,
                pronunciation: word.pronunciation,
                status: word.status,
                createdAt: word.createdAt,
                lastReviewedAt: word.lastReviewedAt,
                nextReviewAt: word.nextReviewAt,
                easeFactor: word.easeFactor,
                intervalDays: word.intervalDays,
                repetition: word.repetition,
                isFavorite: newValue
            )
            // Trigger re-render by bumping wordCount (same value but objectWillChange fires)
            objectWillChange.send()
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Toggle favorite failed: \(error.localizedDescription)")
        }
    }

    func toggleDirection() {
        japaneseFirst.toggle()
        isFlipped = false
    }

    func shuffle() {
        words.shuffle()
        currentIndex = 0
        isFlipped = false
        wordCount = words.count
        if isAutoPlayEnabled {
            restartAutoPlayLoop()
        }
    }

    func editWord(english: String, japanese: String, using state: AppState) async {
        guard let word = currentWord else { return }
        do {
            try await state.activeRepository.updateWord(
                id: word.id,
                patch: WordPatch(english: english, japanese: japanese)
            )
            words[currentIndex] = Word(
                id: word.id,
                projectId: word.projectId,
                english: english,
                japanese: japanese,
                distractors: word.distractors,
                exampleSentence: word.exampleSentence,
                exampleSentenceJa: word.exampleSentenceJa,
                pronunciation: word.pronunciation,
                status: word.status,
                createdAt: word.createdAt,
                lastReviewedAt: word.lastReviewedAt,
                nextReviewAt: word.nextReviewAt,
                easeFactor: word.easeFactor,
                intervalDays: word.intervalDays,
                repetition: word.repetition,
                isFavorite: word.isFavorite
            )
            objectWillChange.send()
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Edit word failed: \(error.localizedDescription)")
        }
    }

    var dictionaryURL: URL? {
        guard let word = currentWord else { return nil }
        let encoded = word.english.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word.english
        return URL(string: "https://eow.alc.co.jp/search?q=\(encoded)")
    }

    func deleteWord(using state: AppState) async {
        guard let word = currentWord else { return }

        do {
            try await state.activeRepository.deleteWord(id: word.id)
            words.remove(at: currentIndex)
            wordCount = words.count

            if words.isEmpty {
                stage = .empty
                stopAutoPlay()
            } else if currentIndex >= words.count {
                currentIndex = words.count - 1
            }
            isFlipped = false
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Delete word failed: \(error.localizedDescription)")
        }
    }

    private func startAutoPlay() {
        guard !words.isEmpty else { return }
        do {
            try activateBackgroundAudioSession()
        } catch {
            logger.error("Failed to activate flashcard auto-play audio session: \(error.localizedDescription)")
            errorMessage = "自動再生を開始できませんでした。"
            return
        }

        isAutoPlayEnabled = true
        restartAutoPlayLoop()
    }

    private func restartAutoPlayLoop() {
        autoPlayTask?.cancel()
        guard isAutoPlayEnabled, !words.isEmpty else { return }

        autoPlayTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.performAutoPlayCycle()
            }
        }
    }

    private func performAutoPlayCycle() async {
        guard isAutoPlayEnabled, !words.isEmpty, let word = currentWord else { return }
        if isFlipped {
            isFlipped = false
        }

        speak(
            text: spokenText(for: word, isBackSide: false),
            language: spokenLanguage(for: word, isBackSide: false)
        )

        guard await sleepForAutoPlay(autoPlayFrontDelayNanoseconds) else { return }
        guard isAutoPlayEnabled else { return }

        if !isFlipped {
            isFlipped = true
        }

        speak(
            text: spokenText(for: word, isBackSide: true),
            language: spokenLanguage(for: word, isBackSide: true)
        )

        guard await sleepForAutoPlay(autoPlayBackDelayNanoseconds) else { return }
        guard isAutoPlayEnabled else { return }

        advanceToNextLoopingCard()
    }

    private func advanceToNextLoopingCard() {
        guard !words.isEmpty else { return }
        if hasNext {
            currentIndex += 1
        } else {
            currentIndex = 0
        }
        isFlipped = false
    }

    private func sleepForAutoPlay(_ duration: UInt64) async -> Bool {
        do {
            try await Task.sleep(nanoseconds: duration)
            return true
        } catch {
            return false
        }
    }

    private func activateBackgroundAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
        try session.setActive(true)
    }

    private func spokenText(for word: Word, isBackSide: Bool) -> String {
        let frontText = japaneseFirst ? word.japanese : word.english
        let backText = japaneseFirst ? word.english : word.japanese
        return isBackSide ? backText : frontText
    }

    private func spokenLanguage(for word: Word, isBackSide: Bool) -> String {
        let frontLanguage = japaneseFirst ? "ja-JP" : "en-US"
        let backLanguage = japaneseFirst ? "en-US" : "ja-JP"
        return isBackSide ? backLanguage : frontLanguage
    }

    private func speak(text: String, language: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = AVSpeechSynthesisVoice(language: language)
        utterance.rate = slowSpeed
            ? AVSpeechUtteranceDefaultSpeechRate * 0.5
            : AVSpeechUtteranceDefaultSpeechRate * 0.9
        synthesizer.speak(utterance)
    }

    private func deactivateBackgroundAudioSessionIfNeeded() {
        guard !isAutoPlayEnabled else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            logger.error("Failed to deactivate flashcard auto-play audio session: \(error.localizedDescription)")
        }
    }
}
