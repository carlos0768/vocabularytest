import Foundation
import OSLog

@MainActor
final class BookshelfListViewModel: ObservableObject {
    @Published private(set) var collections: [Collection] = []
    @Published private(set) var projectCounts: [String: Int] = [:]
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "BookshelfListVM")

    func load(using state: AppState) async {
        loading = true
        errorMessage = nil

        do {
            let fetched = try await state.collectionRepository.fetchCollections(userId: state.activeUserId)
            collections = fetched

            var counts: [String: Int] = [:]
            await withTaskGroup(of: (String, Int).self) { group in
                for collection in fetched {
                    group.addTask {
                        let projects = try? await state.collectionRepository.fetchCollectionProjects(collectionId: collection.id)
                        return (collection.id, projects?.count ?? 0)
                    }
                }
                for await (collectionId, count) in group {
                    counts[collectionId] = count
                }
            }
            projectCounts = counts
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfList load failed: \(error.localizedDescription)")
        }

        loading = false
    }

    func deleteCollection(id: String, using state: AppState) async {
        do {
            try await state.collectionRepository.deleteCollection(id: id)
            collections.removeAll { $0.id == id }
            projectCounts.removeValue(forKey: id)
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfList delete failed: \(error.localizedDescription)")
        }
    }
}
