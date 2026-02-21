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

    private let logger = Logger(subsystem: "MerkenIOS", category: "SentenceQuizVM")

    var currentQuestion: SentenceQuizQuestion? {
        questions.indices.contains(currentIndex) ? questions[currentIndex] : nil
    }

    var progress: Double {
        guard totalCount > 0 else { return 0 }
        return Double(currentIndex + 1) / Double(totalCount)
    }

    // MARK: - Load words

    func load(projectId: String, using state: AppState) async {
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

            await generateQuiz(using: state)
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            stage = .error
            logger.error("SentenceQuiz load failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Generate quiz via API

    func generateQuiz(using state: AppState) async {
        guard let token = state.session?.accessToken else {
            errorMessage = "ログインが必要です。"
            stage = .error
            return
        }

        stage = .generating
        errorMessage = nil

        // Pick up to 10 words, prioritizing non-mastered
        let prioritized = sourceWords
            .filter { $0.status != .mastered }
            .shuffled()
            + sourceWords.filter { $0.status == .mastered }.shuffled()
        let selected = Array(prioritized.prefix(10))

        let wordInputs = selected.map {
            SentenceQuizWordInput(
                id: $0.id,
                english: $0.english,
                japanese: $0.japanese,
                status: $0.status.rawValue
            )
        }

        do {
            let generated = try await state.webAPIClient.generateSentenceQuiz(
                words: wordInputs,
                bearerToken: token
            )

            questions = generated
            totalCount = generated.count
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
                self.moveNext(using: nil)
            }
        }
    }

    func moveNext(using state: AppState?) {
        guard stage == .playing else { return }

        if currentIndex + 1 >= questions.count {
            stage = .completed
            if let state {
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
    }

    // MARK: - Restart

    func restart(projectId: String, using state: AppState) async {
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
}
