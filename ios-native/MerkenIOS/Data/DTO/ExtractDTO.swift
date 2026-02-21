import Foundation

// MARK: - Scan Mode

enum ScanMode: String, CaseIterable, Identifiable {
    case all
    case circled
    case highlighted
    case eiken
    case idiom
    case wrong

    var id: String { rawValue }

    var requiresPro: Bool { self != .all }

    var displayName: String {
        switch self {
        case .all: return "すべての単語"
        case .circled: return "丸をつけた単語"
        case .highlighted: return "マーカーの単語"
        case .eiken: return "英検レベル指定"
        case .idiom: return "熟語・フレーズ"
        case .wrong: return "間違えた単語"
        }
    }

    var subtitle: String {
        switch self {
        case .all: return "写真内の英単語をすべて抽出"
        case .circled: return "手書きで丸をつけた単語のみ"
        case .highlighted: return "蛍光マーカーの単語のみ"
        case .eiken: return "指定した英検級の単語のみ"
        case .idiom: return "イディオム・熟語を抽出"
        case .wrong: return "テストで間違えた単語のみ"
        }
    }

    var iconName: String {
        switch self {
        case .all: return "doc.text.magnifyingglass"
        case .circled: return "circle"
        case .highlighted: return "highlighter"
        case .eiken: return "graduationcap"
        case .idiom: return "text.book.closed"
        case .wrong: return "xmark.circle"
        }
    }
}

// MARK: - EIKEN Level

enum EikenLevel: String, CaseIterable, Identifiable {
    case grade5 = "5"
    case grade4 = "4"
    case grade3 = "3"
    case pre2 = "pre2"
    case grade2 = "2"
    case pre1 = "pre1"
    case grade1 = "1"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .grade5: return "5級"
        case .grade4: return "4級"
        case .grade3: return "3級"
        case .pre2: return "準2級"
        case .grade2: return "2級"
        case .pre1: return "準1級"
        case .grade1: return "1級"
        }
    }
}

// MARK: - API Request

struct ExtractRequest: Encodable {
    let image: String
    let mode: String
    let eikenLevel: String?

    enum CodingKeys: String, CodingKey {
        case image, mode, eikenLevel
    }
}

// MARK: - API Response

struct ExtractResponse: Decodable {
    let success: Bool
    let words: [ExtractedWord]?
    let error: String?
}

struct ExtractedWord: Decodable, Identifiable {
    let id: String
    let english: String
    let japanese: String
    let distractors: [String]

    enum CodingKeys: String, CodingKey {
        case id, english, japanese, distractors
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = (try? container.decode(String.self, forKey: .id)) ?? UUID().uuidString
        self.english = try container.decode(String.self, forKey: .english)
        self.japanese = try container.decode(String.self, forKey: .japanese)
        self.distractors = (try? container.decode([String].self, forKey: .distractors)) ?? []
    }

    init(id: String, english: String, japanese: String, distractors: [String]) {
        self.id = id
        self.english = english
        self.japanese = japanese
        self.distractors = distractors
    }
}

// MARK: - Editable Wrapper

struct EditableExtractedWord: Identifiable {
    let id: String
    var english: String
    var japanese: String
    var distractors: [String]

    init(from extracted: ExtractedWord) {
        self.id = extracted.id
        self.english = extracted.english
        self.japanese = extracted.japanese
        self.distractors = extracted.distractors
    }

    init(id: String = UUID().uuidString, english: String, japanese: String, distractors: [String] = []) {
        self.id = id
        self.english = english
        self.japanese = japanese
        self.distractors = distractors
    }
}
