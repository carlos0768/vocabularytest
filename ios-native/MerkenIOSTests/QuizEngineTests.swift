import XCTest
@testable import MerkenIOS

final class QuizEngineTests: XCTestCase {
    private func makeWord(
        english: String = "resilient",
        japanese: String = "回復力のある",
        distractors: [String] = ["弱い", "退屈な", "困難な"],
        status: WordStatus
    ) -> Word {
        Word(
            projectId: "p1",
            english: english,
            japanese: japanese,
            distractors: distractors,
            status: status
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
}
