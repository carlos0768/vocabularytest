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

    func search(using _: AppState) {
        guard !searchText.isEmpty else {
            debounceTask?.cancel()
            results = []
            errorMessage = nil
            return
        }

        // Always return local results first so search works instantly and offline.
        searchLocal()
        errorMessage = nil

        debounceTask?.cancel()
    }

    // MARK: - Local Keyword Search

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
