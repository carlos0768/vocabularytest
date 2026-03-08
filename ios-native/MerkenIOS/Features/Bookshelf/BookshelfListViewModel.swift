import Foundation
import OSLog

/// Lightweight preview of a project inside a collection (for mini-book thumbnails).
struct CollectionProjectPreview: Identifiable {
    let id: String
    let title: String
    let iconImage: String?
    let iconImageCacheKey: String?
}

/// Aggregated stats for a single collection.
struct CollectionStats {
    let projectCount: Int
    let previews: [CollectionProjectPreview]
    let totalWordCount: Int
    let masteredWordCount: Int
    let reviewWordCount: Int
    let newWordCount: Int
    let sharedProjectCount: Int
    let pinnedProjectCount: Int
    let projectTitles: [String]

    var masteryRate: Double {
        guard totalWordCount > 0 else { return 0 }
        return Double(masteredWordCount) / Double(totalWordCount)
    }
}

private struct BookshelfSnapshot {
    let collections: [Collection]
    let stats: [String: CollectionStats]
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
    private static var snapshotCacheByUserId: [String: BookshelfSnapshot] = [:]
    private static var inFlightSnapshotByUserId: [String: Task<BookshelfSnapshot, Error>] = [:]
    private var lastLoadContext: String?

    func load(using state: AppState) async {
        errorMessage = nil

        guard state.isLoggedIn, state.isPro else {
            clearLoadedContent()
            lastLoadContext = nil
            loading = false
            return
        }

        let userId = state.activeUserId
        let loadContext = userId

        if lastLoadContext != loadContext {
            clearLoadedContent()
            lastLoadContext = loadContext
        }

        if let snapshot = Self.snapshotCacheByUserId[userId] {
            apply(snapshot)
            loading = false
            refreshInBackground(using: state, userId: userId)
            return
        }

        loading = true

        do {
            let snapshot = try await fetchSnapshotShared(using: state, userId: userId)
            apply(snapshot)
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
            Self.snapshotCacheByUserId[state.activeUserId] = BookshelfSnapshot(
                collections: collections,
                stats: stats
            )
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfList delete failed: \(error.localizedDescription)")
        }
    }

    private func apply(_ snapshot: BookshelfSnapshot) {
        collections = snapshot.collections
        stats = snapshot.stats
    }

    private func clearLoadedContent() {
        collections = []
        stats = [:]
        errorMessage = nil
    }

    private func fetchSnapshotShared(using state: AppState, userId: String) async throws -> BookshelfSnapshot {
        if let inFlight = Self.inFlightSnapshotByUserId[userId] {
            return try await inFlight.value
        }

        let task = Task<BookshelfSnapshot, Error> {
            try await self.fetchSnapshot(using: state, userId: userId)
        }
        Self.inFlightSnapshotByUserId[userId] = task
        defer {
            Self.inFlightSnapshotByUserId[userId] = nil
        }

        let snapshot = try await task.value
        Self.snapshotCacheByUserId[userId] = snapshot
        return snapshot
    }

    private func refreshInBackground(using state: AppState, userId: String) {
        Task { [weak self] in
            guard let self else { return }
            do {
                let snapshot = try await self.fetchSnapshot(using: state, userId: userId)
                Self.snapshotCacheByUserId[userId] = snapshot
                guard !Task.isCancelled else { return }
                guard state.activeUserId == userId else { return }
                self.apply(snapshot)
            } catch {
                self.logger.debug("BookshelfList background refresh skipped: \(error.localizedDescription)")
            }
        }
    }

    private func fetchSnapshot(using state: AppState, userId: String) async throws -> BookshelfSnapshot {
        let fetched = try await state.collectionRepository.fetchCollections(userId: userId)

        // Fetch all user projects and words once so every bookshelf card can render rich stats.
        let allProjects = try await state.activeRepository.fetchProjects(userId: userId)
        let allWords = try await state.activeRepository.fetchAllWords(userId: userId)
        let projectMap = Dictionary(uniqueKeysWithValues: allProjects.map { ($0.id, $0) })
        let wordsByProject = Dictionary(grouping: allWords, by: \.projectId)

        var collectionStats: [String: CollectionStats] = [:]

        await withTaskGroup(of: (String, CollectionStats).self) { group in
            for collection in fetched {
                group.addTask {
                    let cps = (try? await state.collectionRepository.fetchCollectionProjects(collectionId: collection.id)) ?? []
                    let projectIds = cps.map(\.projectId)
                    let projects = projectIds.compactMap { projectMap[$0] }

                    // Build previews (up to 3)
                    var previews: [CollectionProjectPreview] = []
                    for pid in projectIds.prefix(3) {
                        if let project = projectMap[pid] {
                            previews.append(CollectionProjectPreview(
                                id: project.id,
                                title: project.title,
                                iconImage: project.iconImage,
                                iconImageCacheKey: project.iconImage.map { "\(project.id):\($0.hashValue)" }
                            ))
                        }
                    }

                    var totalWordCount = 0
                    var masteredWordCount = 0
                    var reviewWordCount = 0
                    var newWordCount = 0

                    for projectId in projectIds {
                        for word in wordsByProject[projectId] ?? [] {
                            totalWordCount += 1
                            switch word.status {
                            case .mastered:
                                masteredWordCount += 1
                            case .review:
                                reviewWordCount += 1
                            case .new:
                                newWordCount += 1
                            }
                        }
                    }

                    return (collection.id, CollectionStats(
                        projectCount: projectIds.count,
                        previews: previews,
                        totalWordCount: totalWordCount,
                        masteredWordCount: masteredWordCount,
                        reviewWordCount: reviewWordCount,
                        newWordCount: newWordCount,
                        sharedProjectCount: projects.filter { $0.shareId != nil }.count,
                        pinnedProjectCount: projects.filter(\.isFavorite).count,
                        projectTitles: Array(projects.map(\.title).prefix(3))
                    ))
                }
            }
            for await (collectionId, stat) in group {
                collectionStats[collectionId] = stat
            }
        }

        let snapshot = BookshelfSnapshot(collections: fetched, stats: collectionStats)
        warmCoverCache(with: snapshot)
        return snapshot
    }

    private func warmCoverCache(with snapshot: BookshelfSnapshot) {
        let previews = snapshot.stats.values.flatMap(\.previews)
        guard !previews.isEmpty else { return }

        Task.detached(priority: .utility) {
            for preview in previews {
                guard let iconImage = preview.iconImage else { continue }
                _ = ImageCompressor.decodeBase64Image(iconImage, cacheKey: preview.iconImageCacheKey)
            }
        }
    }
}
