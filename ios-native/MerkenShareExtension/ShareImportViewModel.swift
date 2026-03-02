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

    func retry() {
        if phase == .saving || phase == .loading {
            return
        }

        if case .failure = phase, let input {
            phase = .loading
            Task {
                await loadInitialData(input: input)
            }
            return
        }

        save()
    }

    @MainActor
    func finishAfterSuccess() {
        onComplete()
    }

    private func loadInitialData(input: ShareImportInput) async {
        do {
            let fetchedProjects: [ShareImportProjectOptionDTO] =
                try await withAuthorizedSnapshot { snapshot in
                    try await service.fetchProjects(limit: 20, bearerToken: snapshot.accessToken)
                }

            let candidate: ShareImportPreviewCandidateDTO =
                try await withAuthorizedSnapshot { snapshot in
                    try await service.preview(
                        text: input.text,
                        sourceApp: input.sourceApp,
                        locale: Locale.preferredLanguages.first,
                        bearerToken: snapshot.accessToken
                    )
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
            // Keep the flow usable even when preview fails.
            let fallback = localFallbackCandidate(from: input.text)
            if let fallback {
                english = fallback.english
                if japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    japanese = ""
                }
                warnings = ["プレビューの生成に失敗したため、手動で確認して追加してください。"]
                phase = .editing
                return
            }

            let message = error.localizedDescription
            logger.error("Failed to load share import initial data: \(message, privacy: .public)")
            phase = .failure(message)
        }
    }

    private func localFallbackCandidate(from text: String) -> (english: String, wasSentence: Bool)? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return nil
        }

        if let url = URL(string: trimmed), let host = url.host {
            let hostTokens = host
                .components(separatedBy: CharacterSet(charactersIn: ".-"))
                .filter { $0.count > 1 && $0.range(of: "^[A-Za-z]+$", options: .regularExpression) != nil }
            if let best = hostTokens.max(by: { $0.count < $1.count }) {
                return (english: best.lowercased(), wasSentence: false)
            }
        }

        guard let regex = try? NSRegularExpression(pattern: #"[A-Za-z][A-Za-z'\-]{1,63}"#) else {
            return nil
        }
        let nsText = trimmed as NSString
        let matches = regex.matches(in: trimmed, range: NSRange(location: 0, length: nsText.length))
        guard !matches.isEmpty else {
            return nil
        }

        let candidates = matches.map { nsText.substring(with: $0.range) }
        let selected = candidates.max(by: { $0.count < $1.count }) ?? candidates[0]
        let wasSentence = candidates.count > 1 || trimmed.range(of: #"[.!?。！？]"#, options: .regularExpression) != nil
        return (english: selected.lowercased(), wasSentence: wasSentence)
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
                    userId: refreshedSnapshot.userId,
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
