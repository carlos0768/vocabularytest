import Foundation
import OSLog

private actor BackgroundRefreshDeduplicator {
    private var runningKeys: Set<String> = []

    func runIfNeeded(
        key: String,
        operation: @escaping @Sendable () async -> Void
    ) async {
        guard runningKeys.insert(key).inserted else { return }
        defer {
            runningKeys.remove(key)
        }
        await operation()
    }
}

final class OfflineFirstCloudRepository: WordRepositoryProtocol, ProjectShareServiceProtocol, OfflinePrefetchingRepository {
    private let cloudRepository: CloudWordRepository
    private let cacheStore: CloudOfflineCacheStore
    private let userIdProvider: @Sendable () async -> String?
    private let forceAuthRefresh: @Sendable () async -> Void
    private let logger = Logger(subsystem: "MerkenIOS", category: "OfflineFirstRepo")
    private let refreshDeduplicator = BackgroundRefreshDeduplicator()

    private let maxCachedWords = 20_000
    private let recentPrefetchLimit = 10
    private let refreshRetryLimit = 3

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
        let cachedProjects = (try? await cacheStore.fetchProjects(userId: userId)) ?? []
        if !cachedProjects.isEmpty {
            refreshProjectsInBackground(userId: userId)
            return cachedProjects
        }

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

    func updateProjectIcon(id: String, iconImage: String?) async throws {
        try await cloudRepository.updateProjectIcon(id: id, iconImage: iconImage)
        try? await cacheStore.updateProjectIcon(id: id, iconImage: iconImage)
    }

    func updateProjectFavorite(id: String, isFavorite: Bool) async throws {
        try await cloudRepository.updateProjectFavorite(id: id, isFavorite: isFavorite)
        try? await cacheStore.updateProjectFavorite(id: id, isFavorite: isFavorite)
    }

    func updateProjectSourceLabels(id: String, sourceLabels: [String]) async throws {
        let normalized = normalizeProjectSourceLabels(sourceLabels)
        try await cloudRepository.updateProjectSourceLabels(id: id, sourceLabels: normalized)
        try? await cacheStore.updateProjectSourceLabels(id: id, sourceLabels: normalized)
    }

    func deleteProject(id: String) async throws {
        try await cloudRepository.deleteProject(id: id)
        try? await cacheStore.deleteProject(id: id)
    }

    func fetchWords(projectId: String) async throws -> [Word] {
        let cachedWords = (try? await cacheStore.fetchWords(projectId: projectId)) ?? []
        if !cachedWords.isEmpty {
            try? await cacheStore.markProjectAccessed(projectId: projectId)
            refreshProjectWordsInBackground(projectId: projectId)
            return cachedWords
        }

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
        let cachedWords = (try? await cacheStore.fetchAllWords(userId: userId)) ?? []
        if !cachedWords.isEmpty {
            refreshAllWordsInBackground(userId: userId)
            return cachedWords
        }

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

    @discardableResult
    func refreshSnapshotFromCloud(userId: String) async -> Bool {
        var refreshedProjects = false
        var refreshedWords = false

        do {
            let projects = try await performRetryableRefresh(
                label: "project snapshot refresh",
                attempts: refreshRetryLimit
            ) {
                try await self.cloudRepository.fetchProjects(userId: userId)
            }
            try? await cacheStore.replaceProjects(userId: userId, projects: projects)
            refreshedProjects = true
        } catch {
            logger.warning("Forced project refresh skipped: \(error.localizedDescription, privacy: .public)")
        }

        do {
            let words = try await performRetryableRefresh(
                label: "word snapshot refresh",
                attempts: refreshRetryLimit
            ) {
                try await self.cloudRepository.fetchAllWords(userId: userId)
            }
            try? await cacheStore.replaceAllWords(userId: userId, words: words)
            await enforceWordLimit(userId: userId)
            refreshedWords = true
        } catch {
            logger.warning("Forced all-words refresh skipped: \(error.localizedDescription, privacy: .public)")
        }

        return refreshedProjects && refreshedWords
    }

    @discardableResult
    func refreshCompletedScanProjectFromCloud(userId: String, projectId: String?) async -> Bool {
        var refreshedProjects = false
        var refreshedProjectWords = projectId == nil

        do {
            let projects = try await performRetryableRefresh(
                label: "scan completion project refresh",
                attempts: refreshRetryLimit
            ) {
                try await self.cloudRepository.fetchProjects(userId: userId)
            }
            try? await cacheStore.replaceProjects(userId: userId, projects: projects)
            refreshedProjects = true
        } catch {
            logger.warning("Forced scan-completion project refresh skipped: \(error.localizedDescription, privacy: .public)")
        }

        if let projectId, !projectId.isEmpty {
            do {
                let words = try await performRetryableRefresh(
                    label: "scan completion word refresh",
                    attempts: refreshRetryLimit
                ) {
                    try await self.cloudRepository.fetchWords(projectId: projectId)
                }
                try? await cacheStore.replaceWords(
                    userId: userId,
                    projectId: projectId,
                    words: words,
                    markAsAccessed: true
                )
                await enforceWordLimit(userId: userId)
                refreshedProjectWords = true
            } catch {
                logger.warning(
                    "Forced scan-completion word refresh skipped for \(projectId, privacy: .public): \(error.localizedDescription, privacy: .public)"
                )
            }
        }

        if refreshedProjects || refreshedProjectWords {
            return true
        }

        guard let projectId, !projectId.isEmpty else {
            return false
        }

        let cachedProjects = (try? await cacheStore.fetchProjects(userId: userId)) ?? []
        return cachedProjects.contains(where: { $0.id == projectId })
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

    func updateShareScope(projectId: String, shareScope: ProjectShareScope) async throws {
        try await cloudRepository.updateShareScope(projectId: projectId, shareScope: shareScope)
        try? await cacheStore.updateProjectShareScope(id: projectId, shareScope: shareScope)
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

    private func refreshProjectsInBackground(userId: String) {
        runBackgroundRefresh(key: "projects:\(userId)") { [weak self] in
            guard let self else { return }
            do {
                let projects = try await self.cloudRepository.fetchProjects(userId: userId)
                try? await self.cacheStore.replaceProjects(userId: userId, projects: projects)
            } catch {
                self.logger.debug("Background project refresh skipped: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private func refreshProjectWordsInBackground(projectId: String) {
        runBackgroundRefresh(key: "words:\(projectId)") { [weak self] in
            guard let self else { return }
            do {
                let words = try await self.cloudRepository.fetchWords(projectId: projectId)
                if let resolvedUserId = await self.resolveUserId(projectId: projectId) {
                    try? await self.cacheStore.replaceWords(
                        userId: resolvedUserId,
                        projectId: projectId,
                        words: words,
                        markAsAccessed: true
                    )
                    await self.enforceWordLimit(userId: resolvedUserId)
                }
            } catch {
                self.logger.debug("Background word refresh skipped for \(projectId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private func refreshAllWordsInBackground(userId: String) {
        runBackgroundRefresh(key: "allWords:\(userId)") { [weak self] in
            guard let self else { return }
            do {
                let words = try await self.cloudRepository.fetchAllWords(userId: userId)
                try? await self.cacheStore.replaceAllWords(userId: userId, words: words)
                await self.enforceWordLimit(userId: userId)
            } catch {
                self.logger.debug("Background all-words refresh skipped: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private func runBackgroundRefresh(
        key: String,
        operation: @escaping @Sendable () async -> Void
    ) {
        Task(priority: .utility) { [weak self] in
            guard let self else { return }
            await self.refreshDeduplicator.runIfNeeded(key: key, operation: operation)
        }
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

    private func performRetryableRefresh<T>(
        label: String,
        attempts: Int,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        precondition(attempts > 0, "attempts must be positive")

        var lastError: Error?

        for attempt in 1...attempts {
            do {
                return try await operation()
            } catch {
                lastError = error

                let shouldRetry = attempt < attempts && isRetryableNetworkError(error)
                if !shouldRetry {
                    throw error
                }

                let delayNs = UInt64(500_000_000 * attempt)
                logger.notice(
                    "\(label, privacy: .public) retry \(attempt, privacy: .public)/\(attempts, privacy: .public) after: \(error.localizedDescription, privacy: .public)"
                )
                try? await Task.sleep(nanoseconds: delayNs)
            }
        }

        throw lastError ?? RepositoryError.underlying("Retryable refresh failed")
    }

    private func isRetryableNetworkError(_ error: Error) -> Bool {
        for candidate in nsErrorChain(from: error) {
            if candidate.domain == NSURLErrorDomain {
                let code = URLError.Code(rawValue: candidate.code)
                switch code {
                case .networkConnectionLost,
                     .notConnectedToInternet,
                     .timedOut,
                     .cannotFindHost,
                     .cannotConnectToHost,
                     .dnsLookupFailed,
                     .internationalRoamingOff,
                     .callIsActive,
                     .dataNotAllowed,
                     .secureConnectionFailed:
                    return true
                default:
                    break
                }
            }

            if candidate.domain == kCFErrorDomainCFNetwork as String {
                switch candidate.code {
                case URLError.networkConnectionLost.rawValue,
                     URLError.notConnectedToInternet.rawValue,
                     URLError.timedOut.rawValue,
                     URLError.cannotFindHost.rawValue,
                     URLError.cannotConnectToHost.rawValue,
                     URLError.dnsLookupFailed.rawValue:
                    return true
                default:
                    break
                }
            }
        }

        return false
    }

    private func nsErrorChain(from error: Error) -> [NSError] {
        var results: [NSError] = []
        var current: NSError? = error as NSError

        while let candidate = current {
            results.append(candidate)
            current = candidate.userInfo[NSUnderlyingErrorKey] as? NSError
        }

        return results
    }
}
