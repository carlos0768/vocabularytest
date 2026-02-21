import Foundation
import OSLog

@MainActor
final class FavoritesViewModel: ObservableObject {
    @Published private(set) var favoriteWords: [Word] = []
    @Published private(set) var loading = false
    @Published var searchText = ""
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "FavoritesVM")

    var filteredWords: [Word] {
        guard !searchText.isEmpty else { return favoriteWords }
        let query = searchText.lowercased()
        return favoriteWords.filter {
            $0.english.lowercased().contains(query) ||
            $0.japanese.lowercased().contains(query)
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
