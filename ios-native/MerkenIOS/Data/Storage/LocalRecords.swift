import Foundation
import SwiftData

@Model
final class LocalProjectRecord {
    @Attribute(.unique) var id: String
    var userId: String
    var title: String
    var iconImage: String?
    var createdAt: Date
    var shareId: String?
    var shareScopeRaw: String?
    var isFavorite: Bool
    var sourceLabelsBlob: Data?

    init(
        id: String,
        userId: String,
        title: String,
        iconImage: String? = nil,
        createdAt: Date,
        shareId: String? = nil,
        shareScopeRaw: String? = nil,
        isFavorite: Bool = false,
        sourceLabelsBlob: Data? = nil
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.iconImage = iconImage
        self.createdAt = createdAt
        self.shareId = shareId
        self.shareScopeRaw = shareScopeRaw
        self.isFavorite = isFavorite
        self.sourceLabelsBlob = sourceLabelsBlob
    }
}

@Model
final class LocalWordRecord {
    @Attribute(.unique) var id: String
    var projectId: String
    var english: String
    var japanese: String
    var distractorsBlob: Data
    var exampleSentence: String?
    var exampleSentenceJa: String?
    var pronunciation: String?
    var partOfSpeechTagsBlob: Data?
    var relatedWordsBlob: Data?
    var usagePatternsBlob: Data?
    var insightsGeneratedAt: Date?
    var insightsVersion: Int?
    var statusRaw: String
    var createdAt: Date
    var lastReviewedAt: Date?
    var nextReviewAt: Date?
    var easeFactor: Double
    var intervalDays: Int
    var repetition: Int
    var isFavorite: Bool

    init(
        id: String,
        projectId: String,
        english: String,
        japanese: String,
        distractorsBlob: Data,
        exampleSentence: String? = nil,
        exampleSentenceJa: String? = nil,
        pronunciation: String? = nil,
        partOfSpeechTagsBlob: Data? = nil,
        relatedWordsBlob: Data? = nil,
        usagePatternsBlob: Data? = nil,
        insightsGeneratedAt: Date? = nil,
        insightsVersion: Int? = nil,
        statusRaw: String,
        createdAt: Date,
        lastReviewedAt: Date? = nil,
        nextReviewAt: Date? = nil,
        easeFactor: Double,
        intervalDays: Int,
        repetition: Int,
        isFavorite: Bool
    ) {
        self.id = id
        self.projectId = projectId
        self.english = english
        self.japanese = japanese
        self.distractorsBlob = distractorsBlob
        self.exampleSentence = exampleSentence
        self.exampleSentenceJa = exampleSentenceJa
        self.pronunciation = pronunciation
        self.partOfSpeechTagsBlob = partOfSpeechTagsBlob
        self.relatedWordsBlob = relatedWordsBlob
        self.usagePatternsBlob = usagePatternsBlob
        self.insightsGeneratedAt = insightsGeneratedAt
        self.insightsVersion = insightsVersion
        self.statusRaw = statusRaw
        self.createdAt = createdAt
        self.lastReviewedAt = lastReviewedAt
        self.nextReviewAt = nextReviewAt
        self.easeFactor = easeFactor
        self.intervalDays = intervalDays
        self.repetition = repetition
        self.isFavorite = isFavorite
    }
}
