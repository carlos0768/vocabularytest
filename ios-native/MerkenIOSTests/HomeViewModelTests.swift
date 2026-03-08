import XCTest
@testable import MerkenIOS

@MainActor
final class HomeViewModelTests: XCTestCase {
    private func makeWord(
        english: String,
        tags: [String]?,
        status: WordStatus = .review
    ) -> Word {
        Word(
            projectId: "p1",
            english: english,
            japanese: "意味",
            distractors: ["a", "b", "c"],
            partOfSpeechTags: tags,
            status: status
        )
    }

    func testReviewPartOfSpeechCountsNormalizesAndAggregatesCategories() {
        let words = [
            makeWord(english: "approval", tags: ["noun"]),
            makeWord(english: "counterpart", tags: ["名詞"]),
            makeWord(english: "look up to", tags: ["idiom"]),
            makeWord(english: "vivid", tags: ["adjective"]),
            makeWord(english: "mystery", tags: nil),
        ]

        let counts = HomeViewModel.reviewPartOfSpeechCounts(for: words)

        XCTAssertEqual(counts.map(\.label), ["名詞", "イディオム", "形容詞", "その他"])
        XCTAssertEqual(counts.map(\.count), [2, 1, 1, 1])
    }

    func testReviewPartOfSpeechCountsFallsBackToOtherForUnknownTags() {
        let words = [
            makeWord(english: "alpha", tags: ["unknown_tag"]),
            makeWord(english: "beta", tags: ["その他"]),
        ]

        let counts = HomeViewModel.reviewPartOfSpeechCounts(for: words)

        XCTAssertEqual(counts.count, 1)
        XCTAssertEqual(counts.first?.label, "その他")
        XCTAssertEqual(counts.first?.count, 2)
    }

    func testTopHomePartOfSpeechWidgetsUsesMostCommonCategoriesFirst() {
        let words = [
            makeWord(english: "run", tags: ["verb"], status: .mastered),
            makeWord(english: "build", tags: ["verb"]),
            makeWord(english: "carry", tags: ["verb"]),
            makeWord(english: "approval", tags: ["noun"], status: .mastered),
            makeWord(english: "counterpart", tags: ["noun"]),
            makeWord(english: "vivid", tags: ["adjective"], status: .mastered),
            makeWord(english: "gentle", tags: ["adjective"]),
            makeWord(english: "look up to", tags: ["idiom"]),
            makeWord(english: "mystery", tags: nil),
        ]

        let widgets = HomeViewModel.topHomePartOfSpeechWidgets(for: words)

        XCTAssertEqual(widgets.map(\.label), ["動詞", "名詞", "形容詞"])
        XCTAssertEqual(widgets.map(\.totalCount), [3, 2, 2])
        XCTAssertEqual(widgets.map(\.masteredCount), [1, 1, 1])
    }

    func testTopHomePartOfSpeechWidgetsFallsBackToOtherWhenNoTagsExist() {
        let words = [
            makeWord(english: "alpha", tags: nil, status: .mastered),
            makeWord(english: "beta", tags: nil),
        ]

        let widgets = HomeViewModel.topHomePartOfSpeechWidgets(for: words)

        XCTAssertEqual(widgets.count, 1)
        XCTAssertEqual(widgets.first?.label, "その他")
        XCTAssertEqual(widgets.first?.totalCount, 2)
        XCTAssertEqual(widgets.first?.masteredCount, 1)
    }
}
