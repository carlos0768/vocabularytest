import Foundation
import OSLog

@MainActor
final class SharedProjectDetailViewModel: ObservableObject {
    private struct SharedProjectDetailCacheEntry {
        var project: Project
        var words: [Word]
        var accessRole: SharedProjectAccessRole
        var collaboratorCount: Int
    }

    private static var cache: [String: SharedProjectDetailCacheEntry] = [:]

    @Published private(set) var project: Project?
    @Published private(set) var words: [Word] = []
    @Published private(set) var accessRole: SharedProjectAccessRole = .editor
    @Published private(set) var collaboratorCount = 1
    @Published private(set) var loading = false
    @Published private(set) var joining = false
    @Published private(set) var importing = false
    @Published private(set) var importedProjectId: String?
    @Published var errorMessage: String?
    @Published var searchText = ""

    private let logger = Logger(subsystem: "MerkenIOS", category: "SharedProjectDetailVM")

    var filteredWords: [Word] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return words }
        return words.filter {
            $0.english.localizedCaseInsensitiveContains(query)
            || $0.japanese.localizedCaseInsensitiveContains(query)
        }
    }

    @discardableResult
    private func seedFromCache(projectId: String) -> Bool {
        if let cached = Self.cache[projectId] {
            apply(cached)
            return true
        }

        guard let snapshot = SharedProjectPersistentCache.loadDetail(projectId: projectId) else { return false }
        let cached = SharedProjectDetailCacheEntry(
            project: snapshot.project,
            words: snapshot.words,
            accessRole: snapshot.accessRole,
            collaboratorCount: snapshot.collaboratorCount
        )
        Self.cache[projectId] = cached
        apply(cached)
        return true
    }

    private func apply(_ cached: SharedProjectDetailCacheEntry) {
        project = cached.project
        words = cached.words
        accessRole = cached.accessRole
        collaboratorCount = cached.collaboratorCount
        errorMessage = nil
    }

    private func updateCache(projectId: String) {
        guard let project else { return }
        let cached = SharedProjectDetailCacheEntry(
            project: project,
            words: words,
            accessRole: accessRole,
            collaboratorCount: collaboratorCount
        )
        Self.cache[projectId] = cached
        SharedProjectPersistentCache.saveDetail(
            SharedProjectPersistentCache.DetailSnapshot(
                project: project,
                words: words,
                accessRole: accessRole,
                collaboratorCount: collaboratorCount
            ),
            projectId: projectId
        )
    }

    func load(projectId: String, using state: AppState, allowCachedSeed: Bool = true) async {
        let hadCache = allowCachedSeed && seedFromCache(projectId: projectId)
        loading = !hadCache
        defer { loading = false }

        do {
            let detail = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.fetchSharedProjectDetail(
                    projectId: projectId,
                    bearerToken: bearerToken
                )
            }
            project = detail.project
            words = detail.words.sorted { $0.createdAt < $1.createdAt }
            accessRole = detail.accessRole
            collaboratorCount = detail.collaboratorCount
            updateCache(projectId: projectId)
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                return
            }
            if !hadCache {
                errorMessage = error.localizedDescription
            }
            logger.error("Shared project detail load failed: \(error.localizedDescription)")
        }
    }

    func addWord(
        english: String,
        japanese: String,
        projectId: String,
        using state: AppState
    ) async {
        do {
            let created = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.createSharedProjectWord(
                    projectId: projectId,
                    english: english,
                    japanese: japanese,
                    bearerToken: bearerToken
                )
            }
            words.append(created)
            words.sort { $0.createdAt < $1.createdAt }
            updateCache(projectId: projectId)
            errorMessage = nil
            state.bumpDataVersion()
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project add word failed: \(error.localizedDescription)")
        }
    }

    func updateWord(
        wordId: String,
        english: String,
        japanese: String,
        projectId: String,
        using state: AppState
    ) async {
        do {
            let updated = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.updateSharedProjectWord(
                    projectId: projectId,
                    wordId: wordId,
                    english: english,
                    japanese: japanese,
                    bearerToken: bearerToken
                )
            }
            if let index = words.firstIndex(where: { $0.id == wordId }) {
                words[index] = updated
            }
            words.sort { $0.createdAt < $1.createdAt }
            updateCache(projectId: projectId)
            errorMessage = nil
            state.bumpDataVersion()
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project update word failed: \(error.localizedDescription)")
        }
    }

    func deleteWord(
        wordId: String,
        projectId: String,
        using state: AppState
    ) async {
        do {
            try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.deleteSharedProjectWord(
                    projectId: projectId,
                    wordId: wordId,
                    bearerToken: bearerToken
                )
            }
            words.removeAll { $0.id == wordId }
            updateCache(projectId: projectId)
            errorMessage = nil
            state.bumpDataVersion()
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project delete word failed: \(error.localizedDescription)")
        }
    }

    func importToLocal(title: String, words: [Word], sourceShareId: String? = nil, using state: AppState) async {
        importing = true
        defer { importing = false }

        do {
            let newProject = try await state.activeRepository.createProject(
                title: title,
                userId: state.activeUserId,
                iconImage: nil,
                importedFromShareId: sourceShareId
            )

            if !words.isEmpty {
                let inputs = words.map { word in
                    WordInput(
                        projectId: newProject.id,
                        english: word.english,
                        japanese: word.japanese,
                        distractors: word.distractors,
                        exampleSentence: word.exampleSentence,
                        exampleSentenceJa: word.exampleSentenceJa,
                        pronunciation: word.pronunciation,
                        partOfSpeechTags: word.partOfSpeechTags,
                        vocabularyType: word.vocabularyType
                    )
                }
                _ = try await state.activeRepository.createWords(inputs)
            }

            importedProjectId = newProject.id
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Import shared project to local failed: \(error.localizedDescription)")
        }
    }

    func join(
        shareCode: String,
        projectId: String,
        using state: AppState
    ) async {
        joining = true
        defer { joining = false }

        do {
            _ = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.joinSharedProject(
                    codeOrLink: shareCode,
                    bearerToken: bearerToken
                )
            }
            state.bumpDataVersion()
            await load(projectId: projectId, using: state, allowCachedSeed: false)
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project join from detail failed: \(error.localizedDescription)")
        }
    }
}
