import Foundation
import OSLog

@MainActor
final class FavoritesViewModel: ObservableObject {
    enum SortMode: String, CaseIterable {
        case `default` = "追加順"
        case alphabetical = "ABC順"
        case status = "ステータス"
    }

    @Published private(set) var favoriteWords: [Word] = []
    @Published private(set) var loading = false
    @Published var searchText = ""
    @Published var sortMode: SortMode = .default
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "FavoritesVM")

    var filteredWords: [Word] {
        var words = favoriteWords
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            words = words.filter {
                $0.english.lowercased().contains(query) ||
                $0.japanese.lowercased().contains(query)
            }
        }
        switch sortMode {
        case .default:
            return words
        case .alphabetical:
            return words.sorted { $0.english.lowercased() < $1.english.lowercased() }
        case .status:
            let order: [WordStatus] = [.mastered, .review, .new]
            return words.sorted {
                let i0 = order.firstIndex(of: $0.status) ?? 3
                let i1 = order.firstIndex(of: $1.status) ?? 3
                return i0 < i1
            }
        }
    }

    func load(using state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            let allWords = try await state.activeRepository.fetchAllWords(userId: state.activeUserId)
            favoriteWords = allWords.filter { $0.isFavorite }
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Favorites load failed: \(error.localizedDescription)")
        }
    }

    func toggleFavorite(word: Word, using state: AppState) async {
        let newValue = !word.isFavorite
        do {
            try await state.activeRepository.updateWord(
                id: word.id,
                patch: WordPatch(isFavorite: newValue)
            )
            if !newValue {
                favoriteWords.removeAll { $0.id == word.id }
            }
            state.bumpDataVersion()
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Toggle favorite failed: \(error.localizedDescription)")
        }
    }
}
