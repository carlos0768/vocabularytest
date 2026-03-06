import Foundation
import OSLog

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var projects: [Project] = []
    @Published private(set) var totalWordCount: Int = 0
    @Published private(set) var dueWordCount: Int = 0
    @Published private(set) var dueWords: [Word] = []
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

    private let logger = Logger(subsystem: "MerkenIOS", category: "HomeVM")
    private var wordCountTask: Task<Void, Never>?

    func load(using state: AppState) async {
        wordCountTask?.cancel()
        loading = true

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
}
