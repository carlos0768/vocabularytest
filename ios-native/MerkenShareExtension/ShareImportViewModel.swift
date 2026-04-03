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
    @Published var isPreviewLoading: Bool = false
    @Published var isProjectsLoading: Bool = false

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

        let localEnglishRaw = input.detectedEnglish?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let localJapanese = input.detectedJapanese?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let localEnglish = isTrustedLocalEnglish(localEnglishRaw) ? localEnglishRaw : ""

        if !localEnglish.isEmpty, !localJapanese.isEmpty {
            english = localEnglish
            japanese = localJapanese
            warnings = []
            projectOptions = []
            selectedProjectId = nil
            useNewProject = true
            isProjectsLoading = true
            phase = .editing

            Task {
                await loadProjectOptions(prefilledFromShare: true)
            }
            return
        }

        // Show editing UI immediately with skeleton placeholders for fields still loading
        isPreviewLoading = true
        isProjectsLoading = true
        phase = .editing

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
            isPreviewLoading = true
            isProjectsLoading = true
            phase = .editing
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

    private func loadProjectOptions(prefilledFromShare: Bool) async {
        let fetchedProjects: [ShareImportProjectOptionDTO]
        do {
            fetchedProjects = try await withAuthorizedSnapshot { snapshot in
                try await service.fetchProjects(limit: 20, bearerToken: snapshot.accessToken)
            }
        } catch ShareImportServiceError.unauthorized {
            isProjectsLoading = false
            phase = .loginRequired
            return
        } catch {
            let message = error.localizedDescription
            logger.error("Failed to fetch project list in share import: \(message, privacy: .public)")
            if !prefilledFromShare {
                warnings = dedupeWarnings(warnings + ["単語帳一覧の取得に失敗しました。新規作成で続行できます。"])
            }
            isProjectsLoading = false
            return
        }

        projectOptions = fetchedProjects
        isProjectsLoading = false

        if fetchedProjects.isEmpty {
            useNewProject = true
            selectedProjectId = nil
            return
        }

        if selectedProjectId == nil {
            selectedProjectId = fetchedProjects.first?.id
        }

        if prefilledFromShare {
            useNewProject = false
        }
    }

    private func loadInitialData(input: ShareImportInput) async {
        let localEnglishRaw = input.detectedEnglish?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let localJapanese = input.detectedJapanese?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let localEnglish = isTrustedLocalEnglish(localEnglishRaw) ? localEnglishRaw : ""

        var nextWarnings: [String] = []
        if !localEnglishRaw.isEmpty, localEnglish.isEmpty {
            nextWarnings.append("共有内容の英語候補を判定できなかったため、再取得します。")
        }

        // fetchProjects と preview を並列実行して合計待ち時間を短縮
        async let projectsTask = fetchProjectsResult()
        async let previewTask = fetchPreviewResult(input: input)

        let (projectsResult, previewResult) = await (projectsTask, previewTask)

        // プロジェクト一覧の結果を処理
        switch projectsResult {
        case .success(let projects):
            projectOptions = projects
            selectedProjectId = projects.first?.id
            useNewProject = projects.isEmpty
        case .failure(ShareImportServiceError.unauthorized):
            isPreviewLoading = false
            isProjectsLoading = false
            phase = .loginRequired
            return
        case .failure(let error):
            logger.error("Failed to fetch project list in share import: \(error.localizedDescription, privacy: .public)")
            nextWarnings.append("単語帳一覧の取得に失敗しました。新規作成で続行できます。")
            useNewProject = true
        }
        isProjectsLoading = false

        // プレビュー（翻訳）の結果を処理
        switch previewResult {
        case .success(let candidate):
            english = candidate.english
            japanese = candidate.japanese
            nextWarnings.append(contentsOf: candidate.warnings)
        case .failure(ShareImportServiceError.unauthorized):
            isPreviewLoading = false
            phase = .loginRequired
            return
        case .failure(let error):
            logger.error("Failed to preview share import text: \(error.localizedDescription, privacy: .public)")
            if let fallback = localFallbackCandidate(from: input.text) {
                english = fallback.english
            } else {
                nextWarnings.append(error.localizedDescription)
                nextWarnings.append("自動抽出に失敗したため、手動入力で続行してください。")
            }
        }
        isPreviewLoading = false

        warnings = dedupeWarnings(nextWarnings)
    }

    private func fetchProjectsResult() async -> Result<[ShareImportProjectOptionDTO], Error> {
        do {
            let projects = try await withAuthorizedSnapshot { snapshot in
                try await service.fetchProjects(limit: 20, bearerToken: snapshot.accessToken)
            }
            return .success(projects)
        } catch {
            return .failure(error)
        }
    }

    private func fetchPreviewResult(input: ShareImportInput) async -> Result<ShareImportPreviewCandidateDTO, Error> {
        do {
            let candidate = try await withAuthorizedSnapshot { snapshot in
                try await service.preview(
                    text: input.text,
                    sourceApp: input.sourceApp,
                    locale: Locale.preferredLanguages.first,
                    bearerToken: snapshot.accessToken
                )
            }
            return .success(candidate)
        } catch {
            return .failure(error)
        }
    }

    private func dedupeWarnings(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values.map({ $0.trimmingCharacters(in: .whitespacesAndNewlines) }) where !value.isEmpty {
            if seen.insert(value).inserted {
                result.append(value)
            }
        }
        return result
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

    private func isTrustedLocalEnglish(_ candidate: String) -> Bool {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard trimmed.range(of: #"^[A-Za-z][A-Za-z'\-\s]{0,79}$"#, options: .regularExpression) != nil else {
            return false
        }
        let hasLowercase = trimmed.range(of: #"[a-z]"#, options: .regularExpression) != nil
        let allUppercase = trimmed.range(of: #"[A-Z]"#, options: .regularExpression) != nil && !hasLowercase
        if allUppercase && trimmed.count >= 4 {
            return false
        }
        let lower = trimmed.lowercased()
        let blockedPrefixes = ["troot", "null", "archiver", "bplist", "version", "object", "key", "uid", "cfuid"]
        if blockedPrefixes.contains(where: { lower.hasPrefix($0) }) {
            return false
        }
        return true
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
