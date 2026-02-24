import Foundation
import OSLog
import SwiftUI
import UIKit

struct ScanBannerState: Identifiable, Equatable {
    enum Level: Equatable {
        case success
        case error
    }

    let id = UUID()
    let level: Level
    let title: String
    let message: String
}

enum PendingScanImportSource: String, Codable, Sendable {
    case projectDetail
    case homeOrProjectList
}

struct PendingScanImportContext: Codable, Sendable {
    let jobId: String
    let source: PendingScanImportSource
    let localTargetProjectId: String?
    let requestedProjectTitle: String
    let requestedProjectIconImage: String?
    let createdAt: Date
}

private struct ImportedScanJobRecord: Codable, Sendable {
    let jobId: String
    let importedAt: Date
}

private actor ScanJobSyncService {
    typealias SessionProvider = @Sendable () async -> AuthSession?
    typealias FetchJobs = @Sendable (String) async throws -> [ScanJobDTO]
    typealias AcknowledgeJob = @Sendable (String, String) async throws -> Void
    typealias CompletedHandler = @Sendable (ScanJobDTO) async -> Bool
    typealias FailedHandler = @Sendable (ScanJobDTO) async -> Void
    typealias LogHandler = @Sendable (String) async -> Void

    private let sessionProvider: SessionProvider
    private let fetchJobs: FetchJobs
    private let acknowledgeJob: AcknowledgeJob
    private let completedHandler: CompletedHandler
    private let failedHandler: FailedHandler
    private let logHandler: LogHandler

    private var pollingTask: Task<Void, Never>?

    init(
        sessionProvider: @escaping SessionProvider,
        fetchJobs: @escaping FetchJobs,
        acknowledgeJob: @escaping AcknowledgeJob,
        completedHandler: @escaping CompletedHandler,
        failedHandler: @escaping FailedHandler,
        logHandler: @escaping LogHandler
    ) {
        self.sessionProvider = sessionProvider
        self.fetchJobs = fetchJobs
        self.acknowledgeJob = acknowledgeJob
        self.completedHandler = completedHandler
        self.failedHandler = failedHandler
        self.logHandler = logHandler
    }

    func start() {
        guard pollingTask == nil else { return }
        pollingTask = Task {
            await self.runLoop()
        }
    }

    func stop() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func runLoop() async {
        while !Task.isCancelled {
            guard let session = await sessionProvider() else {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                continue
            }

            var hasActiveJobs = false

            do {
                let jobs = try await fetchJobs(session.accessToken)

                for job in jobs {
                    switch job.status {
                    case .pending, .processing:
                        hasActiveJobs = true
                    case .completed:
                        let handled = await completedHandler(job)
                        if handled {
                            do {
                                try await acknowledgeJob(job.id, session.accessToken)
                            } catch {
                                await logHandler("Failed to acknowledge scan job \(job.id): \(error.localizedDescription)")
                            }
                        }
                    case .failed:
                        await failedHandler(job)
                    }
                }
            } catch {
                await logHandler("Scan job polling failed: \(error.localizedDescription)")
            }

            let nextInterval: UInt64 = hasActiveJobs ? 3_000_000_000 : 12_000_000_000
            try? await Task.sleep(nanoseconds: nextInterval)
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var session: AuthSession?
    @Published private(set) var subscription: SubscriptionState?
    @Published private(set) var repositoryMode: RepositoryMode = .guestLocal
    @Published private(set) var isRefreshingAuthState = false
    @Published private(set) var isSigningIn = false
    @Published private(set) var isSessionExpired = false
    @Published private(set) var authErrorMessage: String?
    @Published var dataVersion = 0
    @Published var selectedTab: Int = 0
    @Published var scanBanner: ScanBannerState?

    private let logger = Logger(subsystem: "MerkenIOS", category: "AppState")

    private let authService: AuthService
    private let repositoryRouter: RepositoryRouter
    private let guestSessionStore: GuestSessionStore
    let webAPIClient: WebAPIClient
    private let appStoreSubscriptionService: AppStoreSubscriptionService
    let quizStatsStore: QuizStatsStore
    let sentenceQuizProgressStore: SentenceQuizProgressStore
    let collectionRepository: CollectionRepositoryProtocol
    private let scanNotificationService: ScanNotificationServiceProtocol
    private var bannerDismissTask: Task<Void, Never>?
    private let defaults: UserDefaults

    private var pendingScanImportContexts: [String: PendingScanImportContext]
    private var importedScanJobs: [String: ImportedScanJobRecord]
    private var reportedScanFailures: Set<String>
    private var appStoreLaunchSyncUserId: String?

    private lazy var scanJobSyncService = ScanJobSyncService(
        sessionProvider: { [weak self] in
            guard let self else { return nil }
            return await self.session
        },
        fetchJobs: { [weak self] bearerToken in
            guard let self else { return [] }
            return try await self.webAPIClient.fetchScanJobs(bearerToken: bearerToken)
        },
        acknowledgeJob: { [weak self] jobId, bearerToken in
            guard let self else { return }
            try await self.webAPIClient.acknowledgeScanJob(jobId: jobId, bearerToken: bearerToken)
        },
        completedHandler: { [weak self] job in
            guard let self else { return false }
            return await self.handleCompletedScanJob(job)
        },
        failedHandler: { [weak self] job in
            guard let self else { return }
            await self.handleFailedScanJob(job)
        },
        logHandler: { [weak self] message in
            guard let self else { return }
            self.logger.error("\(message, privacy: .public)")
        }
    )

    private enum Keys {
        static let pendingScanImportContexts = "merken_pending_scan_import_contexts"
        static let importedScanJobs = "merken_imported_scan_jobs"
        static let reportedScanFailures = "merken_reported_scan_job_failures"
    }

    init(
        authService: AuthService,
        repositoryRouter: RepositoryRouter,
        guestSessionStore: GuestSessionStore,
        webAPIClient: WebAPIClient,
        appStoreSubscriptionService: AppStoreSubscriptionService,
        quizStatsStore: QuizStatsStore,
        sentenceQuizProgressStore: SentenceQuizProgressStore,
        collectionRepository: CollectionRepositoryProtocol,
        scanNotificationService: ScanNotificationServiceProtocol,
        defaults: UserDefaults = .standard
    ) {
        self.authService = authService
        self.repositoryRouter = repositoryRouter
        self.guestSessionStore = guestSessionStore
        self.webAPIClient = webAPIClient
        self.appStoreSubscriptionService = appStoreSubscriptionService
        self.quizStatsStore = quizStatsStore
        self.sentenceQuizProgressStore = sentenceQuizProgressStore
        self.collectionRepository = collectionRepository
        self.scanNotificationService = scanNotificationService
        self.defaults = defaults
        self.session = authService.session
        self.pendingScanImportContexts = Self.loadPendingScanImportContexts(defaults: defaults)
        self.importedScanJobs = Self.loadImportedScanJobs(defaults: defaults)
        self.reportedScanFailures = Self.loadReportedFailures(defaults: defaults)
        self.appStoreLaunchSyncUserId = nil
    }

    var isPro: Bool {
        subscription?.isActivePro ?? false
    }

    var activeUserId: String {
        if (repositoryMode == .proCloud || repositoryMode == .readonlyCloud),
           let userId = session?.userId {
            return userId
        }
        return guestSessionStore.guestUserId
    }

    var wasPro: Bool {
        subscription?.wasPro ?? false
    }

    var activeRepository: WordRepositoryProtocol {
        repositoryRouter.repository(for: repositoryMode)
    }

    var isLoggedIn: Bool {
        session != nil
    }

    var canUseCloud: Bool {
        repositoryMode == .proCloud
    }

    func bootstrap() async {
        await refreshAuthState(showLoading: true)
        Task {
            await scanNotificationService.requestAuthorizationIfNeeded()
        }
    }

    func refreshAuthState(showLoading: Bool = false) async {
        if showLoading {
            isRefreshingAuthState = true
        }

        defer {
            isRefreshingAuthState = false
        }

        self.session = authService.session

        guard session != nil else {
            subscription = nil
            repositoryMode = .guestLocal
            appStoreLaunchSyncUserId = nil
            await scanJobSyncService.stop()
            logger.info("Auth bootstrap: guest local mode")
            return
        }

        do {
            let subscription = try await authService.refreshSubscription()
            self.subscription = subscription
            repositoryMode = repositoryRouter.mode(for: subscription)
            authErrorMessage = nil
            await scanJobSyncService.start()

            if let currentSession = session,
               appStoreLaunchSyncUserId != currentSession.userId {
                appStoreLaunchSyncUserId = currentSession.userId
                Task { [weak self] in
                    await self?.syncAppStoreSubscriptionOnLaunch()
                }
            }

            let modeLabel: String = switch self.repositoryMode {
            case .proCloud: "proCloud"
            case .readonlyCloud: "readonlyCloud"
            case .guestLocal: "guestLocal"
            }
            logger.info("Auth refresh complete. mode=\(modeLabel)")
        } catch {
            if let authError = error as? AuthServiceError,
               case .sessionExpired = authError {
                isSessionExpired = true
                session = nil
                authErrorMessage = error.localizedDescription
                await scanJobSyncService.stop()
                logger.warning("Session expired — keeping current repositoryMode")
            } else {
                if session == nil {
                    repositoryMode = .guestLocal
                }
                authErrorMessage = error.localizedDescription
                logger.error("Auth refresh failed: \(error.localizedDescription)")
            }
        }
    }

    func purchaseProWithAppStore() async throws {
        guard let session else {
            throw AuthServiceError.missingSession
        }
        if session.isExpired {
            throw AuthServiceError.sessionExpired
        }

        try await appStoreSubscriptionService.purchaseProSubscription(
            bearerToken: session.accessToken
        )
        await refreshAuthState(showLoading: false)
        bumpDataVersion()
    }

    func restoreProWithAppStore() async throws {
        guard let session else {
            throw AuthServiceError.missingSession
        }
        if session.isExpired {
            throw AuthServiceError.sessionExpired
        }

        try await appStoreSubscriptionService.restorePurchases(
            bearerToken: session.accessToken
        )
        await refreshAuthState(showLoading: false)
        bumpDataVersion()
    }

    private func syncAppStoreSubscriptionOnLaunch() async {
        guard let session else { return }
        if session.isExpired { return }

        do {
            let synced = try await appStoreSubscriptionService.syncOnLaunchIfNeeded(
                bearerToken: session.accessToken
            )
            if synced {
                await refreshAuthState(showLoading: false)
                bumpDataVersion()
            }
        } catch {
            logger.warning("App Store launch sync failed: \(error.localizedDescription)")
        }
    }

    func signIn(email: String, password: String) async {
        guard !isSigningIn else { return }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalizedEmail.isEmpty, !normalizedPassword.isEmpty else {
            authErrorMessage = "メールアドレスとパスワードを入力してください。"
            return
        }

        isSigningIn = true
        authErrorMessage = nil
        defer { isSigningIn = false }

        do {
            try await authService.signIn(email: normalizedEmail, password: normalizedPassword)
            isSessionExpired = false
            await refreshAuthState(showLoading: true)
            bumpDataVersion()
        } catch {
            authErrorMessage = error.localizedDescription
            logger.error("Sign in failed: \(error.localizedDescription)")
        }
    }

    func signOut() async {
        do {
            try await authService.signOut()
            isSessionExpired = false
            await refreshAuthState(showLoading: true)
            bumpDataVersion()
        } catch {
            authErrorMessage = error.localizedDescription
            logger.error("Sign out failed: \(error.localizedDescription)")
        }
    }

    func bumpDataVersion() {
        dataVersion += 1
    }

    func registerPendingScanImport(_ context: PendingScanImportContext) {
        pendingScanImportContexts[context.jobId] = context
        persistPendingScanImportContexts()
        reportedScanFailures.remove(context.jobId)
        persistReportedFailures()

        Task {
            await scanNotificationService.requestAuthorizationIfNeeded()
        }

        Task {
            await scanJobSyncService.start()
        }
    }

    func postScanSuccess(projectTitle: String, wordCount: Int) {
        let title = "スキャン完了"
        let message = "「\(projectTitle)」に\(wordCount)語を追加しました。"
        showScanBanner(level: .success, title: title, message: message)

        guard UIApplication.shared.applicationState != .active else { return }
        Task {
            await scanNotificationService.notifySuccess(projectTitle: projectTitle, wordCount: wordCount)
        }
    }

    func postScanFailure(message: String) {
        showScanBanner(level: .error, title: "スキャン保存失敗", message: message)

        guard UIApplication.shared.applicationState != .active else { return }
        Task {
            await scanNotificationService.notifyFailure(message: message)
        }
    }

    private func handleCompletedScanJob(_ job: ScanJobDTO) async -> Bool {
        if importedScanJobs[job.id] != nil {
            removePendingScanImportContext(jobId: job.id)
            return true
        }

        guard let context = pendingScanImportContexts[job.id] else {
            return false
        }

        let result = job.decodedResult
        let saveMode = result?.saveMode ?? job.saveMode

        switch saveMode {
        case .serverCloud:
            let count = result?.wordCount ?? 0
            recordImportedScanJob(jobId: job.id)
            removePendingScanImportContext(jobId: job.id)
            reportedScanFailures.remove(job.id)
            persistReportedFailures()
            bumpDataVersion()
            postScanSuccess(projectTitle: job.projectTitle, wordCount: count)
            return true

        case .clientLocal:
            return await importClientLocalScanJob(job: job, context: context, result: result)
        }
    }

    private func handleFailedScanJob(_ job: ScanJobDTO) async {
        guard pendingScanImportContexts[job.id] != nil else { return }
        guard !reportedScanFailures.contains(job.id) else { return }
        reportedScanFailures.insert(job.id)
        persistReportedFailures()
        removePendingScanImportContext(jobId: job.id)

        let message = job.errorMessage ?? "スキャン処理に失敗しました。"
        postScanFailure(message: message)
    }

    private func importClientLocalScanJob(
        job: ScanJobDTO,
        context: PendingScanImportContext,
        result: ScanJobResultPayload?
    ) async -> Bool {
        guard let extractedWords = result?.extractedWords, !extractedWords.isEmpty else {
            postScanFailure(message: "スキャン結果の読み込みに失敗しました。")
            return false
        }

        let localRepository = repositoryRouter.repository(for: .guestLocal)
        let localUserId = guestSessionStore.guestUserId
        let dedupedWords = ScanCoordinatorViewModel.dedupeWords(extractedWords)

        do {
            let currentWords = try await localRepository.fetchAllWords(userId: localUserId)
            let projectedCount = currentWords.count + dedupedWords.count
            if projectedCount > ScanCoordinatorViewModel.freeWordLimit {
                let available = max(0, ScanCoordinatorViewModel.freeWordLimit - currentWords.count)
                postScanFailure(message: "保存できる単語はあと\(available)語までです。")
                return false
            }

            let projectTitleCandidate = context.requestedProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            let fallbackTitle = projectTitleCandidate.isEmpty ? job.projectTitle : projectTitleCandidate
            let iconImage = context.requestedProjectIconImage

            let projectId: String
            let projectTitleForMessage: String

            if let targetId = context.localTargetProjectId {
                let projects = try await localRepository.fetchProjects(userId: localUserId)
                if let existingProject = projects.first(where: { $0.id == targetId }) {
                    projectId = existingProject.id
                    projectTitleForMessage = existingProject.title
                    if let iconImage {
                        try? await localRepository.updateProjectIcon(id: existingProject.id, iconImage: iconImage)
                    }
                } else {
                    let created = try await localRepository.createProject(
                        title: fallbackTitle,
                        userId: localUserId,
                        iconImage: iconImage
                    )
                    projectId = created.id
                    projectTitleForMessage = created.title
                }
            } else {
                let created = try await localRepository.createProject(
                    title: fallbackTitle,
                    userId: localUserId,
                    iconImage: iconImage
                )
                projectId = created.id
                projectTitleForMessage = created.title
            }

            let inputs = dedupedWords.map {
                WordInput(
                    projectId: projectId,
                    english: $0.english,
                    japanese: $0.japanese,
                    distractors: $0.distractors,
                    exampleSentence: $0.exampleSentence,
                    exampleSentenceJa: $0.exampleSentenceJa,
                    pronunciation: nil
                )
            }

            _ = try await localRepository.createWords(inputs)

            recordImportedScanJob(jobId: job.id)
            removePendingScanImportContext(jobId: job.id)
            reportedScanFailures.remove(job.id)
            persistReportedFailures()
            bumpDataVersion()
            postScanSuccess(projectTitle: projectTitleForMessage, wordCount: inputs.count)
            return true
        } catch {
            postScanFailure(message: "ローカル保存に失敗しました: \(error.localizedDescription)")
            return false
        }
    }

    private func recordImportedScanJob(jobId: String) {
        importedScanJobs[jobId] = ImportedScanJobRecord(jobId: jobId, importedAt: .now)

        // Keep the latest 200 records to avoid unbounded growth.
        if importedScanJobs.count > 200 {
            let sorted = importedScanJobs.values.sorted { $0.importedAt > $1.importedAt }
            importedScanJobs = Dictionary(
                uniqueKeysWithValues: sorted.prefix(200).map { ($0.jobId, $0) }
            )
        }

        persistImportedScanJobs()
    }

    private func removePendingScanImportContext(jobId: String) {
        pendingScanImportContexts.removeValue(forKey: jobId)
        persistPendingScanImportContexts()
    }

    private func showScanBanner(level: ScanBannerState.Level, title: String, message: String) {
        let banner = ScanBannerState(level: level, title: title, message: message)
        scanBanner = banner

        bannerDismissTask?.cancel()
        bannerDismissTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard let self else { return }
            guard self.scanBanner?.id == banner.id else { return }
            withAnimation(.easeInOut(duration: 0.2)) {
                self.scanBanner = nil
            }
        }
    }

    private func persistPendingScanImportContexts() {
        if let encoded = try? JSONEncoder().encode(pendingScanImportContexts) {
            defaults.set(encoded, forKey: Keys.pendingScanImportContexts)
        }
    }

    private func persistImportedScanJobs() {
        if let encoded = try? JSONEncoder().encode(importedScanJobs) {
            defaults.set(encoded, forKey: Keys.importedScanJobs)
        }
    }

    private func persistReportedFailures() {
        defaults.set(Array(reportedScanFailures), forKey: Keys.reportedScanFailures)
    }

    private static func loadPendingScanImportContexts(defaults: UserDefaults) -> [String: PendingScanImportContext] {
        guard let data = defaults.data(forKey: Keys.pendingScanImportContexts),
              let decoded = try? JSONDecoder().decode([String: PendingScanImportContext].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private static func loadImportedScanJobs(defaults: UserDefaults) -> [String: ImportedScanJobRecord] {
        guard let data = defaults.data(forKey: Keys.importedScanJobs),
              let decoded = try? JSONDecoder().decode([String: ImportedScanJobRecord].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private static func loadReportedFailures(defaults: UserDefaults) -> Set<String> {
        let values = defaults.stringArray(forKey: Keys.reportedScanFailures) ?? []
        return Set(values)
    }
}
