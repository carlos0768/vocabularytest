import Foundation
import OSLog

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

    private let logger = Logger(subsystem: "MerkenIOS", category: "AppState")

    private let authService: AuthService
    private let repositoryRouter: RepositoryRouter
    private let guestSessionStore: GuestSessionStore
    let webAPIClient: WebAPIClient

    init(
        authService: AuthService,
        repositoryRouter: RepositoryRouter,
        guestSessionStore: GuestSessionStore,
        webAPIClient: WebAPIClient
    ) {
        self.authService = authService
        self.repositoryRouter = repositoryRouter
        self.guestSessionStore = guestSessionStore
        self.webAPIClient = webAPIClient
        self.session = authService.session
    }

    var isPro: Bool {
        subscription?.isActivePro ?? false
    }

    var activeUserId: String {
        if repositoryMode == .proCloud, let userId = session?.userId {
            return userId
        }
        return guestSessionStore.guestUserId
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
            logger.info("Auth bootstrap: guest local mode")
            return
        }

        do {
            let subscription = try await authService.refreshSubscription()
            self.subscription = subscription
            repositoryMode = repositoryRouter.mode(for: subscription)
            authErrorMessage = nil
            logger.info("Auth refresh complete. mode=\(self.repositoryMode == .proCloud ? "proCloud" : "guestLocal")")
        } catch {
            if let authError = error as? AuthServiceError,
               case .sessionExpired = authError {
                isSessionExpired = true
                session = nil
                authErrorMessage = error.localizedDescription
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
}
