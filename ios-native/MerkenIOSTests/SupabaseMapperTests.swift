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
          "is_favorite": true
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
}
