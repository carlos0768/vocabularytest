import Foundation
import OSLog

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var projects: [Project] = []
    @Published private(set) var totalWordCount: Int = 0
    @Published private(set) var dueWordCount: Int = 0
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    // Daily stats for hero section
    @Published private(set) var streakDays: Int = 0
    @Published private(set) var todayAnswered: Int = 0
    @Published private(set) var todayCorrect: Int = 0

    var accuracyPercent: Int {
        guard todayAnswered > 0 else { return 0 }
        return Int(Double(todayCorrect) / Double(todayAnswered) * 100)
    }

    private let logger = Logger(subsystem: "MerkenIOS", category: "HomeVM")
    private var wordCountTask: Task<Void, Never>?

    func load(using state: AppState) async {
        wordCountTask?.cancel()
        loading = true

        // Load daily stats synchronously (UserDefaults, no async needed)
        let daily = state.quizStatsStore.todayStats()
        streakDays = state.quizStatsStore.streakDays()
        todayAnswered = daily.totalAnswered
        todayCorrect = daily.correctAnswered

        do {
            let repository = state.activeRepository
            let userId = state.activeUserId
            let projects = try await repository.fetchProjects(userId: userId)
            self.projects = projects
            errorMessage = nil
            loading = false

            // Single fetchAllWords instead of N+1 per-project queries
            wordCountTask = Task { [weak self] in
                guard !Task.isCancelled else { return }
                do {
                    let allWords = try await repository.fetchAllWords(userId: userId)
                    guard !Task.isCancelled else { return }

                    let total = allWords.count
                    let due = allWords.filter { word in
                        if word.status != .mastered { return true }
                        guard let nextReviewAt = word.nextReviewAt else { return false }
                        return nextReviewAt <= .now
                    }.count

                    self?.totalWordCount = total
                    self?.dueWordCount = due
                } catch {
                    // skip on failure
                }
            }
        } catch {
            loading = false
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Home load failed: \(error.localizedDescription)")
        }
    }
}
