import Foundation
import OSLog

struct MasteryDataPoint: Identifiable {
    let date: Date
    let label: String   // "3/1" style
    let mastered: Int
    let total: Int

    var id: Date { date }
}

struct WeeklyAccuracyDay: Identifiable {
    let date: Date
    let label: String
    let accuracy: Double
    let answered: Int
    let correct: Int

    var id: Date { date }
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
    @Published private(set) var weeklyAccuracy: [WeeklyAccuracyDay] = []
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

    /// Build daily mastered word count for each of the last 7 days.
    static func buildMasteryHistory(allWords: [Word], days: Int = 7) -> [MasteryDataPoint] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "ja_JP")
        let today = calendar.startOfDay(for: Date())
        let weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"]

        return (0..<days).reversed().map { offset in
            let date = calendar.date(byAdding: .day, value: -offset, to: today)!
            let endOfDay = calendar.date(byAdding: .day, value: 1, to: date)!

            // Daily mastered count: words mastered on this specific day
            let dailyMastered = allWords.filter { word in
                guard word.status == .mastered else { return false }
                let proxyDate = masteryProxyDate(for: word)
                return proxyDate >= date && proxyDate < endOfDay
            }.count

            // Total words that existed by end of this day
            let cumulativeTotal = allWords.filter { word in
                return word.createdAt < endOfDay
            }.count

            let weekdayIndex = calendar.component(.weekday, from: date) - 1
            let label = weekdayLabels[weekdayIndex]

            return MasteryDataPoint(
                date: date,
                label: label,
                mastered: dailyMastered,
                total: cumulativeTotal
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

    private static func buildWeeklyAccuracy(from store: QuizStatsStore) -> [WeeklyAccuracyDay] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "ja_JP")
        let keyFormatter = DateFormatter()
        keyFormatter.calendar = calendar
        keyFormatter.locale = Locale(identifier: "en_US_POSIX")
        keyFormatter.dateFormat = "yyyy-MM-dd"

        let today = calendar.startOfDay(for: Date())
        let weekday = calendar.component(.weekday, from: today)
        let daysFromMonday = (weekday + 5) % 7
        let startOfWeek = calendar.date(byAdding: .day, value: -daysFromMonday, to: today) ?? today

        let statsByDay = Dictionary(
            uniqueKeysWithValues: store.allStats(days: 14).map { stats in
                (stats.date, stats)
            }
        )

        let labels = ["月", "火", "水", "木", "金", "土", "日"]

        return (0..<7).map { index in
            let date = calendar.date(byAdding: .day, value: index, to: startOfWeek) ?? today
            let stats = statsByDay[keyFormatter.string(from: date)]
            let answered = stats?.totalAnswered ?? 0
            let correct = stats?.correctAnswered ?? 0
            let accuracy = answered > 0 ? Double(correct) / Double(answered) : 0
            return WeeklyAccuracyDay(
                date: date,
                label: labels[index],
                accuracy: accuracy,
                answered: answered,
                correct: correct
            )
        }
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
                weeklyAccuracy = Self.buildWeeklyAccuracy(from: state.quizStatsStore)
            } else {
                todayMasteredWords = 0
                todayAnswered = 0
                todayCorrect = 0
                todaySessions = 0
                streakDays = 0
                wrongAnswersCount = 0
                weeklyAccuracy = []
            }

            // Build mastery history (last 7 days)
            masteryHistory = Self.buildMasteryHistory(allWords: allWords)

            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Stats load failed: \(error.localizedDescription)")
        }
    }
}
