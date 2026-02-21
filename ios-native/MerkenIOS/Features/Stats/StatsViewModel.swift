import Foundation
import OSLog

@MainActor
final class StatsViewModel: ObservableObject {
    @Published private(set) var totalWords = 0
    @Published private(set) var masteredWords = 0
    @Published private(set) var reviewWords = 0
    @Published private(set) var newWords = 0
    @Published private(set) var todayAnswered = 0
    @Published private(set) var todayCorrect = 0
    @Published private(set) var todaySessions = 0
    @Published private(set) var streakDays = 0
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "StatsVM")

    var todayAccuracy: Double {
        guard todayAnswered > 0 else { return 0 }
        return Double(todayCorrect) / Double(todayAnswered)
    }

    var masterRate: Double {
        guard totalWords > 0 else { return 0 }
        return Double(masteredWords) / Double(totalWords)
    }

    func load(using state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            let allWords = try await state.activeRepository.fetchAllWords(userId: state.activeUserId)

            totalWords = allWords.count
            newWords = allWords.filter { $0.status == .new }.count
            reviewWords = allWords.filter { $0.status == .review }.count
            masteredWords = allWords.filter { $0.status == .mastered }.count

            let today = state.quizStatsStore.todayStats()
            todayAnswered = today.totalAnswered
            todayCorrect = today.correctAnswered
            todaySessions = today.quizSessions
            streakDays = state.quizStatsStore.streakDays()

            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Stats load failed: \(error.localizedDescription)")
        }
    }
}
