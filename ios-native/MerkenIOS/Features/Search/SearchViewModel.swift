import Foundation
import OSLog

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var searchText = ""
    @Published private(set) var results: [Word] = []
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private var allWords: [Word] = []
    private let logger = Logger(subsystem: "MerkenIOS", category: "SearchVM")

    var hasSearched: Bool {
        !searchText.isEmpty
    }

    func load(using state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            allWords = try await state.activeRepository.fetchAllWords(userId: state.activeUserId)
            if hasSearched {
                search()
            }
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Search load failed: \(error.localizedDescription)")
        }
    }

    func search() {
        guard !searchText.isEmpty else {
            results = []
            return
        }
        let query = searchText.lowercased()
        results = allWords.filter {
            $0.english.lowercased().contains(query) ||
            $0.japanese.lowercased().contains(query)
        }
    }
}
