import Foundation
import OSLog

@MainActor
final class SharedProjectsViewModel: ObservableObject {
    private struct SharedProjectsCacheEntry {
        var ownedProjects: [SharedProjectSummary]
        var joinedProjects: [SharedProjectSummary]
        var publicProjects: [SharedProjectSummary]
    }

    private static var cache: [String: SharedProjectsCacheEntry] = [:]

    @Published private(set) var ownedProjects: [SharedProjectSummary] = []
    @Published private(set) var joinedProjects: [SharedProjectSummary] = []
    @Published private(set) var publicProjects: [SharedProjectSummary] = []
    @Published private(set) var loading = false

    var allSharedProjects: [SharedProjectSummary] {
        var seenProjectIds: Set<String> = []
        var merged: [SharedProjectSummary] = []

        for item in ownedProjects + joinedProjects + publicProjects where seenProjectIds.insert(item.project.id).inserted {
            merged.append(item)
        }

        return merged
    }

    var publicProjectCount: Int {
        allSharedProjects.filter { $0.project.shareScope == .publicListed }.count
    }
    @Published private(set) var joining = false
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "SharedProjectsVM")

    private func cacheKey(for state: AppState) -> String {
        state.session?.userId ?? state.activeUserId
    }

    @discardableResult
    private func seedFromCache(cacheKey: String) -> Bool {
        if let cached = Self.cache[cacheKey] {
            apply(cached)
            return true
        }

        guard let snapshot = SharedProjectPersistentCache.loadCatalog(for: cacheKey) else { return false }
        let cached = SharedProjectsCacheEntry(
            ownedProjects: snapshot.ownedProjects,
            joinedProjects: snapshot.joinedProjects,
            publicProjects: snapshot.publicProjects
        )
        Self.cache[cacheKey] = cached
        apply(cached)
        return true
    }

    private func apply(_ cached: SharedProjectsCacheEntry) {
        ownedProjects = cached.ownedProjects
        joinedProjects = cached.joinedProjects
        publicProjects = cached.publicProjects
        errorMessage = nil
    }

    private func updateCache(cacheKey: String) {
        let cached = SharedProjectsCacheEntry(
            ownedProjects: ownedProjects,
            joinedProjects: joinedProjects,
            publicProjects: publicProjects
        )
        Self.cache[cacheKey] = cached
        SharedProjectPersistentCache.saveCatalog(
            SharedProjectPersistentCache.CatalogSnapshot(
                ownedProjects: ownedProjects,
                joinedProjects: joinedProjects,
                publicProjects: publicProjects
            ),
            for: cacheKey
        )
    }

    func load(using state: AppState, allowCachedSeed: Bool = true) async {
        guard state.isLoggedIn else {
            ownedProjects = []
            joinedProjects = []
            publicProjects = []
            errorMessage = nil
            loading = false
            return
        }

        let key = cacheKey(for: state)
        let hadCache = allowCachedSeed && seedFromCache(cacheKey: key)
        loading = !hadCache
        defer { loading = false }

        do {
            let catalog = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.fetchSharedProjects(bearerToken: bearerToken)
            }
            ownedProjects = catalog.owned
            joinedProjects = catalog.joined
            publicProjects = catalog.publicProjects
            updateCache(cacheKey: key)
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                return
            }
            if !hadCache {
                errorMessage = error.localizedDescription
            }
            logger.error("Shared projects load failed: \(error.localizedDescription)")
        }
    }

    func join(codeOrLink: String, using state: AppState) async -> SharedProjectSummary? {
        let trimmed = codeOrLink.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "共有コードまたはリンクを入力してください。"
            return nil
        }

        joining = true
        defer { joining = false }

        do {
            let summary = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.joinSharedProject(
                    codeOrLink: trimmed,
                    bearerToken: bearerToken
                )
            }
            await load(using: state, allowCachedSeed: false)
            state.bumpDataVersion()
            return summary
        } catch {
            if error.isCancellationError {
                return nil
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project join failed: \(error.localizedDescription)")
            return nil
        }
    }
}

enum SharedProjectPersistentCache {
    struct CatalogSnapshot: Codable {
        var ownedProjects: [SharedProjectSummary]
        var joinedProjects: [SharedProjectSummary]
        var publicProjects: [SharedProjectSummary]
        var cachedAt: Date

        init(
            ownedProjects: [SharedProjectSummary],
            joinedProjects: [SharedProjectSummary],
            publicProjects: [SharedProjectSummary],
            cachedAt: Date = .now
        ) {
            self.ownedProjects = ownedProjects
            self.joinedProjects = joinedProjects
            self.publicProjects = publicProjects
            self.cachedAt = cachedAt
        }
    }

    struct DetailSnapshot: Codable {
        var project: Project
        var words: [Word]
        var accessRole: SharedProjectAccessRole
        var collaboratorCount: Int
        var cachedAt: Date

        init(
            project: Project,
            words: [Word],
            accessRole: SharedProjectAccessRole,
            collaboratorCount: Int,
            cachedAt: Date = .now
        ) {
            self.project = project
            self.words = words
            self.accessRole = accessRole
            self.collaboratorCount = collaboratorCount
            self.cachedAt = cachedAt
        }
    }

    private static let directoryName = "SharedProjectCache"

    static func loadCatalog(for cacheKey: String) -> CatalogSnapshot? {
        load(CatalogSnapshot.self, from: catalogURL(for: cacheKey))
    }

    static func saveCatalog(_ snapshot: CatalogSnapshot, for cacheKey: String) {
        save(snapshot, to: catalogURL(for: cacheKey))
    }

    static func loadDetail(projectId: String) -> DetailSnapshot? {
        load(DetailSnapshot.self, from: detailURL(for: projectId))
    }

    static func saveDetail(_ snapshot: DetailSnapshot, projectId: String) {
        save(snapshot, to: detailURL(for: projectId))
    }

    private static func load<Value: Decodable>(_ type: Value.Type, from url: URL?) -> Value? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func save<Value: Encodable>(_ value: Value, to url: URL?) {
        guard let url else { return }
        do {
            let data = try JSONEncoder().encode(value)
            try data.write(to: url, options: [.atomic])
        } catch {
            return
        }
    }

    private static func catalogURL(for cacheKey: String) -> URL? {
        cacheDirectory()?.appendingPathComponent("catalog-\(fileSafeKey(cacheKey)).json")
    }

    private static func detailURL(for projectId: String) -> URL? {
        cacheDirectory()?.appendingPathComponent("detail-\(fileSafeKey(projectId)).json")
    }

    private static func cacheDirectory() -> URL? {
        let fileManager = FileManager.default
        let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
        guard let baseURL else { return nil }

        let directoryURL = baseURL
            .appendingPathComponent("MerkenIOS", isDirectory: true)
            .appendingPathComponent(directoryName, isDirectory: true)
        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            return directoryURL
        } catch {
            return nil
        }
    }

    private static func fileSafeKey(_ value: String) -> String {
        Data(value.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
    }
}
