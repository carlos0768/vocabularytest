import Foundation
import OSLog

@MainActor
final class ShareImportViewModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case loginRequired
        case editing
        case saving
        case success(String)
        case failure(String)
    }

    @Published var phase: Phase = .loading
    @Published var sourceText: String = ""
    @Published var english: String = ""
    @Published var japanese: String = ""
    @Published var warnings: [String] = []
    @Published var projectOptions: [ShareImportProjectOptionDTO] = []
    @Published var selectedProjectId: String?
    @Published var useNewProject: Bool = false
    @Published var newProjectTitle: String = ""

    private let logger = Logger(subsystem: "MerkenShareExtension", category: "ShareImport")
    private let service: ShareImportService
    private let onCancel: @MainActor () -> Void
    private let onComplete: @MainActor () -> Void

    private var authSnapshot: SharedAuthSnapshot?
    private var input: ShareImportInput?

    init(
        service: ShareImportService,
        onCancel: @escaping @MainActor () -> Void,
        onComplete: @escaping @MainActor () -> Void
    ) {
        self.service = service
        self.onCancel = onCancel
        self.onComplete = onComplete
    }

    var canSave: Bool {
        let hasEnglish = !english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasJapanese = !japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasTarget: Bool = {
            if useNewProject { return true }
            return selectedProjectId != nil
        }()
        return hasEnglish && hasJapanese && hasTarget
    }

    func bootstrap(with input: ShareImportInput) {
        self.input = input
        self.sourceText = input.text

        guard let snapshot = ShareImportBridge.loadAuthSnapshot() else {
            phase = .loginRequired
            return
        }

        self.authSnapshot = snapshot
        phase = .loading

        Task {
            await loadInitialData(input: input)
        }
    }

    func close() {
        onCancel()
    }

    func save() {
        guard canSave, phase != .saving else { return }
        guard authSnapshot != nil else {
            phase = .loginRequired
            return
        }

        phase = .saving

        Task {
            await commit()
        }
    }

    @MainActor
    func finishAfterSuccess() {
        onComplete()
    }

    private func loadInitialData(input: ShareImportInput) async {
        do {
            let (candidate, fetchedProjects): (ShareImportPreviewCandidateDTO, [ShareImportProjectOptionDTO]) =
                try await withAuthorizedSnapshot { snapshot in
                    async let preview = service.preview(
                        text: input.text,
                        sourceApp: input.sourceApp,
                        locale: Locale.preferredLanguages.first,
                        bearerToken: snapshot.accessToken
                    )
                    async let projects = service.fetchProjects(limit: 20, bearerToken: snapshot.accessToken)
                    return try await (preview, projects)
                }

            english = candidate.english
            japanese = candidate.japanese
            warnings = candidate.warnings
            projectOptions = fetchedProjects
            selectedProjectId = fetchedProjects.first?.id
            useNewProject = fetchedProjects.isEmpty
            phase = .editing
        } catch ShareImportServiceError.unauthorized {
            phase = .loginRequired
        } catch {
            let message = error.localizedDescription
            logger.error("Failed to load share import initial data: \(message, privacy: .public)")
            phase = .failure(message)
        }
    }

    private func commit() async {
        do {
            let trimmedEnglish = english.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedJapanese = japanese.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedProjectTitle = newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)

            let result: ShareImportCommitResultDTO = try await withAuthorizedSnapshot { refreshedSnapshot in
                try await service.commit(
                    targetProjectId: useNewProject ? nil : selectedProjectId,
                    newProjectTitle: useNewProject ? (trimmedProjectTitle.isEmpty ? nil : trimmedProjectTitle) : nil,
                    english: trimmedEnglish,
                    japanese: trimmedJapanese,
                    originalText: input?.text,
                    sourceApp: input?.sourceApp,
                    bearerToken: refreshedSnapshot.accessToken
                )
            }

            let addedCount = result.created ? 1 : 0
            let event = SharedImportEvent(
                id: UUID().uuidString,
                projectId: result.projectId,
                projectTitle: result.projectTitle,
                wordCount: addedCount,
                createdAt: .now
            )
            ShareImportBridge.saveImportEvent(event)

            if result.duplicate {
                phase = .success("既存の単語が見つかったため、重複追加は行いませんでした。")
            } else {
                phase = .success("「\(result.projectTitle)」に追加しました。")
            }
        } catch ShareImportServiceError.unauthorized {
            phase = .loginRequired
        } catch {
            let message = error.localizedDescription
            logger.error("Failed to commit share import: \(message, privacy: .public)")
            phase = .failure(message)
        }
    }

    private func withAuthorizedSnapshot<T>(
        _ operation: (SharedAuthSnapshot) async throws -> T
    ) async throws -> T {
        guard let snapshot = authSnapshot else {
            throw ShareImportServiceError.unauthorized
        }

        do {
            let activeSnapshot = try await refreshedSnapshotIfNeeded(from: snapshot, force: false)
            return try await operation(activeSnapshot)
        } catch ShareImportServiceError.unauthorized {
            let refreshed = try await refreshedSnapshotIfNeeded(from: snapshot, force: true)
            return try await operation(refreshed)
        }
    }

    private func refreshedSnapshotIfNeeded(
        from snapshot: SharedAuthSnapshot,
        force: Bool
    ) async throws -> SharedAuthSnapshot {
        if !force, !snapshot.isExpired {
            return snapshot
        }

        guard snapshot.refreshToken?.isEmpty == false else {
            throw ShareImportServiceError.unauthorized
        }

        let refreshed = try await service.refreshSession(using: snapshot)
        authSnapshot = refreshed
        ShareImportBridge.saveAuthSnapshot(refreshed)
        return refreshed
    }
}
