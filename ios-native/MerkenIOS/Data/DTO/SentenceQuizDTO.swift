import Foundation

// MARK: - Request

struct SentenceQuizRequest: Encodable {
    let words: [SentenceQuizWordInput]
    let useVectorSearch: Bool
}

struct SentenceQuizWordInput: Encodable {
    let id: String
    let english: String
    let japanese: String
    let status: String
}

// MARK: - Response

struct SentenceQuizResponse: Decodable {
    let success: Bool
    let questions: [SentenceQuizQuestion]?
    let error: String?
}

// MARK: - Question types (discriminated union via "type")

enum SentenceQuizQuestion: Identifiable, Decodable {
    case fillInBlank(FillInBlankQuestion)
    case multiFillInBlank(MultiFillInBlankQuestion)
    case wordOrder(WordOrderQuestion)

    var id: String {
        switch self {
        case .fillInBlank(let q): return q.wordId
        case .multiFillInBlank(let q): return q.wordId
        case .wordOrder(let q): return q.wordId
        }
    }

    var wordId: String { id }

    private enum CodingKeys: String, CodingKey {
        case type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "fill-in-blank":
            self = .fillInBlank(try FillInBlankQuestion(from: decoder))
        case "multi-fill-in-blank":
            self = .multiFillInBlank(try MultiFillInBlankQuestion(from: decoder))
        case "word-order":
            self = .wordOrder(try WordOrderQuestion(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown question type: \(type)"
            )
        }
    }
}

// MARK: - Fill-in-blank (single blank)

struct FillInBlankQuestion: Identifiable, Decodable {
    let wordId: String
    let targetWord: String
    let sentence: String
    let blanks: [BlankSlot]
    let japaneseMeaning: String

    var id: String { wordId }

    /// Convenience: the first (and typically only) blank
    var primaryBlank: BlankSlot? { blanks.first }
}

struct BlankSlot: Decodable {
    let index: Int
    let correctAnswer: String
    let options: [String]
}

// MARK: - Multi-fill-in-blank (VectorDB enhanced, 3+ blanks)

struct MultiFillInBlankQuestion: Identifiable, Decodable {
    let wordId: String
    let targetWord: String
    let sentence: String
    let blanks: [EnhancedBlankSlot]
    let japaneseMeaning: String
    let relatedWordIds: [String]

    var id: String { wordId }

    /// Extract only the "target" blank to simplify to a single-answer question
    var targetBlank: EnhancedBlankSlot? {
        blanks.first { $0.source == "target" }
    }
}

struct EnhancedBlankSlot: Decodable {
    let index: Int
    let correctAnswer: String
    let options: [String]
    let source: String         // "target" | "vector-matched" | "llm-predicted" | "grammar"
    let sourceWordId: String?
    let similarity: Double?
}

// MARK: - Word-order

struct WordOrderQuestion: Identifiable, Decodable {
    let wordId: String
    let targetWord: String
    let shuffledWords: [String]
    let correctOrder: [String]
    let japaneseMeaning: String

    var id: String { wordId }
}
