import Foundation
import OSLog

@MainActor
final class Quiz2ViewModel: ObservableObject {
    enum Stage {
        case loading
        case playing
        case completed
    }

    enum Quiz2Grade: CaseIterable {
        case again, hard, good, easy

        var quality: Int {
            switch self {
            case .again: return 1
            case .hard:  return 3
            case .good:  return 4
            case .easy:  return 5
            }
        }

        var label: String {
            switch self {
            case .again: return "Again"
            case .hard:  return "Hard"
            case .good:  return "Good"
            case .easy:  return "Easy"
            }
        }

        var helper: String {
            switch self {
            case .again: return "思い出せない"
            case .hard:  return "迷いながら"
            case .good:  return "普通に思い出せた"
            case .easy:  return "余裕で思い出せた"
            }
        }
    }

    // ── UI state ──
    @Published private(set) var stage: Stage = .loading
    @Published private(set) var words: [Word] = []
    @Published private(set) var currentIndex = 0
    @Published private(set) var showAnswer = false
    @Published private(set) var isSubmittingGrade = false
    @Published private(set) var selectedGrade: Quiz2Grade?
    @Published var errorMessage: String?
    @Published private(set) var gradeCounts: [Quiz2Grade: Int] = [
        .again: 0, .hard: 0, .good: 0, .easy: 0
    ]

    /// Tracks the grade each word received (for retry reordering)
    private var gradeHistory: [String: Quiz2Grade] = [:]

    private let logger = Logger(subsystem: "MerkenIOS", category: "Quiz2VM")

    var currentWord: Word? {
        words.indices.contains(currentIndex) ? words[currentIndex] : nil
    }

    var progress: Double {
        guard !words.isEmpty else { return 0 }
        return Double(currentIndex + 1) / Double(words.count)
    }

    var totalCount: Int { words.count }

    var isPerfectScore: Bool {
        let badCount = (gradeCounts[.again] ?? 0) + (gradeCounts[.hard] ?? 0)
        return badCount == 0 && totalCount > 0
    }

    // MARK: - Load

    func load(projectId: String, using state: AppState) async {
        stage = .loading
        do {
            let fetched = try await state.activeRepository.fetchWords(projectId: projectId)
            words = fetched.shuffled()
            currentIndex = 0
            showAnswer = false
            selectedGrade = nil
            isSubmittingGrade = false
            gradeCounts = [.again: 0, .hard: 0, .good: 0, .easy: 0]
            gradeHistory = [:]
            errorMessage = nil
            stage = words.isEmpty ? .completed : .playing
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Quiz2 load failed: \(error.localizedDescription)")
            stage = .completed
        }
    }

    func setSourceWords(_ words: [Word]) {
        self.words = words.shuffled()
        currentIndex = 0
        showAnswer = false
        selectedGrade = nil
        isSubmittingGrade = false
        gradeCounts = [.again: 0, .hard: 0, .good: 0, .easy: 0]
        gradeHistory = [:]
        errorMessage = nil
        stage = self.words.isEmpty ? .completed : .playing
    }

    // MARK: - Actions

    func revealAnswer() {
        guard stage == .playing, !showAnswer else { return }
        showAnswer = true
    }

    func submitGrade(_ grade: Quiz2Grade, using state: AppState) {
        guard stage == .playing, showAnswer, !isSubmittingGrade else { return }
        guard let word = currentWord else { return }

        isSubmittingGrade = true
        selectedGrade = grade

        let patch = QuizEngine.statusPatchByQuality(for: word, quality: grade.quality)

        Task {
            do {
                try await state.activeRepository.updateWord(id: word.id, patch: patch)
            } catch {
                if !error.isCancellationError {
                    logger.error("Quiz2 grade persist failed: \(error.localizedDescription)")
                }
            }

            gradeCounts[grade, default: 0] += 1
            gradeHistory[word.id] = grade

            // Brief pause then advance
            try? await Task.sleep(nanoseconds: 220_000_000)
            goToNext(using: state)
        }
    }

    /// Sort words for retry: Hard first, then Again, Good, Easy (each group shuffled)
    private func sortWordsForRetry() -> [Word] {
        let hard = words.filter { gradeHistory[$0.id] == .hard }.shuffled()
        let again = words.filter { gradeHistory[$0.id] == .again }.shuffled()
        let good = words.filter { gradeHistory[$0.id] == .good }.shuffled()
        let easy = words.filter { gradeHistory[$0.id] == .easy }.shuffled()
        let ungraded = words.filter { gradeHistory[$0.id] == nil }.shuffled()
        return hard + again + good + easy + ungraded
    }

    // MARK: - Navigation

    private func goToNext(using state: AppState) {
        if currentIndex + 1 >= words.count {
            stage = .completed
            state.quizStatsStore.record(
                totalAnswered: words.count,
                correctAnswered: words.count - (gradeCounts[.again] ?? 0)
            )
            state.bumpDataVersion()
            return
        }

        currentIndex += 1
        showAnswer = false
        selectedGrade = nil
        isSubmittingGrade = false
    }

    func restart(projectId: String, using state: AppState) async {
        // Reorder: Hard first, then Again, Good, Easy (each group shuffled)
        let sorted = sortWordsForRetry()
        self.words = sorted
        currentIndex = 0
        showAnswer = false
        selectedGrade = nil
        isSubmittingGrade = false
        gradeCounts = [.again: 0, .hard: 0, .good: 0, .easy: 0]
        gradeHistory = [:]
        errorMessage = nil
        stage = words.isEmpty ? .completed : .playing
    }
}
