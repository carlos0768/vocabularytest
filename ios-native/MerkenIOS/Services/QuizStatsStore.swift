import Foundation

final class QuizStatsStore: @unchecked Sendable {
    private let defaults: UserDefaults

    struct DailyStats: Codable, Sendable {
        var date: String
        var totalAnswered: Int
        var correctAnswered: Int
        var quizSessions: Int
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func record(totalAnswered: Int, correctAnswered: Int) {
        let dateKey = todayKey()
        var stats = loadStats(for: dateKey)
        stats.totalAnswered += totalAnswered
        stats.correctAnswered += correctAnswered
        stats.quizSessions += 1
        saveStats(stats, for: dateKey)
        updateStreak(dateKey: dateKey)
    }

    func todayStats() -> DailyStats {
        loadStats(for: todayKey())
    }

    func streakDays() -> Int {
        defaults.integer(forKey: "merken_quiz_streak")
    }

    func allStats(days: Int = 30) -> [DailyStats] {
        let calendar = Calendar.current
        let formatter = Self.dateFormatter
        let today = Date()

        return (0..<days).compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let key = formatter.string(from: date)
            let stats = loadStats(for: key)
            return stats.totalAnswered > 0 ? stats : nil
        }
    }

    // MARK: - Private

    private func todayKey() -> String {
        Self.dateFormatter.string(from: Date())
    }

    private func loadStats(for dateKey: String) -> DailyStats {
        guard let data = defaults.data(forKey: "merken_quiz_stats_\(dateKey)"),
              let stats = try? JSONDecoder().decode(DailyStats.self, from: data)
        else {
            return DailyStats(date: dateKey, totalAnswered: 0, correctAnswered: 0, quizSessions: 0)
        }
        return stats
    }

    private func saveStats(_ stats: DailyStats, for dateKey: String) {
        if let data = try? JSONEncoder().encode(stats) {
            defaults.set(data, forKey: "merken_quiz_stats_\(dateKey)")
        }
    }

    private func updateStreak(dateKey: String) {
        let lastActive = defaults.string(forKey: "merken_quiz_last_active") ?? ""
        let currentStreak = defaults.integer(forKey: "merken_quiz_streak")

        if lastActive == dateKey {
            return
        }

        let calendar = Calendar.current
        let formatter = Self.dateFormatter

        if let lastDate = formatter.date(from: lastActive),
           let today = formatter.date(from: dateKey) {
            let daysBetween = calendar.dateComponents([.day], from: lastDate, to: today).day ?? 0
            if daysBetween == 1 {
                defaults.set(currentStreak + 1, forKey: "merken_quiz_streak")
            } else if daysBetween > 1 {
                defaults.set(1, forKey: "merken_quiz_streak")
            }
        } else {
            defaults.set(1, forKey: "merken_quiz_streak")
        }

        defaults.set(dateKey, forKey: "merken_quiz_last_active")
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}
