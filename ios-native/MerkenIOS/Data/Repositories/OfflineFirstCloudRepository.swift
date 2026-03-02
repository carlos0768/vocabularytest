import Foundation
import OSLog

final class OfflineFirstCloudRepository: WordRepositoryProtocol, ProjectShareServiceProtocol, OfflinePrefetchingRepository {
    private let cloudRepository: CloudWordRepository
    private let cacheStore: CloudOfflineCacheStore
    private let userIdProvider: @Sendable () async -> String?
    private let forceAuthRefresh: @Sendable () async -> Void
    private let logger = Logger(subsystem: "MerkenIOS", category: "OfflineFirstRepo")

    private let maxCachedWords = 20_000
    private let recentPrefetchLimit = 10

    init(
        cloudRepository: CloudWordRepository,
        cacheStore: CloudOfflineCacheStore,
        userIdProvider: @escaping @Sendable () async -> String?,
        forceAuthRefresh: @escaping @Sendable () async -> Void
    ) {
        self.cloudRepository = cloudRepository
        self.cacheStore = cacheStore
        self.userIdProvider = userIdProvider
        self.forceAuthRefresh = forceAuthRefresh
    }

    func fetchProjects(userId: String) async throws -> [Project] {
        do {
            let projects = try await cloudRepository.fetchProjects(userId: userId)
            try? await cacheStore.replaceProjects(userId: userId, projects: projects)
            return projects
        } catch {
            return try await fallbackProjects(userId: userId, sourceError: error)
        }
    }

    func createProject(title: String, userId: String, iconImage: String?) async throws -> Project {
        let created = try await cloudRepository.createProject(title: title, userId: userId, iconImage: iconImage)
        try? await cacheStore.upsertProject(created)
        return created
    }

    func updateProject(id: String, title: String) async throws {
        try await cloudRepository.updateProject(id: id, title: title)
        try? await cacheStore.updateProjectTitle(id: id, title: title)
    }

    func updateProjectIcon(id: String, iconImage: String) async throws {
        try await cloudRepository.updateProjectIcon(id: id, iconImage: iconImage)
        try? await cacheStore.updateProjectIcon(id: id, iconImage: iconImage)
    }

    func updateProjectFavorite(id: String, isFavorite: Bool) async throws {
        try await cloudRepository.updateProjectFavorite(id: id, isFavorite: isFavorite)
        try? await cacheStore.updateProjectFavorite(id: id, isFavorite: isFavorite)
    }

    func deleteProject(id: String) async throws {
        try await cloudRepository.deleteProject(id: id)
        try? await cacheStore.deleteProject(id: id)
    }

    func fetchWords(projectId: String) async throws -> [Word] {
        do {
            let words = try await cloudRepository.fetchWords(projectId: projectId)
            if let resolvedUserId = await resolveUserId(projectId: projectId) {
                try? await cacheStore.replaceWords(
                    userId: resolvedUserId,
                    projectId: projectId,
                    words: words,
                    markAsAccessed: true
                )
                await enforceWordLimit(userId: resolvedUserId)
            } else {
                logger.warning("Unable to resolve userId for project cache write: \(projectId, privacy: .public)")
            }
            return words
        } catch {
            return try await fallbackWords(projectId: projectId, sourceError: error)
        }
    }

    func fetchAllWords(userId: String) async throws -> [Word] {
        do {
            let words = try await cloudRepository.fetchAllWords(userId: userId)
            try? await cacheStore.replaceAllWords(userId: userId, words: words)
            await enforceWordLimit(userId: userId)
            return words
        } catch {
            return try await fallbackAllWords(userId: userId, sourceError: error)
        }
    }

    func createWords(_ inputs: [WordInput]) async throws -> [Word] {
        let created = try await cloudRepository.createWords(inputs)
        guard !created.isEmpty else { return created }

        if let projectId = created.first?.projectId,
           let resolvedUserId = await resolveUserId(projectId: projectId) {
            try? await cacheStore.upsertWords(userId: resolvedUserId, words: created, markAsAccessed: true)
            await enforceWordLimit(userId: resolvedUserId)
        }

        return created
    }

    func updateWord(id: String, patch: WordPatch) async throws {
        try await cloudRepository.updateWord(id: id, patch: patch)
        try? await cacheStore.patchWord(id: id, patch: patch)
    }

    func deleteWord(id: String) async throws {
        try await cloudRepository.deleteWord(id: id)
        try? await cacheStore.deleteWord(id: id)
    }

    func generateShareId(projectId: String) async throws -> String {
        let shareId = try await cloudRepository.generateShareId(projectId: projectId)
        try? await cacheStore.updateProjectShareId(id: projectId, shareId: shareId)
        return shareId
    }

    func prefetchRecentProjects(userId: String, limit: Int = 10) async {
        guard limit > 0 else { return }

        do {
            let projects = try await cloudRepository.fetchProjects(userId: userId)
            try? await cacheStore.replaceProjects(userId: userId, projects: projects)

            let accessOrderedProjectIds = (try? await cacheStore.recentProjectIDs(userId: userId, limit: limit)) ?? []
            let cloudProjectIds = projects.map(\.id)
            var targetIds: [String] = []

            for id in accessOrderedProjectIds where cloudProjectIds.contains(id) {
                targetIds.append(id)
            }

            if targetIds.count < limit {
                for id in cloudProjectIds where !targetIds.contains(id) {
                    targetIds.append(id)
                    if targetIds.count >= limit {
                        break
                    }
                }
            }

            for projectId in targetIds {
                do {
                    let words = try await cloudRepository.fetchWords(projectId: projectId)
                    try? await cacheStore.replaceWords(
                        userId: userId,
                        projectId: projectId,
                        words: words,
                        markAsAccessed: false
                    )
                } catch {
                    logger.warning("Prefetch words failed for \(projectId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }

            try? await cacheStore.enforceWordLimit(
                userId: userId,
                maxWords: maxCachedWords,
                protectedProjectIDs: Set(targetIds)
            )
        } catch {
            logger.warning("Prefetch projects failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func fallbackProjects(userId: String, sourceError: Error) async throws -> [Project] {
        let cached = (try? await cacheStore.fetchProjects(userId: userId)) ?? []
        guard !cached.isEmpty else {
            throw sourceError
        }

        if isUnauthorized(sourceError) {
            triggerAuthRefresh()
        }

        return cached
    }

    private func fallbackWords(projectId: String, sourceError: Error) async throws -> [Word] {
        let cached = (try? await cacheStore.fetchWords(projectId: projectId)) ?? []
        guard !cached.isEmpty else {
            throw sourceError
        }

        try? await cacheStore.markProjectAccessed(projectId: projectId)
        if isUnauthorized(sourceError) {
            triggerAuthRefresh()
        }

        return cached
    }

    private func fallbackAllWords(userId: String, sourceError: Error) async throws -> [Word] {
        let cached = (try? await cacheStore.fetchAllWords(userId: userId)) ?? []
        guard !cached.isEmpty else {
            throw sourceError
        }

        if isUnauthorized(sourceError) {
            triggerAuthRefresh()
        }

        return cached
    }

    private func enforceWordLimit(userId: String) async {
        let protectedIds = (try? await cacheStore.recentProjectIDs(userId: userId, limit: recentPrefetchLimit)) ?? []
        try? await cacheStore.enforceWordLimit(
            userId: userId,
            maxWords: maxCachedWords,
            protectedProjectIDs: Set(protectedIds)
        )
    }

    private func resolveUserId(projectId: String) async -> String? {
        if let current = await userIdProvider(), !current.isEmpty {
            return current
        }
        return try? await cacheStore.userIdForProject(projectId: projectId)
    }

    private func isUnauthorized(_ error: Error) -> Bool {
        guard let repositoryError = error as? RepositoryError else {
            return false
        }
        if case .unauthorized = repositoryError {
            return true
        }
        return false
    }

    private func triggerAuthRefresh() {
        Task {
            await forceAuthRefresh()
        }
    }
}
