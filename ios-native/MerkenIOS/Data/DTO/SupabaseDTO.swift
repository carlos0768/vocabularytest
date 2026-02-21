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
}

struct WordUpdateDTO: Codable, Sendable {
    var english: String?
    var japanese: String?
    var distractors: [String]?
    var exampleSentence: String??
    var exampleSentenceJa: String??
    var pronunciation: String??
    var status: String?
    var lastReviewedAt: Date??
    var nextReviewAt: Date??
    var easeFactor: Double?
    var intervalDays: Int?
    var repetition: Int?
    var isFavorite: Bool?
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
            pronunciation: input.pronunciation
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
            status: patch.status?.rawValue,
            lastReviewedAt: patch.lastReviewedAt,
            nextReviewAt: patch.nextReviewAt,
            easeFactor: patch.easeFactor,
            intervalDays: patch.intervalDays,
            repetition: patch.repetition,
            isFavorite: patch.isFavorite
        )
    }
}
