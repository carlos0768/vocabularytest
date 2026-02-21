import Foundation

enum QuizEngine {
    private static let maxChoiceLength = 96

    static func generateQuestions(words: [Word], count: Int) -> [QuizQuestion] {
        guard !words.isEmpty, count > 0 else { return [] }

        let normalizedWords = words.filter { !normalizedChoice($0.japanese).isEmpty }
        guard !normalizedWords.isEmpty else { return [] }

        let prioritized = normalizedWords
            .filter { $0.status != .mastered }
            .shuffled()
            + normalizedWords.filter { $0.status == .mastered }.shuffled()

        let selected = Array(prioritized.prefix(min(count, prioritized.count)))
        let pool = deduplicatedChoices(normalizedWords.map { normalizedChoice($0.japanese) })

        var sequenceCounter = 0
        return selected.compactMap { word -> QuizQuestion? in
            let correct = normalizedChoice(word.japanese)
            guard !correct.isEmpty else { return nil }

            var distractors: [String] = []
            var seen = Set<String>()

            func appendDistractor(_ value: String) {
                let normalized = normalizedChoice(value)
                guard !normalized.isEmpty, normalized != correct else { return }
                guard seen.insert(normalized).inserted else { return }
                distractors.append(normalized)
            }

            for candidate in word.distractors {
                appendDistractor(candidate)
                if distractors.count == 3 {
                    break
                }
            }

            if distractors.count < 3, !pool.isEmpty {
                var attempts = 0
                while distractors.count < 3 && attempts < 24 {
                    attempts += 1
                    if let candidate = pool.randomElement() {
                        appendDistractor(candidate)
                    }
                }
            }

            if distractors.count < 3 {
                for candidate in pool where distractors.count < 3 {
                    appendDistractor(candidate)
                }
            }

            guard !distractors.isEmpty else { return nil }

            let maxOtherChoices = min(3, distractors.count)
            let options = ([correct] + Array(distractors.prefix(maxOtherChoices))).shuffled()
            guard let correctIndex = options.firstIndex(of: correct) else { return nil }

            let index = sequenceCounter
            sequenceCounter += 1
            return QuizQuestion(sequenceIndex: index, word: word, options: options, correctIndex: correctIndex)
        }
    }

    static func nextStatus(current: WordStatus, isCorrect: Bool) -> WordStatus {
        guard isCorrect else {
            if current == .mastered { return .review }
            return current
        }

        switch current {
        case .new:
            return .review
        case .review:
            return .mastered
        case .mastered:
            return .mastered
        }
    }

    static func statusPatch(for current: Word, isCorrect: Bool) -> WordPatch {
        let newStatus = nextStatus(current: current.status, isCorrect: isCorrect)
        let now = Date()

        if isCorrect {
            switch newStatus {
            case .review:
                return WordPatch(
                    status: .review,
                    lastReviewedAt: .some(now),
                    nextReviewAt: .some(Calendar.current.date(byAdding: .day, value: 1, to: now))
                )
            case .mastered:
                return WordPatch(
                    status: .mastered,
                    lastReviewedAt: .some(now),
                    nextReviewAt: .some(Calendar.current.date(byAdding: .day, value: 6, to: now))
                )
            case .new:
                return WordPatch(status: .new)
            }
        } else {
            return WordPatch(
                status: newStatus,
                lastReviewedAt: .some(now),
                nextReviewAt: .some(Calendar.current.date(byAdding: .day, value: 1, to: now))
            )
        }
    }

    private static func normalizedChoice(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        let collapsed = trimmed.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard collapsed.count > maxChoiceLength else { return collapsed }

        let endIndex = collapsed.index(collapsed.startIndex, offsetBy: maxChoiceLength)
        return String(collapsed[..<endIndex]) + "..."
    }

    private static func deduplicatedChoices(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values.map(normalizedChoice).filter({ !$0.isEmpty }) {
            if seen.insert(value).inserted {
                result.append(value)
            }
        }
        return result
    }
}
