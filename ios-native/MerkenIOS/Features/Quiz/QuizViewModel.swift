import Foundation
import UIKit
import OSLog

@MainActor
final class QuizViewModel: ObservableObject {
    enum Stage {
        case setup
        case playing
        case completed
    }

    // ── UI-driving state (minimal @Published) ──
    @Published private(set) var stage: Stage = .setup
    @Published private(set) var loading = false
    @Published private(set) var preparingQuiz = false
    @Published var errorMessage: String?

    // Setup screen
    @Published private(set) var sourceWordCount = 0
    @Published private(set) var hasPreparedQuizContent = false
    @Published var selectedQuestionCount = 10
    @Published private(set) var questionLimitOptions: [Int] = [10]

    // Play screen
    @Published private(set) var currentIndex = 0
    @Published private(set) var selectedIndex: Int?
    @Published private(set) var isRevealed = false
    @Published private(set) var correctCount = 0
    @Published private(set) var questions: [QuizQuestion] = []

    // ── Non-published backing store ──
    // sourceWords is large (2000+) — never @Published to avoid re-render storms
    private var sourceWords: [Word] = []

    private let logger = Logger(subsystem: "MerkenIOS", category: "QuizVM")
    private var pendingWordPatches: [String: WordPatch] = [:]
    private var isFlushingPatches = false
    private var quizPreparationTask: Task<Void, Never>?

    deinit {
        quizPreparationTask?.cancel()
    }

    var currentQuestion: QuizQuestion? {
        questions.indices.contains(currentIndex) ? questions[currentIndex] : nil
    }

    var progress: Double {
        guard !questions.isEmpty else { return 0 }
        return Double(currentIndex + 1) / Double(questions.count)
    }

    func setSourceWords(_ words: [Word]) {
        let prioritized = QuizEngine.sortByStudyPriority(words)
        sourceWords = prioritized
        sourceWordCount = prioritized.count
        hasPreparedQuizContent = prioritized.contains { $0.distractors.count >= 3 }
        if selectedQuestionCount > words.count {
            selectedQuestionCount = max(1, prioritized.count)
        }
        recomputeLimitOptions()
        errorMessage = nil
        loading = false
    }

    func load(projectId: String, using state: AppState) async {
        quizPreparationTask?.cancel()
        preparingQuiz = false
        loading = true
        defer { loading = false }

        do {
            let words = try await state.activeRepository.fetchWords(projectId: projectId)
            setSourceWords(words)
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Quiz load failed: \(error.localizedDescription)")
        }
    }

    func startQuiz() {
        guard !loading, !preparingQuiz else { return }
        guard !sourceWords.isEmpty else {
            errorMessage = "単語がありません。先に単語を追加してください。"
            return
        }

        preparingQuiz = true
        errorMessage = nil

        let words = sourceWords
        let count = selectedQuestionCount

        quizPreparationTask?.cancel()
        quizPreparationTask = Task.detached(priority: .userInitiated) { [weak self] in
            let generated = QuizEngine.generateQuestions(words: words, count: count)

            await MainActor.run {
                guard let self else { return }
                self.preparingQuiz = false

                guard !generated.isEmpty else {
                    self.errorMessage = "問題を作成できませんでした。"
                    self.stage = .setup
                    return
                }

                self.questions = generated
                self.currentIndex = 0
                self.selectedIndex = nil
                self.isRevealed = false
                self.correctCount = 0
                self.pendingWordPatches = [:]
                self.stage = .playing
                self.errorMessage = nil
            }
        }
    }

    @Published var typedAnswer = ""
    @Published private(set) var typingCorrect: Bool?

    var isActiveVocab: Bool {
        currentQuestion?.word.vocabularyType == .active
    }

    func answer(index: Int, projectId: String, using state: AppState) {
        guard stage == .playing,
              !isRevealed,
              let question = currentQuestion
        else { return }

        selectedIndex = index
        isRevealed = true

        let isCorrect = index == question.correctIndex

        let generator = UIImpactFeedbackGenerator(style: isCorrect ? .light : .heavy)
        generator.impactOccurred()

        if isCorrect {
            correctCount += 1
        }

        let patch = QuizEngine.statusPatch(for: question.word, isCorrect: isCorrect)
        pendingWordPatches[question.word.id] = patch
    }

    func submitTypingAnswer(projectId: String, using state: AppState) {
        guard stage == .playing,
              !isRevealed,
              let question = currentQuestion
        else { return }

        let trimmed = typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
        let isCorrect = trimmed.lowercased() == question.word.english.lowercased()

        typingCorrect = isCorrect
        isRevealed = true

        let generator = UIImpactFeedbackGenerator(style: isCorrect ? .light : .heavy)
        generator.impactOccurred()

        if isCorrect {
            correctCount += 1
        }

        let patch = QuizEngine.statusPatch(for: question.word, isCorrect: isCorrect)
        pendingWordPatches[question.word.id] = patch
    }

    func moveNext(projectId: String, using state: AppState) {
        guard stage == .playing else { return }

        if currentIndex + 1 >= questions.count {
            stage = .completed

            // Celebration haptic when 80%+ correct
            let accuracy = questions.isEmpty ? 0 : Double(correctCount) / Double(questions.count)
            if accuracy >= 0.8 {
                let gen = UINotificationFeedbackGenerator()
                gen.notificationOccurred(.success)
            }

            state.quizStatsStore.record(
                totalAnswered: questions.count,
                correctAnswered: correctCount
            )
            Task(priority: .utility) { [weak self] in
                guard let self else { return }
                await self.flushPendingUpdatesIfNeeded(using: state)
                state.bumpDataVersion()
            }
            return
        }

        currentIndex += 1
        selectedIndex = nil
        isRevealed = false
        typedAnswer = ""
        typingCorrect = nil
    }

    func restart(projectId: String, using state: AppState) async {
        Task(priority: .utility) { [weak self] in
            await self?.flushPendingUpdatesIfNeeded(using: state)
        }
        await load(projectId: projectId, using: state)
        stage = .setup
        questions = []
        currentIndex = 0
        selectedIndex = nil
        isRevealed = false
        correctCount = 0
        pendingWordPatches = [:]
        preparingQuiz = false
        typedAnswer = ""
        typingCorrect = nil
    }

    func flushPendingUpdatesIfNeeded(using state: AppState) async {
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
                logger.error("Quiz answer persistence failed: \(error.localizedDescription)")
            }
        }

        if !failed.isEmpty {
            for (wordId, patch) in failed where pendingWordPatches[wordId] == nil {
                pendingWordPatches[wordId] = patch
            }
            errorMessage = "一部の回答結果を保存できませんでした。通信状態を確認してください。"
        } else if errorMessage == "一部の回答結果を保存できませんでした。通信状態を確認してください。" {
            errorMessage = nil
        }

        isFlushingPatches = false
    }

    func toggleFavorite(projectId: String, using state: AppState) async {
        guard let current = currentQuestion else { return }

        let updatedFavorite = !current.word.isFavorite

        do {
            try await state.activeRepository.updateWord(
                id: current.word.id,
                patch: WordPatch(isFavorite: updatedFavorite)
            )

            let updatedWord = Word(
                id: current.word.id,
                projectId: current.word.projectId,
                english: current.word.english,
                japanese: current.word.japanese,
                distractors: current.word.distractors,
                exampleSentence: current.word.exampleSentence,
                exampleSentenceJa: current.word.exampleSentenceJa,
                pronunciation: current.word.pronunciation,
                status: current.word.status,
                createdAt: current.word.createdAt,
                lastReviewedAt: current.word.lastReviewedAt,
                nextReviewAt: current.word.nextReviewAt,
                easeFactor: current.word.easeFactor,
                intervalDays: current.word.intervalDays,
                repetition: current.word.repetition,
                isFavorite: updatedFavorite,
                vocabularyType: current.word.vocabularyType
            )

            questions[currentIndex] = QuizQuestion(
                sequenceIndex: current.sequenceIndex,
                word: updatedWord,
                options: current.options,
                correctIndex: current.correctIndex
            )
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Toggle favorite failed: \(error.localizedDescription)")
        }
    }

    private func recomputeLimitOptions() {
        guard !sourceWords.isEmpty else {
            questionLimitOptions = [10]
            return
        }
        let maxCount = sourceWords.count
        let candidates = [10, 20, 30, maxCount]
        questionLimitOptions = Array(Set(candidates.filter { $0 > 0 && $0 <= maxCount })).sorted()
    }
}
