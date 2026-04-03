import Foundation
import OSLog

@MainActor
final class SharedProjectDetailViewModel: ObservableObject {
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

    func load(projectId: String, using state: AppState) async {
        loading = true
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
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
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

    func importToLocal(title: String, words: [Word], using state: AppState) async {
        importing = true
        defer { importing = false }

        do {
            let newProject = try await state.activeRepository.createProject(
                title: title,
                userId: state.activeUserId,
                iconImage: nil
            )

            if !words.isEmpty {
                let inputs = words.map { word in
                    WordInput(
                        projectId: newProject.id,
                        english: word.english,
                        japanese: word.japanese,
                        distractors: word.distractors ?? [],
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
            await load(projectId: projectId, using: state)
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project join from detail failed: \(error.localizedDescription)")
        }
    }
}
