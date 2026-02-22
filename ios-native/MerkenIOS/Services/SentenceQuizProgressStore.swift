import Foundation

struct SentenceQuizProgressSnapshot: Sendable {
    let questions: [SentenceQuizQuestion]
    let currentIndex: Int
    let correctCount: Int
    let totalCount: Int
}

final class SentenceQuizProgressStore {
    private struct StoredProgress: Codable {
        let questionsData: Data
        var currentIndex: Int
        var correctCount: Int
        var totalCount: Int
        var savedAt: TimeInterval
    }

    private let defaults: UserDefaults
    private let ttl: TimeInterval
    private let nowProvider: () -> Date
    private let keyPrefix = "merken_sentence_quiz_progress_"

    init(
        defaults: UserDefaults = .standard,
        ttl: TimeInterval = 60 * 60,
        nowProvider: @escaping () -> Date = Date.init
    ) {
        self.defaults = defaults
        self.ttl = ttl
        self.nowProvider = nowProvider
    }

    func saveInitial(projectId: String, rawResponseData: Data) {
        guard let questionsData = extractQuestionsData(from: rawResponseData) else { return }

        let record = StoredProgress(
            questionsData: questionsData,
            currentIndex: 0,
            correctCount: 0,
            totalCount: 0,
            savedAt: nowProvider().timeIntervalSince1970
        )
        save(record, for: projectId)
    }

    func restore(projectId: String) -> SentenceQuizProgressSnapshot? {
        guard var record = load(for: projectId) else { return nil }

        if isExpired(savedAt: record.savedAt) {
            clear(projectId: projectId)
            return nil
        }

        let decoder = JSONDecoder()
        guard let questions = try? decoder.decode([SentenceQuizQuestion].self, from: record.questionsData), !questions.isEmpty else {
            clear(projectId: projectId)
            return nil
        }

        // Align with Web behavior: touching progress keeps it fresh for 1 hour.
        record.savedAt = nowProvider().timeIntervalSince1970
        save(record, for: projectId)

        return SentenceQuizProgressSnapshot(
            questions: questions,
            currentIndex: max(0, min(record.currentIndex, max(questions.count - 1, 0))),
            correctCount: max(0, record.correctCount),
            totalCount: max(0, record.totalCount)
        )
    }

    func saveProgress(
        projectId: String,
        currentIndex: Int,
        correct: Int,
        total: Int
    ) {
        guard var record = load(for: projectId) else { return }
        if isExpired(savedAt: record.savedAt) {
            clear(projectId: projectId)
            return
        }

        record.currentIndex = max(0, currentIndex)
        record.correctCount = max(0, correct)
        record.totalCount = max(0, total)
        record.savedAt = nowProvider().timeIntervalSince1970
        save(record, for: projectId)
    }

    func clear(projectId: String) {
        defaults.removeObject(forKey: key(for: projectId))
    }

    func hasInProgress(projectId: String) -> Bool {
        guard let record = load(for: projectId) else { return false }
        if isExpired(savedAt: record.savedAt) {
            clear(projectId: projectId)
            return false
        }
        return record.currentIndex > 0
    }

    private func key(for projectId: String) -> String {
        "\(keyPrefix)\(projectId)"
    }

    private func load(for projectId: String) -> StoredProgress? {
        guard let data = defaults.data(forKey: key(for: projectId)) else { return nil }
        return try? JSONDecoder().decode(StoredProgress.self, from: data)
    }

    private func save(_ record: StoredProgress, for projectId: String) {
        guard let data = try? JSONEncoder().encode(record) else { return }
        defaults.set(data, forKey: key(for: projectId))
    }

    private func isExpired(savedAt: TimeInterval) -> Bool {
        nowProvider().timeIntervalSince1970 - savedAt > ttl
    }

    private func extractQuestionsData(from rawResponseData: Data) -> Data? {
        guard
            let jsonObject = try? JSONSerialization.jsonObject(with: rawResponseData) as? [String: Any],
            let questions = jsonObject["questions"],
            JSONSerialization.isValidJSONObject(questions)
        else {
            return nil
        }

        return try? JSONSerialization.data(withJSONObject: questions, options: [])
    }
}
