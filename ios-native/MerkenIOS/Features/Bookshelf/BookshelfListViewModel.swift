import Foundation
import OSLog

/// Lightweight preview of a project inside a collection (for mini-book thumbnails).
struct CollectionProjectPreview: Identifiable {
    let id: String
    let title: String
    let iconImage: String?
}

/// Aggregated stats for a single collection.
struct CollectionStats {
    let projectCount: Int
    let wordCount: Int
    let masteredCount: Int
    let previews: [CollectionProjectPreview]

    var progress: Int {
        wordCount > 0 ? Int(Double(masteredCount) / Double(wordCount) * 100) : 0
    }
}

@MainActor
final class BookshelfListViewModel: ObservableObject {
    @Published private(set) var collections: [Collection] = []
    @Published private(set) var stats: [String: CollectionStats] = [:]
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    /// Legacy accessor kept for compatibility
    var projectCounts: [String: Int] {
        stats.mapValues { $0.projectCount }
    }

    private let logger = Logger(subsystem: "MerkenIOS", category: "BookshelfListVM")

    func load(using state: AppState) async {
        loading = true
        errorMessage = nil

        do {
            let fetched = try await state.collectionRepository.fetchCollections(userId: state.activeUserId)
            collections = fetched

            // Fetch all user projects once for previews
            let allProjects = try await state.activeRepository.fetchProjects(userId: state.activeUserId)
            let projectMap = Dictionary(uniqueKeysWithValues: allProjects.map { ($0.id, $0) })

            // Fetch all words once for word/mastered counts
            let allWords = try await state.activeRepository.fetchAllWords(userId: state.activeUserId)
            // Group words by projectId
            var wordsByProject: [String: [Word]] = [:]
            for word in allWords {
                wordsByProject[word.projectId, default: []].append(word)
            }

            var collectionStats: [String: CollectionStats] = [:]

            await withTaskGroup(of: (String, CollectionStats).self) { group in
                for collection in fetched {
                    group.addTask {
                        let cps = (try? await state.collectionRepository.fetchCollectionProjects(collectionId: collection.id)) ?? []
                        let projectIds = cps.map(\.projectId)

                        // Build previews (up to 3)
                        var previews: [CollectionProjectPreview] = []
                        for pid in projectIds.prefix(3) {
                            if let project = projectMap[pid] {
                                previews.append(CollectionProjectPreview(
                                    id: project.id,
                                    title: project.title,
                                    iconImage: project.iconImage
                                ))
                            }
                        }

                        // Compute word counts
                        var wordCount = 0
                        var masteredCount = 0
                        for pid in projectIds {
                            if let words = wordsByProject[pid] {
                                wordCount += words.count
                                masteredCount += words.filter { $0.status == .mastered }.count
                            }
                        }

                        return (collection.id, CollectionStats(
                            projectCount: projectIds.count,
                            wordCount: wordCount,
                            masteredCount: masteredCount,
                            previews: previews
                        ))
                    }
                }
                for await (collectionId, stat) in group {
                    collectionStats[collectionId] = stat
                }
            }

            stats = collectionStats
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
            stats.removeValue(forKey: id)
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfList delete failed: \(error.localizedDescription)")
        }
    }
}
