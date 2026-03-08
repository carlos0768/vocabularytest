import Foundation
import OSLog

struct ReviewPartOfSpeechCount: Identifiable, Equatable {
    let key: String
    let label: String
    let count: Int

    var id: String { key }
}

struct HomePartOfSpeechWidget: Identifiable, Equatable {
    let key: String
    let label: String
    let totalCount: Int
    let masteredCount: Int

    var id: String { key }

    var progress: Double {
        guard totalCount > 0 else { return 0 }
        return Double(masteredCount) / Double(totalCount)
    }
}

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var projects: [Project] = []
    @Published private(set) var totalWordCount: Int = 0
    @Published private(set) var dueWordCount: Int = 0
    @Published private(set) var dueWords: [Word] = []
    @Published private(set) var duePartOfSpeechCounts: [ReviewPartOfSpeechCount] = []
    @Published private(set) var homePartOfSpeechWidgets: [HomePartOfSpeechWidget] = []
    @Published private(set) var wordsByProject: [String: [Word]] = [:]
    @Published private(set) var dueCountByProject: [String: Int] = [:]
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    // Preview quiz widget
    @Published private(set) var previewWord: Word?
    @Published private(set) var masteredWordCount: Int = 0

    // Favorite (苦手) words for home section
    @Published private(set) var favoriteWords: [Word] = []

    // Words added today
    @Published private(set) var todayAddedWords: [Word] = []

    // All words flat (for day filtering)
    @Published private(set) var allWordsFlat: [Word] = []

    // Daily stats for hero section
    @Published private(set) var streakDays: Int = 0
    @Published private(set) var todayAnswered: Int = 0
    @Published private(set) var todayCorrect: Int = 0

    var accuracyPercent: Int {
        guard todayAnswered > 0 else { return 0 }
        return Int(Double(todayCorrect) / Double(todayAnswered) * 100)
    }

    var duePartOfSpeechSummary: String {
        duePartOfSpeechCounts
            .map { "\($0.label): \($0.count)語" }
            .joined(separator: "  ")
    }

    private let logger = Logger(subsystem: "MerkenIOS", category: "HomeVM")
    private var wordCountTask: Task<Void, Never>?
    private var lastLoadContext: String?

    func load(using state: AppState) async {
        wordCountTask?.cancel()
        loading = true
        let loadContext = Self.loadContext(for: state)

        if lastLoadContext != loadContext {
            clearLoadedContent()
            lastLoadContext = loadContext
        }

        // Only show quiz stats when logged in (stats are from the cloud user)
        if state.isLoggedIn {
            let daily = state.quizStatsStore.todayStats()
            streakDays = state.quizStatsStore.streakDays()
            todayAnswered = daily.totalAnswered
            todayCorrect = daily.correctAnswered
        } else {
            streakDays = 0
            todayAnswered = 0
            todayCorrect = 0
        }

        do {
            let repository = state.activeRepository
            let userId = state.activeUserId
            let projects = try await repository.fetchProjects(userId: userId)
            self.projects = projects
            errorMessage = nil
            loading = false

            // Single fetchAllWords instead of N+1 per-project queries
            wordCountTask = Task { [weak self] in
                guard !Task.isCancelled else { return }
                do {
                    let allWords = try await repository.fetchAllWords(userId: userId)
                    guard !Task.isCancelled else { return }

                    let total = allWords.count
                    // Keep due-word behavior aligned with web SM-2 due filtering.
                    let dueList = QuizEngine.wordsDueForReview(allWords)

                    self?.totalWordCount = total
                    self?.dueWordCount = dueList.count
                    self?.dueWords = dueList
                    self?.duePartOfSpeechCounts = Self.reviewPartOfSpeechCounts(for: dueList)
                    self?.homePartOfSpeechWidgets = Self.topHomePartOfSpeechWidgets(for: allWords, limit: 12)
                    self?.previewWord = dueList.first
                    self?.masteredWordCount = allWords.filter { $0.status == .mastered }.count
                    self?.favoriteWords = allWords.filter { $0.isFavorite }
                    self?.allWordsFlat = allWords
                    let todayStart = Calendar.current.startOfDay(for: Date())
                    self?.todayAddedWords = allWords.filter { $0.createdAt >= todayStart }
                    let grouped = Dictionary(grouping: allWords, by: \.projectId)
                        .mapValues { $0.sorted { $0.createdAt < $1.createdAt } }
                    self?.wordsByProject = grouped

                    // Per-project due counts
                    var dueCounts: [String: Int] = [:]
                    for (pid, words) in grouped {
                        dueCounts[pid] = QuizEngine.wordsDueForReview(words).count
                    }
                    self?.dueCountByProject = dueCounts
                } catch {
                    // skip on failure
                }
            }
        } catch {
            loading = false
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Home load failed: \(error.localizedDescription)")
        }
    }

    private func clearLoadedContent() {
        projects = []
        totalWordCount = 0
        dueWordCount = 0
        dueWords = []
        duePartOfSpeechCounts = []
        homePartOfSpeechWidgets = []
        wordsByProject = [:]
        dueCountByProject = [:]
        previewWord = nil
        masteredWordCount = 0
        favoriteWords = []
        todayAddedWords = []
        allWordsFlat = []
        errorMessage = nil
    }

    private static func loadContext(for state: AppState) -> String {
        let modeKey: String = switch state.repositoryMode {
        case .guestLocal:
            "guestLocal"
        case .proCloud:
            "proCloud"
        case .readonlyCloud:
            "readonlyCloud"
        }
        return "\(modeKey):\(state.activeUserId)"
    }

    func preloadedWords(for projectId: String) -> [Word]? {
        wordsByProject[projectId]
    }

    func toggleFavorite(projectId: String, using state: AppState) async {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        let newValue = !projects[index].isFavorite

        do {
            try await state.activeRepository.updateProjectFavorite(id: projectId, isFavorite: newValue)
            projects[index] = Project(
                id: projects[index].id,
                userId: projects[index].userId,
                title: projects[index].title,
                iconImage: projects[index].iconImage,
                createdAt: projects[index].createdAt,
                shareId: projects[index].shareId,
                isFavorite: newValue
            )
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Toggle favorite failed: \(error.localizedDescription)")
        }
    }

    func deleteProject(id: String, using state: AppState) async {
        do {
            try await state.activeRepository.deleteProject(id: id)
            projects.removeAll { $0.id == id }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Project delete failed: \(error.localizedDescription)")
        }
    }

    func renameProject(id: String, title: String, using state: AppState) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        do {
            try await state.activeRepository.updateProject(id: id, title: trimmedTitle)
            if let index = projects.firstIndex(where: { $0.id == id }) {
                projects[index].title = trimmedTitle
            }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Project rename failed: \(error.localizedDescription)")
        }
    }

    static func reviewPartOfSpeechCounts(for words: [Word]) -> [ReviewPartOfSpeechCount] {
        guard !words.isEmpty else { return [] }

        var counts: [String: Int] = [:]
        for word in words {
            let category = primaryReviewCategory(for: word)
            counts[category, default: 0] += 1
        }

        return counts
            .map { entry in
                ReviewPartOfSpeechCount(
                    key: entry.key,
                    label: reviewCategoryLabel(for: entry.key),
                    count: entry.value
                )
            }
            .sorted {
                if $0.count != $1.count {
                    return $0.count > $1.count
                }
                return reviewCategoryOrderIndex(for: $0.key) < reviewCategoryOrderIndex(for: $1.key)
            }
    }

    static func topHomePartOfSpeechWidgets(
        for words: [Word],
        limit: Int = 3
    ) -> [HomePartOfSpeechWidget] {
        guard !words.isEmpty, limit > 0 else { return [] }

        typealias Bucket = (total: Int, mastered: Int)
        var buckets: [String: Bucket] = [:]

        for word in words {
            let category = primaryReviewCategory(for: word)
            guard category != "other" else { continue }

            var bucket = buckets[category, default: (0, 0)]
            bucket.total += 1
            if word.status == .mastered {
                bucket.mastered += 1
            }
            buckets[category] = bucket
        }

        let widgets = buckets
            .map { entry in
                HomePartOfSpeechWidget(
                    key: entry.key,
                    label: reviewCategoryLabel(for: entry.key),
                    totalCount: entry.value.total,
                    masteredCount: entry.value.mastered
                )
            }
            .sorted {
                if $0.totalCount != $1.totalCount {
                    return $0.totalCount > $1.totalCount
                }
                return reviewCategoryOrderIndex(for: $0.key) < reviewCategoryOrderIndex(for: $1.key)
            }

        if widgets.isEmpty {
            let otherCount = words.count
            guard otherCount > 0 else { return [] }
            let otherMasteredCount = words.filter { $0.status == .mastered }.count
            return [
                HomePartOfSpeechWidget(
                    key: "other",
                    label: reviewCategoryLabel(for: "other"),
                    totalCount: otherCount,
                    masteredCount: otherMasteredCount
                )
            ]
        }

        return Array(widgets.prefix(limit))
    }

    private static func primaryReviewCategory(for word: Word) -> String {
        for tag in word.partOfSpeechTags ?? [] {
            if let normalized = normalizeReviewCategory(tag) {
                return normalized
            }
        }
        return "other"
    }

    private static func normalizeReviewCategory(_ rawValue: String) -> String? {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        switch trimmed.lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: " ", with: "_") {
        case "noun", "n", "名詞":
            return "noun"
        case "verb", "v", "動詞":
            return "verb"
        case "adjective", "adj", "形容詞":
            return "adjective"
        case "adverb", "adv", "副詞":
            return "adverb"
        case "idiom", "熟語", "イディオム", "phrase", "フレーズ", "idiomatic_expression":
            return "idiom"
        case "phrasal_verb", "句動詞":
            return "phrasal_verb"
        case "preposition", "前置詞":
            return "preposition"
        case "conjunction", "接続詞":
            return "conjunction"
        case "pronoun", "代名詞":
            return "pronoun"
        case "determiner", "article", "冠詞", "限定詞":
            return "determiner"
        case "interjection", "感動詞":
            return "interjection"
        case "auxiliary", "助動詞":
            return "auxiliary"
        case "other", "その他":
            return "other"
        default:
            return "other"
        }
    }

    private static func reviewCategoryLabel(for key: String) -> String {
        switch key {
        case "noun": return "名詞"
        case "verb": return "動詞"
        case "adjective": return "形容詞"
        case "adverb": return "副詞"
        case "idiom": return "イディオム"
        case "phrasal_verb": return "句動詞"
        case "preposition": return "前置詞"
        case "conjunction": return "接続詞"
        case "pronoun": return "代名詞"
        case "determiner": return "限定詞"
        case "interjection": return "感動詞"
        case "auxiliary": return "助動詞"
        default: return "その他"
        }
    }

    private static func reviewCategoryOrderIndex(for key: String) -> Int {
        switch key {
        case "idiom": return 0
        case "phrasal_verb": return 1
        case "noun": return 2
        case "verb": return 3
        case "adjective": return 4
        case "adverb": return 5
        case "preposition": return 6
        case "conjunction": return 7
        case "pronoun": return 8
        case "determiner": return 9
        case "interjection": return 10
        case "auxiliary": return 11
        default: return 12
        }
    }
}
