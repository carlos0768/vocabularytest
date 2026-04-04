import Foundation

struct ProjectDTO: Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let iconImage: String?
    let createdAt: Date
    let shareId: String?
    let shareScope: ProjectShareScope?
    let isFavorite: Bool?
    let sourceLabels: [String]?
}

struct WordDTO: Codable, Sendable {
    let id: String
    let projectId: String
    let english: String
    let japanese: String
    let distractors: [String]
    let exampleSentence: String?
    let exampleSentenceJa: String?
    let pronunciation: String?
    let partOfSpeechTags: [String]?
    let relatedWords: [RelatedWord]?
    let usagePatterns: [UsagePattern]?
    let insightsGeneratedAt: Date?
    let insightsVersion: Int?
    let status: String
    let createdAt: Date
    let lastReviewedAt: Date?
    let nextReviewAt: Date?
    let easeFactor: Double?
    let intervalDays: Int?
    let repetition: Int?
    let isFavorite: Bool?
    let vocabularyType: String?

    private enum CodingKeys: String, CodingKey {
        case id, projectId, english, japanese, distractors, exampleSentence, exampleSentenceJa
        case pronunciation, partOfSpeechTags, relatedWords, usagePatterns
        case insightsGeneratedAt, insightsVersion, status, createdAt, lastReviewedAt, nextReviewAt
        case easeFactor, intervalDays, repetition, isFavorite, vocabularyType
    }

    /// Tolerates Int, Double, or numeric String from PostgREST / legacy JSON (matches web row normalization).
    private static func decodeLossyInt(from c: KeyedDecodingContainer<CodingKeys>, forKey key: CodingKeys) -> Int? {
        if let v = try? c.decodeIfPresent(Int.self, forKey: key) { return v }
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return Int(d) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key) { return Int(s) }
        return nil
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = try c.decode(String.self, forKey: .projectId)
        english = try c.decode(String.self, forKey: .english)
        japanese = try c.decode(String.self, forKey: .japanese)
        distractors = (try? c.decodeIfPresent([String].self, forKey: .distractors)) ?? []
        exampleSentence = try c.decodeIfPresent(String.self, forKey: .exampleSentence)
        exampleSentenceJa = try c.decodeIfPresent(String.self, forKey: .exampleSentenceJa)
        pronunciation = try c.decodeIfPresent(String.self, forKey: .pronunciation)
        // JSONB / legacy shapes: skip bad payloads instead of failing the whole row (align with shared/db/mappers.ts)
        partOfSpeechTags = try? c.decodeIfPresent([String].self, forKey: .partOfSpeechTags)
        relatedWords = try? c.decodeIfPresent([RelatedWord].self, forKey: .relatedWords)
        usagePatterns = try? c.decodeIfPresent([UsagePattern].self, forKey: .usagePatterns)
        insightsGeneratedAt = try? c.decodeIfPresent(Date.self, forKey: .insightsGeneratedAt)
        insightsVersion = Self.decodeLossyInt(from: c, forKey: .insightsVersion)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "new"
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        lastReviewedAt = try? c.decodeIfPresent(Date.self, forKey: .lastReviewedAt)
        nextReviewAt = try? c.decodeIfPresent(Date.self, forKey: .nextReviewAt)
        easeFactor = try? c.decodeIfPresent(Double.self, forKey: .easeFactor)
        intervalDays = Self.decodeLossyInt(from: c, forKey: .intervalDays)
        repetition = Self.decodeLossyInt(from: c, forKey: .repetition)
        isFavorite = try c.decodeIfPresent(Bool.self, forKey: .isFavorite)
        vocabularyType = try c.decodeIfPresent(String.self, forKey: .vocabularyType)
    }
}

struct ProjectInsertDTO: Codable, Sendable {
    let userId: String
    let title: String
    let iconImage: String?
    let isFavorite: Bool
    let sourceLabels: [String]?
}

struct WordInsertDTO: Codable, Sendable {
    let projectId: String
    let english: String
    let japanese: String
    let distractors: [String]
    let exampleSentence: String?
    let exampleSentenceJa: String?
    let pronunciation: String?
    let partOfSpeechTags: [String]?
    let relatedWords: [RelatedWord]?
    let usagePatterns: [UsagePattern]?
    let insightsGeneratedAt: Date?
    let insightsVersion: Int?
    let vocabularyType: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(projectId, forKey: .projectId)
        try container.encode(english, forKey: .english)
        try container.encode(japanese, forKey: .japanese)
        try container.encode(distractors, forKey: .distractors)
        try container.encode(exampleSentence, forKey: .exampleSentence)
        try container.encode(exampleSentenceJa, forKey: .exampleSentenceJa)
        try container.encode(pronunciation, forKey: .pronunciation)
        try container.encode(partOfSpeechTags, forKey: .partOfSpeechTags)
        try container.encode(relatedWords, forKey: .relatedWords)
        try container.encode(usagePatterns, forKey: .usagePatterns)
        try container.encode(insightsGeneratedAt, forKey: .insightsGeneratedAt)
        try container.encode(insightsVersion, forKey: .insightsVersion)
        try container.encode(vocabularyType, forKey: .vocabularyType)
    }
}

struct WordUpdateDTO: Codable, Sendable {
    var english: String?
    var japanese: String?
    var distractors: [String]?
    var exampleSentence: String??
    var exampleSentenceJa: String??
    var pronunciation: String??
    var partOfSpeechTags: [String]??
    var relatedWords: [RelatedWord]??
    var usagePatterns: [UsagePattern]??
    var insightsGeneratedAt: Date??
    var insightsVersion: Int?
    var status: String?
    var lastReviewedAt: Date??
    var nextReviewAt: Date??
    var easeFactor: Double?
    var intervalDays: Int?
    var repetition: Int?
    var isFavorite: Bool?
    var vocabularyType: String??
}

struct CollectionDTO: Codable, Sendable {
    let id: String
    let userId: String
    let name: String
    let description: String?
    let createdAt: Date
    let updatedAt: Date
}

struct CollectionInsertDTO: Codable, Sendable {
    let userId: String
    let name: String
    let description: String?
}

struct CollectionUpdateDTO: Codable, Sendable {
    let name: String
    let description: String?
}

struct CollectionProjectDTO: Codable, Sendable {
    let collectionId: String
    let projectId: String
    let sortOrder: Int
    let addedAt: Date
}

struct CollectionProjectInsertDTO: Codable, Sendable {
    let collectionId: String
    let projectId: String
    let sortOrder: Int
}

enum SupabaseMapper {
    static func project(from dto: ProjectDTO) -> Project {
        Project(
            id: dto.id,
            userId: dto.userId,
            title: dto.title,
            iconImage: dto.iconImage,
            createdAt: dto.createdAt,
            shareId: dto.shareId,
            shareScope: dto.shareScope ?? .inviteOnly,
            isFavorite: dto.isFavorite ?? false,
            sourceLabels: dto.sourceLabels ?? []
        )
    }

    static func word(from dto: WordDTO) -> Word {
        Word(
            id: dto.id,
            projectId: dto.projectId,
            english: dto.english,
            japanese: dto.japanese,
            distractors: dto.distractors,
            exampleSentence: dto.exampleSentence,
            exampleSentenceJa: dto.exampleSentenceJa,
            pronunciation: dto.pronunciation,
            partOfSpeechTags: dto.partOfSpeechTags,
            relatedWords: dto.relatedWords,
            usagePatterns: dto.usagePatterns,
            insightsGeneratedAt: dto.insightsGeneratedAt,
            insightsVersion: dto.insightsVersion,
            status: WordStatus(rawValue: dto.status) ?? .new,
            createdAt: dto.createdAt,
            lastReviewedAt: dto.lastReviewedAt,
            nextReviewAt: dto.nextReviewAt,
            easeFactor: dto.easeFactor ?? 2.5,
            intervalDays: dto.intervalDays ?? 0,
            repetition: dto.repetition ?? 0,
            isFavorite: dto.isFavorite ?? false,
            vocabularyType: dto.vocabularyType.flatMap { VocabularyType(rawValue: $0) }
        )
    }

    static func wordInsert(from input: WordInput) -> WordInsertDTO {
        WordInsertDTO(
            projectId: input.projectId,
            english: input.english,
            japanese: input.japanese,
            distractors: input.distractors,
            exampleSentence: input.exampleSentence,
            exampleSentenceJa: input.exampleSentenceJa,
            pronunciation: input.pronunciation,
            partOfSpeechTags: input.partOfSpeechTags,
            relatedWords: input.relatedWords,
            usagePatterns: input.usagePatterns,
            insightsGeneratedAt: input.insightsGeneratedAt,
            insightsVersion: input.insightsVersion,
            vocabularyType: input.vocabularyType?.rawValue
        )
    }

    static func wordUpdate(from patch: WordPatch) -> WordUpdateDTO {
        WordUpdateDTO(
            english: patch.english,
            japanese: patch.japanese,
            distractors: patch.distractors,
            exampleSentence: patch.exampleSentence,
            exampleSentenceJa: patch.exampleSentenceJa,
            pronunciation: patch.pronunciation,
            partOfSpeechTags: patch.partOfSpeechTags,
            relatedWords: patch.relatedWords,
            usagePatterns: patch.usagePatterns,
            insightsGeneratedAt: patch.insightsGeneratedAt,
            insightsVersion: patch.insightsVersion,
            status: patch.status?.rawValue,
            lastReviewedAt: patch.lastReviewedAt,
            nextReviewAt: patch.nextReviewAt,
            easeFactor: patch.easeFactor,
            intervalDays: patch.intervalDays,
            repetition: patch.repetition,
            isFavorite: patch.isFavorite,
            vocabularyType: patch.vocabularyType.map { $0?.rawValue }
        )
    }

    static func collection(from dto: CollectionDTO) -> Collection {
        Collection(
            id: dto.id,
            userId: dto.userId,
            name: dto.name,
            description: dto.description,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt
        )
    }

    static func collectionProject(from dto: CollectionProjectDTO) -> CollectionProject {
        CollectionProject(
            collectionId: dto.collectionId,
            projectId: dto.projectId,
            sortOrder: dto.sortOrder,
            addedAt: dto.addedAt
        )
    }
}
