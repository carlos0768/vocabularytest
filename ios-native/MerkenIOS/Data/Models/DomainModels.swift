import Foundation

enum WordStatus: String, Codable, CaseIterable, Sendable {
    case new
    case review
    case mastered
}

enum VocabularyType: String, Codable, Sendable {
    case active
    case passive
}

enum ProjectShareScope: String, Codable, Sendable {
    case inviteOnly = "private"
    case publicListed = "public"
}

struct Project: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let userId: String
    var title: String
    var iconImage: String?
    let createdAt: Date
    var shareId: String?
    var shareScope: ProjectShareScope
    var isFavorite: Bool
    var sourceLabels: [String]

    init(
        id: String = UUID().uuidString,
        userId: String,
        title: String,
        iconImage: String? = nil,
        createdAt: Date = .now,
        shareId: String? = nil,
        shareScope: ProjectShareScope = .inviteOnly,
        isFavorite: Bool = false,
        sourceLabels: [String] = []
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.iconImage = iconImage
        self.createdAt = createdAt
        self.shareId = shareId
        self.shareScope = shareScope
        self.isFavorite = isFavorite
        self.sourceLabels = normalizeProjectSourceLabels(sourceLabels)
    }
}

func normalizeProjectSourceLabel(_ value: String) -> String? {
    let collapsed = value
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")

    guard !collapsed.isEmpty else { return nil }

    let noteAliases: Set<String> = [
        "ノート",
        "note",
        "notes",
        "notebook"
    ]

    let normalizedToken = collapsed
        .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        .lowercased()

    if noteAliases.contains(normalizedToken) {
        return "ノート"
    }

    return collapsed
}

func normalizeProjectSourceLabels(_ values: [String]?) -> [String] {
    guard let values else { return [] }

    var normalized: [String] = []
    var seen: Set<String> = []

    for value in values {
        guard let candidate = normalizeProjectSourceLabel(value) else { continue }
        let dedupeKey = candidate
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .lowercased()
        guard seen.insert(dedupeKey).inserted else { continue }
        normalized.append(candidate)
    }

    return normalized
}

func mergeProjectSourceLabels(_ lhs: [String], _ rhs: [String]) -> [String] {
    normalizeProjectSourceLabels(lhs + rhs)
}

func ensureProjectSourceLabels(_ values: [String]?) -> [String] {
    let normalized = normalizeProjectSourceLabels(values)
    return normalized.isEmpty ? ["ノート"] : normalized
}

struct RelatedWord: Hashable, Codable, Sendable {
    var term: String
    var relation: String
    var noteJa: String?
}

struct UsagePattern: Hashable, Codable, Sendable {
    var pattern: String
    var meaningJa: String
    var example: String?
    var exampleJa: String?
    var register: String?
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
    var partOfSpeechTags: [String]?
    var relatedWords: [RelatedWord]?
    var usagePatterns: [UsagePattern]?
    var insightsGeneratedAt: Date?
    var insightsVersion: Int?
    var status: WordStatus
    let createdAt: Date
    var lastReviewedAt: Date?
    var nextReviewAt: Date?
    var easeFactor: Double
    var intervalDays: Int
    var repetition: Int
    var isFavorite: Bool
    var vocabularyType: VocabularyType?

    init(
        id: String = UUID().uuidString,
        projectId: String,
        english: String,
        japanese: String,
        distractors: [String],
        exampleSentence: String? = nil,
        exampleSentenceJa: String? = nil,
        pronunciation: String? = nil,
        partOfSpeechTags: [String]? = nil,
        relatedWords: [RelatedWord]? = nil,
        usagePatterns: [UsagePattern]? = nil,
        insightsGeneratedAt: Date? = nil,
        insightsVersion: Int? = nil,
        status: WordStatus = .new,
        createdAt: Date = .now,
        lastReviewedAt: Date? = nil,
        nextReviewAt: Date? = nil,
        easeFactor: Double = 2.5,
        intervalDays: Int = 0,
        repetition: Int = 0,
        isFavorite: Bool = false,
        vocabularyType: VocabularyType? = nil
    ) {
        self.id = id
        self.projectId = projectId
        self.english = english
        self.japanese = japanese
        self.distractors = distractors
        self.exampleSentence = exampleSentence
        self.exampleSentenceJa = exampleSentenceJa
        self.pronunciation = pronunciation
        self.partOfSpeechTags = partOfSpeechTags
        self.relatedWords = relatedWords
        self.usagePatterns = usagePatterns
        self.insightsGeneratedAt = insightsGeneratedAt
        self.insightsVersion = insightsVersion
        self.status = status
        self.createdAt = createdAt
        self.lastReviewedAt = lastReviewedAt
        self.nextReviewAt = nextReviewAt
        self.easeFactor = easeFactor
        self.intervalDays = intervalDays
        self.repetition = repetition
        self.isFavorite = isFavorite
        self.vocabularyType = vocabularyType
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
    var partOfSpeechTags: [String]? = nil
    var relatedWords: [RelatedWord]? = nil
    var usagePatterns: [UsagePattern]? = nil
    var insightsGeneratedAt: Date? = nil
    var insightsVersion: Int? = nil
    var vocabularyType: VocabularyType? = nil
}

struct WordPatch: Hashable, Sendable {
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
    var status: WordStatus?
    var lastReviewedAt: Date??
    var nextReviewAt: Date??
    var easeFactor: Double?
    var intervalDays: Int?
    var repetition: Int?
    var isFavorite: Bool?
    var vocabularyType: VocabularyType??

    static let empty = WordPatch()

    init(
        english: String? = nil,
        japanese: String? = nil,
        distractors: [String]? = nil,
        exampleSentence: String?? = nil,
        exampleSentenceJa: String?? = nil,
        pronunciation: String?? = nil,
        partOfSpeechTags: [String]?? = nil,
        relatedWords: [RelatedWord]?? = nil,
        usagePatterns: [UsagePattern]?? = nil,
        insightsGeneratedAt: Date?? = nil,
        insightsVersion: Int? = nil,
        status: WordStatus? = nil,
        lastReviewedAt: Date?? = nil,
        nextReviewAt: Date?? = nil,
        easeFactor: Double? = nil,
        intervalDays: Int? = nil,
        repetition: Int? = nil,
        isFavorite: Bool? = nil,
        vocabularyType: VocabularyType?? = nil
    ) {
        self.english = english
        self.japanese = japanese
        self.distractors = distractors
        self.exampleSentence = exampleSentence
        self.exampleSentenceJa = exampleSentenceJa
        self.pronunciation = pronunciation
        self.partOfSpeechTags = partOfSpeechTags
        self.relatedWords = relatedWords
        self.usagePatterns = usagePatterns
        self.insightsGeneratedAt = insightsGeneratedAt
        self.insightsVersion = insightsVersion
        self.status = status
        self.lastReviewedAt = lastReviewedAt
        self.nextReviewAt = nextReviewAt
        self.easeFactor = easeFactor
        self.intervalDays = intervalDays
        self.repetition = repetition
        self.isFavorite = isFavorite
        self.vocabularyType = vocabularyType
    }
}

struct UserProfile: Codable, Hashable, Sendable {
    let userId: String
    var username: String?
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
    let cancelAtPeriodEnd: Bool

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

    var displayDateLabel: String? {
        if proSource == "test" {
            return testProExpiresAt == nil ? nil : "有効期限"
        }

        if proSource == "billing" || proSource == "appstore" {
            guard currentPeriodEnd != nil else { return nil }
            return cancelAtPeriodEnd ? "解約予定日" : "次回更新"
        }

        return nil
    }

    var displayDateValue: Date? {
        if proSource == "test" {
            return testProExpiresAt
        }

        if proSource == "billing" || proSource == "appstore" {
            return currentPeriodEnd
        }

        return nil
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

enum SharedProjectAccessRole: String, Codable, Sendable {
    case owner
    case editor
    case viewer
}

struct SharedProjectSummary: Identifiable, Hashable, Codable, Sendable {
    let project: Project
    let accessRole: SharedProjectAccessRole
    let wordCount: Int
    let collaboratorCount: Int
    let ownerUsername: String?

    var id: String { project.id }

    init(project: Project, accessRole: SharedProjectAccessRole, wordCount: Int, collaboratorCount: Int, ownerUsername: String? = nil) {
        self.project = project
        self.accessRole = accessRole
        self.wordCount = wordCount
        self.collaboratorCount = collaboratorCount
        self.ownerUsername = ownerUsername
    }
}

struct SharedProjectCatalog: Hashable, Sendable {
    let owned: [SharedProjectSummary]
    let joined: [SharedProjectSummary]
    let publicProjects: [SharedProjectSummary]
}

struct SharedProjectDetail: Identifiable, Hashable, Sendable {
    var project: Project
    var words: [Word]
    let accessRole: SharedProjectAccessRole
    let collaboratorCount: Int

    var id: String { project.id }
}

enum LearningModeUsageStore {
    enum Scope: Hashable, Sendable {
        case project(String)
        case bookshelf(String)

        fileprivate var key: String {
            switch self {
            case .project(let id):
                return "project:\(id)"
            case .bookshelf(let id):
                return "bookshelf:\(id)"
            }
        }
    }

    enum Mode: String, CaseIterable, Sendable {
        case flashcard = "flashcard"
        case selfReview = "self_review"
        case timeAttack = "time_attack"
        case match = "match"
        case quiz = "quiz"
    }

    private struct StoredCounts: Codable {
        var counts: [String: Int]
    }

    private static let defaults = UserDefaults.standard
    private static let keyPrefix = "merken_learning_mode_usage_"

    static func counts(for scope: Scope) -> [Mode: Int] {
        let stored = load(scope: scope)?.counts ?? [:]
        return Dictionary(uniqueKeysWithValues: Mode.allCases.map { mode in
            (mode, stored[mode.rawValue] ?? 0)
        })
    }

    @discardableResult
    static func increment(_ mode: Mode, for scope: Scope) -> Int {
        var stored = load(scope: scope) ?? StoredCounts(counts: [:])
        stored.counts[mode.rawValue, default: 0] += 1
        save(stored, scope: scope)
        return stored.counts[mode.rawValue] ?? 0
    }

    private static func key(for scope: Scope) -> String {
        "\(keyPrefix)\(scope.key)"
    }

    private static func load(scope: Scope) -> StoredCounts? {
        guard let data = defaults.data(forKey: key(for: scope)) else { return nil }
        return try? JSONDecoder().decode(StoredCounts.self, from: data)
    }

    private static func save(_ stored: StoredCounts, scope: Scope) {
        guard let data = try? JSONEncoder().encode(stored) else { return }
        defaults.set(data, forKey: key(for: scope))
    }
}

struct QuizQuestion: Identifiable, Hashable, Sendable {
    let sequenceIndex: Int
    let word: Word
    let options: [String]
    let correctIndex: Int

    var id: Int { sequenceIndex }
}
