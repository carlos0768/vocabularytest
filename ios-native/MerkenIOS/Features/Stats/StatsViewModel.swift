import Foundation
import OSLog

struct MasteryDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let label: String   // "3/1" style
    let mastered: Int
    let total: Int
}

@MainActor
final class StatsViewModel: ObservableObject {
    @Published private(set) var totalWords = 0
    @Published private(set) var masteredWords = 0
    @Published private(set) var reviewWords = 0
    @Published private(set) var newWords = 0
    @Published private(set) var todayMasteredWords = 0
    @Published private(set) var todayAnswered = 0
    @Published private(set) var todayCorrect = 0
    @Published private(set) var todaySessions = 0
    @Published private(set) var streakDays = 0
    @Published private(set) var totalProjects = 0
    @Published private(set) var favoriteWords = 0
    @Published private(set) var wrongAnswersCount = 0
    @Published private(set) var masteryHistory: [MasteryDataPoint] = []
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "StatsVM")

    private static func masteryProxyDate(for word: Word) -> Date {
        word.lastReviewedAt ?? word.createdAt
    }

    private static func masteredWordCount(before endDate: Date, allWords: [Word]) -> Int {
        allWords.filter { word in
            guard word.status == .mastered else { return false }
            return masteryProxyDate(for: word) < endDate
        }.count
    }

    /// Build cumulative mastered word count for each of the last N days.
    /// Uses `lastReviewedAt` for mastered words to estimate when mastery was achieved,
    /// and `createdAt` for total word count growth.
    static func buildMasteryHistory(allWords: [Word], days: Int) -> [MasteryDataPoint] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let labelFormatter = DateFormatter()
        labelFormatter.dateFormat = "M/d"

        return (0..<days).reversed().map { offset in
            let date = calendar.date(byAdding: .day, value: -offset, to: today)!
            let endOfDay = calendar.date(byAdding: .day, value: 1, to: date)!

            // Words that existed by end of this day
            let totalByDay = allWords.filter { $0.createdAt < endOfDay }.count

            // Words mastered by end of this day
            let masteredByDay = masteredWordCount(before: endOfDay, allWords: allWords)

            return MasteryDataPoint(
                date: date,
                label: labelFormatter.string(from: date),
                mastered: masteredByDay,
                total: totalByDay
            )
        }
    }

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
            favoriteWords = allWords.filter { $0.isFavorite }.count

            let calendar = Calendar.current
            let todayStart = calendar.startOfDay(for: Date())
            let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: todayStart) ?? todayStart
            todayMasteredWords = max(
                0,
                Self.masteredWordCount(before: tomorrowStart, allWords: allWords)
                    - Self.masteredWordCount(before: todayStart, allWords: allWords)
            )

            let projects = try await state.activeRepository.fetchProjects(userId: state.activeUserId)
            totalProjects = projects.count

            if state.isLoggedIn {
                let today = state.quizStatsStore.todayStats()
                todayAnswered = today.totalAnswered
                todayCorrect = today.correctAnswered
                todaySessions = today.quizSessions
                streakDays = state.quizStatsStore.streakDays()
                wrongAnswersCount = today.totalAnswered - today.correctAnswered
            } else {
                todayMasteredWords = 0
                todayAnswered = 0
                todayCorrect = 0
                todaySessions = 0
                streakDays = 0
                wrongAnswersCount = 0
            }

            // Build mastery history (last 14 days)
            masteryHistory = Self.buildMasteryHistory(allWords: allWords, days: 14)

            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Stats load failed: \(error.localizedDescription)")
        }
    }
}
