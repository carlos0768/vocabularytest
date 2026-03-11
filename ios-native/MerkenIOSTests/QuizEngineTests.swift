import XCTest
@testable import MerkenIOS

final class QuizEngineTests: XCTestCase {
    private func makeWord(
        english: String = "resilient",
        japanese: String = "回復力のある",
        distractors: [String] = ["弱い", "退屈な", "困難な"],
        status: WordStatus,
        lastReviewedAt: Date? = nil,
        nextReviewAt: Date? = nil,
        easeFactor: Double = 2.5,
        intervalDays: Int = 0,
        repetition: Int = 0
    ) -> Word {
        Word(
            projectId: "p1",
            english: english,
            japanese: japanese,
            distractors: distractors,
            status: status,
            lastReviewedAt: lastReviewedAt,
            nextReviewAt: nextReviewAt,
            easeFactor: easeFactor,
            intervalDays: intervalDays,
            repetition: repetition
        )
    }

    func testStatusTransitionFromNewToReviewOnCorrect() {
        XCTAssertEqual(QuizEngine.nextStatus(current: .new, isCorrect: true), .review)
    }

    func testStatusTransitionFromReviewToMasteredOnCorrect() {
        XCTAssertEqual(QuizEngine.nextStatus(current: .review, isCorrect: true), .mastered)
    }

    func testStatusTransitionFromMasteredToReviewOnWrong() {
        XCTAssertEqual(QuizEngine.nextStatus(current: .mastered, isCorrect: false), .review)
    }

    func testStatusAfterGradeTreatsQualityTwoAsFailure() {
        XCTAssertEqual(QuizEngine.statusAfterGrade(current: .new, quality: 2), .new)
        XCTAssertEqual(QuizEngine.statusAfterGrade(current: .review, quality: 2), .new)
        XCTAssertEqual(QuizEngine.statusAfterGrade(current: .mastered, quality: 2), .review)
    }

    func testStatusPatchForMatchKeepsMasteredWordOnCleanMatch() {
        let word = makeWord(status: .mastered, easeFactor: 2.5, intervalDays: 6, repetition: 2)

        let patch = QuizEngine.statusPatchForMatch(for: word, mismatchCount: 0)

        XCTAssertEqual(patch.status, .mastered)
        XCTAssertEqual(patch.intervalDays, 15)
        XCTAssertEqual(patch.repetition, 3)
    }

    func testStatusPatchForMatchPenalizesMismatchedWord() {
        let word = makeWord(status: .review, easeFactor: 2.5, intervalDays: 6, repetition: 2)

        let patch = QuizEngine.statusPatchForMatch(for: word, mismatchCount: 1)

        XCTAssertEqual(patch.status, .new)
        XCTAssertEqual(patch.intervalDays, 1)
        XCTAssertEqual(patch.repetition, 0)
    }

    func testGenerateQuestionContainsCorrectAnswer() {
        let questions = QuizEngine.generateQuestions(words: [makeWord(status: .new)], count: 1)
        XCTAssertEqual(questions.count, 1)
        guard let question = questions.first else {
            XCTFail("question missing")
            return
        }
        XCTAssertTrue(question.options.contains("回復力のある"))
        XCTAssertEqual(question.options[question.correctIndex], "回復力のある")
    }

    func testGenerateQuestionsFallsBackToOtherWordsWhenDistractorsAreMissing() {
        let words = [
            makeWord(english: "resilient", japanese: "回復力のある", distractors: [], status: .new),
            makeWord(english: "vivid", japanese: "鮮やかな", distractors: [], status: .new),
            makeWord(english: "fragile", japanese: "壊れやすい", distractors: [], status: .new)
        ]

        let questions = QuizEngine.generateQuestions(words: words, count: 2)
        XCTAssertEqual(questions.count, 2)

        for question in questions {
            XCTAssertGreaterThanOrEqual(question.options.count, 2)
            XCTAssertLessThanOrEqual(question.options.count, 4)
            XCTAssertTrue(question.options.contains(question.word.japanese))
            XCTAssertEqual(question.options[question.correctIndex], question.word.japanese)
        }
    }

    func testGenerateQuestionsReturnsEmptyWhenOnlyOneChoiceExists() {
        let words = [
            makeWord(english: "solo", japanese: "唯一の", distractors: [], status: .new)
        ]

        let questions = QuizEngine.generateQuestions(words: words, count: 1)
        XCTAssertTrue(questions.isEmpty)
    }

    func testWordsDueForReviewIncludesWordWhenNextReviewAtIsPast() {
        let now = Date()
        let words = [
            makeWord(
                english: "past",
                status: .mastered,
                nextReviewAt: now.addingTimeInterval(-60)
            )
        ]

        let dueWords = QuizEngine.wordsDueForReview(words, now: now)
        XCTAssertEqual(dueWords.count, 1)
        XCTAssertEqual(dueWords.first?.english, "past")
    }

    func testWordsDueForReviewExcludesWordWhenNextReviewAtIsFuture() {
        let now = Date()
        let words = [
            makeWord(
                english: "future",
                status: .review,
                nextReviewAt: now.addingTimeInterval(60)
            )
        ]

        let dueWords = QuizEngine.wordsDueForReview(words, now: now)
        XCTAssertTrue(dueWords.isEmpty)
    }

    func testWordsDueForReviewExcludesBrandNewWordWithoutReviewDates() {
        let words = [
            makeWord(
                english: "brand-new",
                status: .new,
                lastReviewedAt: nil,
                nextReviewAt: nil
            )
        ]

        let dueWords = QuizEngine.wordsDueForReview(words)
        XCTAssertTrue(dueWords.isEmpty)
    }

    func testWordsDueForReviewIncludesWordWithoutNextReviewWhenStatusIsNotNew() {
        let words = [
            makeWord(english: "review-word", status: .review, nextReviewAt: nil),
            makeWord(english: "mastered-word", status: .mastered, nextReviewAt: nil)
        ]

        let dueWords = QuizEngine.wordsDueForReview(words)
        XCTAssertEqual(dueWords.count, 2)
        XCTAssertTrue(dueWords.contains { $0.english == "review-word" })
        XCTAssertTrue(dueWords.contains { $0.english == "mastered-word" })
    }

    func testWordsDueForReviewIncludesNewWordWhenLastReviewedAtExists() {
        let now = Date()
        let words = [
            makeWord(
                english: "reviewed-new",
                status: .new,
                lastReviewedAt: now.addingTimeInterval(-120),
                nextReviewAt: nil
            )
        ]

        let dueWords = QuizEngine.wordsDueForReview(words, now: now)
        XCTAssertEqual(dueWords.count, 1)
        XCTAssertEqual(dueWords.first?.english, "reviewed-new")
    }
}
