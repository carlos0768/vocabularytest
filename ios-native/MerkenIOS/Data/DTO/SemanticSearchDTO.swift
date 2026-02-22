import Foundation

// MARK: - Semantic Search API Response

struct SemanticSearchResponse: Decodable {
    let results: [SemanticSearchResult]
}

struct SemanticSearchResult: Decodable {
    let id: String
    let english: String
    let japanese: String
    let projectId: String
    let projectTitle: String
    let similarity: Int
}
