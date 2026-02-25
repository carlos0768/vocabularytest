import Foundation
import OSLog

struct SearchResult: Identifiable {
    let id: String
    let english: String
    let japanese: String
    let projectId: String
    let projectTitle: String
    let similarity: Int
}

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var searchText = ""
    @Published private(set) var results: [SearchResult] = []
    @Published private(set) var loading = false
    @Published private(set) var initialLoadComplete = false
    @Published var errorMessage: String?

    private var allWords: [Word] = []
    private var projectTitleMap: [String: String] = [:]
    private var lastLoadToken: String?
    private var debounceTask: Task<Void, Never>?
    private let logger = Logger(subsystem: "MerkenIOS", category: "SearchVM")

    var hasSearched: Bool {
        !searchText.isEmpty
    }

    func load(using state: AppState, token: String) async {
        // Avoid refetch + spinner when reopening the tab with unchanged data.
        guard token != lastLoadToken || errorMessage != nil || !initialLoadComplete else { return }

        let shouldShowLoading = !initialLoadComplete
        if shouldShowLoading {
            loading = true
        }
        defer {
            if shouldShowLoading {
                loading = false
            }
            initialLoadComplete = true
            lastLoadToken = token
        }

        do {
            allWords = try await state.activeRepository.fetchAllWords(userId: state.activeUserId)
            let projects = try await state.activeRepository.fetchProjects(userId: state.activeUserId)
            projectTitleMap = Dictionary(uniqueKeysWithValues: projects.map { ($0.id, $0.title) })
            if hasSearched {
                search(using: state)
            }
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Search load failed: \(error.localizedDescription)")
        }
    }

    func search(using state: AppState) {
        guard !searchText.isEmpty else {
            results = []
            return
        }

        if state.isPro {
            searchSemanticDebounced(query: searchText, state: state)
        } else {
            searchLocal()
        }
    }

    // MARK: - Semantic Search (Pro)

    private func searchSemanticDebounced(query: String, state: AppState) {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000) // 500ms
            guard !Task.isCancelled else { return }
            await searchSemantic(query: query, state: state)
        }
    }

    private func searchSemantic(query: String, state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            let apiResults = try await state.performWebAPIRequest { token in
                try await state.webAPIClient.searchSemantic(query: query, bearerToken: token)
            }

            guard !Task.isCancelled else { return }
            results = apiResults.map { r in
                SearchResult(
                    id: r.id,
                    english: r.english,
                    japanese: r.japanese,
                    projectId: r.projectId,
                    projectTitle: r.projectTitle,
                    similarity: r.similarity
                )
            }
            errorMessage = nil
        } catch {
            if error.isCancellationError || Task.isCancelled { return }
            logger.error("Semantic search failed: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Local Keyword Search (Free / Guest)

    private func searchLocal() {
        let query = searchText.lowercased().trimmingCharacters(in: .whitespaces)

        let scored: [SearchResult] = allWords.compactMap { word in
            let english = word.english.lowercased()
            let japanese = word.japanese.lowercased()

            let similarity: Int
            if english == query || japanese == query {
                similarity = 100
            } else if english.hasPrefix(query) || japanese.hasPrefix(query) {
                similarity = 92
            } else if english.contains(query) || japanese.contains(query) {
                similarity = 82
            } else {
                return nil
            }

            return SearchResult(
                id: word.id,
                english: word.english,
                japanese: word.japanese,
                projectId: word.projectId,
                projectTitle: projectTitleMap[word.projectId] ?? "",
                similarity: similarity
            )
        }

        results = scored.sorted { $0.similarity > $1.similarity }
        if results.count > 50 {
            results = Array(results.prefix(50))
        }
    }
}
