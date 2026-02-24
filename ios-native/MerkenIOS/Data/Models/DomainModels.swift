import Foundation

enum WordStatus: String, Codable, CaseIterable, Sendable {
    case new
    case review
    case mastered
}

struct Project: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let userId: String
    var title: String
    var iconImage: String?
    let createdAt: Date
    var shareId: String?
    var isFavorite: Bool

    init(
        id: String = UUID().uuidString,
        userId: String,
        title: String,
        iconImage: String? = nil,
        createdAt: Date = .now,
        shareId: String? = nil,
        isFavorite: Bool = false
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.iconImage = iconImage
        self.createdAt = createdAt
        self.shareId = shareId
        self.isFavorite = isFavorite
    }
}

struct Word: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let projectId: String
    var english: String
    var japanese: String
    var distractors: [String]
    var exampleSentence: String?
    var exampleSentenceJa: String?
    var pronunciation: String?
    var status: WordStatus
    let createdAt: Date
    var lastReviewedAt: Date?
    var nextReviewAt: Date?
    var easeFactor: Double
    var intervalDays: Int
    var repetition: Int
    var isFavorite: Bool

    init(
        id: String = UUID().uuidString,
        projectId: String,
        english: String,
        japanese: String,
        distractors: [String],
        exampleSentence: String? = nil,
        exampleSentenceJa: String? = nil,
        pronunciation: String? = nil,
        status: WordStatus = .new,
        createdAt: Date = .now,
        lastReviewedAt: Date? = nil,
        nextReviewAt: Date? = nil,
        easeFactor: Double = 2.5,
        intervalDays: Int = 0,
        repetition: Int = 0,
        isFavorite: Bool = false
    ) {
        self.id = id
        self.projectId = projectId
        self.english = english
        self.japanese = japanese
        self.distractors = distractors
        self.exampleSentence = exampleSentence
        self.exampleSentenceJa = exampleSentenceJa
        self.pronunciation = pronunciation
        self.status = status
        self.createdAt = createdAt
        self.lastReviewedAt = lastReviewedAt
        self.nextReviewAt = nextReviewAt
        self.easeFactor = easeFactor
        self.intervalDays = intervalDays
        self.repetition = repetition
        self.isFavorite = isFavorite
    }
}

struct WordInput: Hashable, Sendable {
    var projectId: String
    var english: String
    var japanese: String
    var distractors: [String]
    var exampleSentence: String?
    var exampleSentenceJa: String?
    var pronunciation: String?
}

struct WordPatch: Hashable, Sendable {
    var english: String?
    var japanese: String?
    var distractors: [String]?
    var exampleSentence: String??
    var exampleSentenceJa: String??
    var pronunciation: String??
    var status: WordStatus?
    var lastReviewedAt: Date??
    var nextReviewAt: Date??
    var easeFactor: Double?
    var intervalDays: Int?
    var repetition: Int?
    var isFavorite: Bool?

    static let empty = WordPatch()

    init(
        english: String? = nil,
        japanese: String? = nil,
        distractors: [String]? = nil,
        exampleSentence: String?? = nil,
        exampleSentenceJa: String?? = nil,
        pronunciation: String?? = nil,
        status: WordStatus? = nil,
        lastReviewedAt: Date?? = nil,
        nextReviewAt: Date?? = nil,
        easeFactor: Double? = nil,
        intervalDays: Int? = nil,
        repetition: Int? = nil,
        isFavorite: Bool? = nil
    ) {
        self.english = english
        self.japanese = japanese
        self.distractors = distractors
        self.exampleSentence = exampleSentence
        self.exampleSentenceJa = exampleSentenceJa
        self.pronunciation = pronunciation
        self.status = status
        self.lastReviewedAt = lastReviewedAt
        self.nextReviewAt = nextReviewAt
        self.easeFactor = easeFactor
        self.intervalDays = intervalDays
        self.repetition = repetition
        self.isFavorite = isFavorite
    }
}

struct AuthSession: Codable, Hashable, Sendable {
    let userId: String
    let email: String?
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
    let tokenType: String

    var isExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt <= Date()
    }
}

enum SubscriptionStatus: String, Codable, Sendable {
    case free
    case active
    case cancelled
    case pastDue = "past_due"
}

enum SubscriptionPlan: String, Codable, Sendable {
    case free
    case pro
}

struct SubscriptionState: Codable, Hashable, Sendable {
    let id: String
    let userId: String
    let status: SubscriptionStatus
    let plan: SubscriptionPlan
    let proSource: String
    let testProExpiresAt: Date?
    let currentPeriodEnd: Date?

    var isActivePro: Bool {
        guard status == .active, plan == .pro else { return false }

        if proSource == "test" {
            if let testProExpiresAt {
                return testProExpiresAt > .now
            }
            return true
        }

        if proSource == "none" {
            return false
        }

        if proSource == "billing" || proSource == "appstore" {
            if let currentPeriodEnd {
                return currentPeriodEnd > .now
            }
            return true
        }

        if let currentPeriodEnd {
            return currentPeriodEnd > .now
        }

        return true
    }

    var wasPro: Bool {
        plan == .pro && !isActivePro
    }
}

struct Collection: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let userId: String
    var name: String
    var description: String?
    let createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        userId: String,
        name: String,
        description: String? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.description = description
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

struct CollectionProject: Identifiable, Hashable, Codable, Sendable {
    let collectionId: String
    let projectId: String
    let sortOrder: Int
    let addedAt: Date

    var id: String { "\(collectionId)-\(projectId)" }

    init(
        collectionId: String,
        projectId: String,
        sortOrder: Int = 0,
        addedAt: Date = .now
    ) {
        self.collectionId = collectionId
        self.projectId = projectId
        self.sortOrder = sortOrder
        self.addedAt = addedAt
    }
}

struct QuizQuestion: Identifiable, Hashable, Sendable {
    let sequenceIndex: Int
    let word: Word
    let options: [String]
    let correctIndex: Int

    var id: Int { sequenceIndex }
}
