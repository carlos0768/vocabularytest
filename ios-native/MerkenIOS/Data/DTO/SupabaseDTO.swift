import Foundation

struct ProjectDTO: Codable, Sendable {
    let id: String
    let userId: String
    let title: String
    let iconImage: String?
    let createdAt: Date
    let shareId: String?
    let isFavorite: Bool?
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
}

struct ProjectInsertDTO: Codable, Sendable {
    let userId: String
    let title: String
    let iconImage: String?
    let isFavorite: Bool
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
            isFavorite: dto.isFavorite ?? false
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
            isFavorite: dto.isFavorite ?? false
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
            insightsVersion: input.insightsVersion
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
            isFavorite: patch.isFavorite
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
