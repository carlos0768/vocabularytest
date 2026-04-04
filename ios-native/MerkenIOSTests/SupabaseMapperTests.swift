import XCTest
@testable import MerkenIOS

final class SupabaseMapperTests: XCTestCase {
    func testProjectDTODecodeAndMap() throws {
        let json = """
        {
          "id": "p1",
          "user_id": "u1",
          "title": "TOEFL",
          "icon_image": null,
          "created_at": "2026-02-21T10:00:00.000Z",
          "share_id": null,
          "is_favorite": true,
          "source_labels": ["鉄壁", "ノート"]
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .supabaseISO8601

        let dto = try decoder.decode(ProjectDTO.self, from: json)
        let project = SupabaseMapper.project(from: dto)

        XCTAssertEqual(project.id, "p1")
        XCTAssertEqual(project.userId, "u1")
        XCTAssertEqual(project.title, "TOEFL")
        XCTAssertTrue(project.isFavorite)
        XCTAssertEqual(project.sourceLabels, ["鉄壁", "ノート"])
    }

    func testWordDTODecodeAndMap() throws {
        let json = """
        {
          "id": "w1",
          "project_id": "p1",
          "english": "resilient",
          "japanese": "回復力のある",
          "distractors": ["弱い", "遅い", "短い"],
          "example_sentence": "She is resilient.",
          "example_sentence_ja": "彼女は回復力がある。",
          "pronunciation": "/rɪˈzɪliənt/",
          "status": "review",
          "created_at": "2026-02-21T10:00:00.000Z",
          "last_reviewed_at": null,
          "next_review_at": null,
          "ease_factor": 2.5,
          "interval_days": 1,
          "repetition": 1,
          "is_favorite": false
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .supabaseISO8601

        let dto = try decoder.decode(WordDTO.self, from: json)
        let word = SupabaseMapper.word(from: dto)

        XCTAssertEqual(word.id, "w1")
        XCTAssertEqual(word.projectId, "p1")
        XCTAssertEqual(word.status, .review)
        XCTAssertEqual(word.distractors.count, 3)
    }

    func testWordDTODecodeWhenDistractorsKeyMissingUsesEmptyArray() throws {
        let json = """
        {
          "id": "w1",
          "project_id": "p1",
          "english": "run",
          "japanese": "走る",
          "status": "new",
          "created_at": "2026-02-21T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .supabaseISO8601

        let dto = try decoder.decode(WordDTO.self, from: json)
        let word = SupabaseMapper.word(from: dto)

        XCTAssertEqual(word.distractors, [])
        XCTAssertEqual(word.status, .new)
    }

    func testWordDTODecodeFromCamelCaseJSONWithoutDistractors() throws {
        let json = """
        {
          "id": "w1",
          "projectId": "p1",
          "english": "run",
          "japanese": "走る",
          "status": "new",
          "createdAt": "2026-02-21T10:00:00.000Z",
          "easeFactor": 2.5,
          "intervalDays": 0,
          "repetition": 0,
          "isFavorite": false
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .supabaseISO8601

        let dto = try decoder.decode(WordDTO.self, from: json)
        XCTAssertTrue(dto.distractors.isEmpty)
    }

    func testExtractedWordDecodesExamplesWhenPresent() throws {
        let json = """
        {
          "success": true,
          "sourceLabels": ["鉄壁", "ノート"],
          "words": [
            {
              "id": "w1",
              "english": "resilient",
              "japanese": "回復力のある",
              "distractors": ["弱い", "脆い", "遅い"],
              "partOfSpeechTags": ["adjective"],
              "exampleSentence": "She stayed resilient during the crisis.",
              "exampleSentenceJa": "彼女は危機の中でも回復力を保った。"
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(ExtractResponse.self, from: json)
        let word = try XCTUnwrap(response.words?.first)

        XCTAssertEqual(word.exampleSentence, "She stayed resilient during the crisis.")
        XCTAssertEqual(word.exampleSentenceJa, "彼女は危機の中でも回復力を保った。")
        XCTAssertEqual(word.partOfSpeechTags ?? [], ["adjective"])
        XCTAssertEqual(response.sourceLabels ?? [], ["鉄壁", "ノート"])
    }

    func testExtractedWordDecodesExamplesAsNilWhenMissing() throws {
        let json = """
        {
          "success": true,
          "words": [
            {
              "id": "w1",
              "english": "resilient",
              "japanese": "回復力のある",
              "distractors": ["弱い", "脆い", "遅い"]
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(ExtractResponse.self, from: json)
        let word = try XCTUnwrap(response.words?.first)

        XCTAssertNil(word.exampleSentence)
        XCTAssertNil(word.exampleSentenceJa)
    }
}

@MainActor
final class ScanBatchProcessingTests: XCTestCase {
    func testDedupeWordsUsesEnglishAndJapaneseKeyWithNormalization() {
        let words = [
            ExtractedWord(
                id: "first-id",
                english: "  RESILIENT ",
                japanese: " 回復力のある  ",
                distractors: ["弱い", "遅い"],
                partOfSpeechTags: ["adjective"],
                exampleSentence: nil,
                exampleSentenceJa: nil
            ),
            ExtractedWord(
                id: "second-id",
                english: "resilient",
                japanese: "回復力のある",
                distractors: ["脆い", "弱い"],
                partOfSpeechTags: ["形容詞", "adjective"],
                exampleSentence: "She is resilient.",
                exampleSentenceJa: "彼女は回復力がある。"
            ),
            ExtractedWord(
                id: "third-id",
                english: "fragile",
                japanese: "壊れやすい",
                distractors: ["丈夫な"],
                exampleSentence: nil,
                exampleSentenceJa: nil
            )
        ]

        let deduped = ScanCoordinatorViewModel.dedupeWords(words)

        XCTAssertEqual(deduped.count, 2)
        XCTAssertEqual(deduped[0].id, "first-id")
        XCTAssertEqual(deduped[0].english, "RESILIENT")
        XCTAssertEqual(deduped[0].japanese, "回復力のある")
        XCTAssertEqual(deduped[0].exampleSentence, "She is resilient.")
        XCTAssertEqual(deduped[0].exampleSentenceJa, "彼女は回復力がある。")
        XCTAssertEqual(deduped[0].partOfSpeechTags ?? [], ["adjective", "形容詞"])
    }

    func testDedupeWordsMergesDistractorsUniquelyWithMaxThree() {
        let words = [
            ExtractedWord(
                id: "w1",
                english: "resilient",
                japanese: "回復力のある",
                distractors: ["弱い", "速い", "弱い"],
                exampleSentence: nil,
                exampleSentenceJa: nil
            ),
            ExtractedWord(
                id: "w2",
                english: "resilient",
                japanese: "回復力のある",
                distractors: ["遅い", "短い", "弱い"],
                exampleSentence: nil,
                exampleSentenceJa: nil
            )
        ]

        let deduped = ScanCoordinatorViewModel.dedupeWords(words)
        XCTAssertEqual(deduped.count, 1)
        XCTAssertEqual(deduped[0].distractors, ["弱い", "速い", "遅い"])
    }

    func testDedupeWordsPrefersFirstNonEmptyExampleSentence() {
        let words = [
            ExtractedWord(
                id: "w1",
                english: "vivid",
                japanese: "鮮やかな",
                distractors: [],
                exampleSentence: nil,
                exampleSentenceJa: nil
            ),
            ExtractedWord(
                id: "w2",
                english: "vivid",
                japanese: "鮮やかな",
                distractors: [],
                exampleSentence: "A vivid memory remains.",
                exampleSentenceJa: "鮮明な記憶が残る。"
            ),
            ExtractedWord(
                id: "w3",
                english: "vivid",
                japanese: "鮮やかな",
                distractors: [],
                exampleSentence: "This sentence should not override.",
                exampleSentenceJa: "この訳は上書きされない。"
            )
        ]

        let deduped = ScanCoordinatorViewModel.dedupeWords(words)
        XCTAssertEqual(deduped.count, 1)
        XCTAssertEqual(deduped[0].exampleSentence, "A vivid memory remains.")
        XCTAssertEqual(deduped[0].exampleSentenceJa, "鮮明な記憶が残る。")
    }

    func testMakeProcessingSummaryCountsSuccessFailedSkipped() {
        let pages = [
            ScanPageProgress(pageIndex: 1, status: .success, message: nil, extractedCount: 12),
            ScanPageProgress(pageIndex: 2, status: .failed, message: "通信エラー", extractedCount: 0),
            ScanPageProgress(pageIndex: 3, status: .skippedLimit, message: "上限到達", extractedCount: 0),
            ScanPageProgress(pageIndex: 4, status: .pending, message: nil, extractedCount: 0)
        ]

        let summary = ScanCoordinatorViewModel.makeProcessingSummary(
            from: pages,
            warnings: ["ページ2: 通信エラー", "ページ2: 通信エラー"],
            extractedWordCount: 12,
            dedupedWordCount: 10
        )

        XCTAssertEqual(summary.total, 4)
        XCTAssertEqual(summary.successPages, 1)
        XCTAssertEqual(summary.failedPages, 1)
        XCTAssertEqual(summary.skippedPages, 1)
        XCTAssertEqual(summary.extractedWordCount, 12)
        XCTAssertEqual(summary.dedupedWordCount, 10)
        XCTAssertTrue(summary.warnings.contains("ページ2: 通信エラー"))
        XCTAssertTrue(summary.warnings.contains("上限到達のため1ページをスキップしました。"))
    }
}
