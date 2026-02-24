import Foundation
import OSLog

@MainActor
final class SentenceQuizViewModel: ObservableObject {
    enum Stage {
        case loading
        case generating
        case playing
        case completed
        case error
    }

    private let quizSize = 15

    // ── UI-driving state ──
    @Published private(set) var stage: Stage = .loading
    @Published private(set) var currentIndex = 0
    @Published private(set) var correctCount = 0
    @Published private(set) var totalCount = 0
    @Published private(set) var isRevealed = false
    @Published private(set) var selectedAnswer: String?
    @Published var errorMessage: String?

    // ── Non-published backing store ──
    private var sourceWords: [Word] = []
    private var questions: [SentenceQuizQuestion] = []
    private var pendingWordPatches: [String: WordPatch] = [:]
    private var isFlushingPatches = false
    private weak var latestState: AppState?
    private var activeProjectId: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "SentenceQuizVM")

    var currentQuestion: SentenceQuizQuestion? {
        questions.indices.contains(currentIndex) ? questions[currentIndex] : nil
    }

    var progress: Double {
        guard totalCount > 0 else { return 0 }
        return Double(currentIndex + 1) / Double(totalCount)
    }

    func setSourceWords(_ words: [Word]) {
        sourceWords = words
    }

    // MARK: - Load words

    func load(projectId: String, using state: AppState) async {
        latestState = state
        activeProjectId = projectId
        stage = .loading
        errorMessage = nil

        do {
            let words = try await state.activeRepository.fetchWords(projectId: projectId)
            sourceWords = words

            if words.isEmpty {
                errorMessage = "単語がありません。先に単語を追加してください。"
                stage = .error
                return
            }

            await generateQuiz(projectId: projectId, using: state)
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            stage = .error
            logger.error("SentenceQuiz load failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Generate quiz via API

    func generateQuiz(projectId: String, using state: AppState) async {
        latestState = state
        activeProjectId = projectId

        if let restored = state.sentenceQuizProgressStore.restore(projectId: projectId) {
            applyRestoredProgress(restored)
            stage = .playing
            return
        }

        stage = .generating
        errorMessage = nil

        let selected = selectWordsForQuiz(from: sourceWords)
        let wordInputs = selected.map {
            SentenceQuizWordInput(
                id: $0.id,
                english: $0.english,
                japanese: $0.japanese,
                status: $0.status.rawValue
            )
        }

        do {
            let generated = try await state.performWebAPIRequest { token in
                try await state.webAPIClient.generateSentenceQuizWithRawResponse(
                    words: wordInputs,
                    bearerToken: token
                )
            }

            state.sentenceQuizProgressStore.saveInitial(
                projectId: projectId,
                rawResponseData: generated.rawResponseData
            )

            questions = generated.questions
            totalCount = generated.questions.count
            currentIndex = 0
            correctCount = 0
            isRevealed = false
            selectedAnswer = nil
            pendingWordPatches = [:]
            stage = .playing
        } catch let error as WebAPIError {
            errorMessage = error.localizedDescription
            stage = .error
            logger.error("SentenceQuiz API failed: \(error.localizedDescription)")
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            stage = .error
            logger.error("SentenceQuiz generate failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Answer

    func answer(selected: String, isCorrect: Bool) {
        guard stage == .playing, !isRevealed else { return }

        selectedAnswer = selected
        isRevealed = true

        if isCorrect {
            correctCount += 1
        }

        // Update word status
        let wordId = currentQuestion?.wordId ?? ""
        if let word = sourceWords.first(where: { $0.id == wordId }) {
            let patch = QuizEngine.statusPatch(for: word, isCorrect: isCorrect)
            pendingWordPatches[wordId] = patch
        }

        // Auto-advance on correct
        if isCorrect {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 180_000_000)
                self.moveNext()
            }
        }
    }

    func moveNext(using state: AppState? = nil) {
        guard stage == .playing else { return }

        let resolvedState = state ?? latestState

        if currentIndex + 1 >= questions.count {
            stage = .completed

            if let projectId = activeProjectId {
                resolvedState?.sentenceQuizProgressStore.clear(projectId: projectId)
            }

            if let state = resolvedState {
                state.quizStatsStore.record(
                    totalAnswered: questions.count,
                    correctAnswered: correctCount
                )
                state.bumpDataVersion()
                Task(priority: .utility) { [weak self] in
                    await self?.flushPendingUpdates(using: state)
                }
            }
            return
        }

        currentIndex += 1
        isRevealed = false
        selectedAnswer = nil
        saveProgressIfNeeded()
    }

    // MARK: - Restart

    func restart(projectId: String, using state: AppState) async {
        state.sentenceQuizProgressStore.clear(projectId: projectId)
        Task(priority: .utility) { [weak self] in
            await self?.flushPendingUpdates(using: state)
        }
        await load(projectId: projectId, using: state)
    }

    // MARK: - Flush pending updates

    func flushPendingUpdates(using state: AppState) async {
        guard !isFlushingPatches, !pendingWordPatches.isEmpty else { return }

        isFlushingPatches = true
        let patches = pendingWordPatches
        pendingWordPatches.removeAll()

        var failed: [String: WordPatch] = [:]

        for (wordId, patch) in patches {
            do {
                try await state.activeRepository.updateWord(id: wordId, patch: patch)
            } catch {
                if error.isCancellationError {
                    failed[wordId] = patch
                    continue
                }
                failed[wordId] = patch
                logger.error("SentenceQuiz answer save failed: \(error.localizedDescription)")
            }
        }

        if !failed.isEmpty {
            for (wordId, patch) in failed where pendingWordPatches[wordId] == nil {
                pendingWordPatches[wordId] = patch
            }
            errorMessage = "一部の回答結果を保存できませんでした。"
        }

        isFlushingPatches = false
    }

    private func selectWordsForQuiz(from words: [Word]) -> [Word] {
        let prioritized = words
            .filter { $0.status != .mastered }
            .shuffled()
            + words.filter { $0.status == .mastered }.shuffled()

        guard !prioritized.isEmpty else { return [] }

        if prioritized.count >= quizSize {
            return Array(prioritized.prefix(quizSize))
        }

        var selected: [Word] = []
        while selected.count < quizSize {
            selected.append(contentsOf: prioritized)
        }
        return Array(selected.prefix(quizSize)).shuffled()
    }

    private func applyRestoredProgress(_ progress: SentenceQuizProgressSnapshot) {
        questions = progress.questions
        totalCount = progress.questions.count
        currentIndex = progress.currentIndex
        correctCount = progress.correctCount
        isRevealed = false
        selectedAnswer = nil
        pendingWordPatches = [:]
    }

    private func saveProgressIfNeeded() {
        guard
            let projectId = activeProjectId,
            let state = latestState,
            stage == .playing,
            currentIndex > 0,
            !questions.isEmpty
        else {
            return
        }

        state.sentenceQuizProgressStore.saveProgress(
            projectId: projectId,
            currentIndex: currentIndex,
            correct: correctCount,
            total: currentIndex
        )
    }
}
