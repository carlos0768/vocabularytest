import Foundation

private struct SupabaseTokenResponse: Decodable {
    struct SupabaseAuthUser: Decodable {
        let id: String
        let email: String?
    }

    let accessToken: String
    let tokenType: String
    let expiresIn: Int?
    let expiresAt: Int?
    let refreshToken: String?
    let user: SupabaseAuthUser
}

private struct SubscriptionDTO: Decodable {
    let id: String
    let userId: String
    let status: SubscriptionStatus
    let plan: SubscriptionPlan
    let proSource: String?
    let testProExpiresAt: Date?
    let currentPeriodEnd: Date?
}

@MainActor
final class AuthService: ObservableObject, AuthServiceProtocol {
    @Published private(set) var session: AuthSession?

    private let restClient: SupabaseRESTClient
    private let webAPIBaseURL: URL
    private let defaults: UserDefaults

    private enum Keys {
        static let session = "merken_auth_session"
    }

    init(restClient: SupabaseRESTClient, webAPIBaseURL: URL, defaults: UserDefaults = .standard) {
        self.restClient = restClient
        self.webAPIBaseURL = webAPIBaseURL
        self.defaults = defaults
        self.session = Self.loadSession(from: defaults)
    }

    func signIn(email: String, password: String) async throws {
        struct SignInBody: Encodable {
            let email: String
            let password: String
        }

        let query = [URLQueryItem(name: "grant_type", value: "password")]

        do {
            let response: SupabaseTokenResponse = try await restClient.authPost(
                path: "/auth/v1/token",
                body: SignInBody(email: email, password: password),
                query: query,
                bearerToken: nil
            )

            let expiresAtDate: Date?
            if let unix = response.expiresAt {
                expiresAtDate = Date(timeIntervalSince1970: TimeInterval(unix))
            } else if let expiresIn = response.expiresIn {
                expiresAtDate = Date().addingTimeInterval(TimeInterval(expiresIn))
            } else {
                expiresAtDate = nil
            }

            let session = AuthSession(
                userId: response.user.id,
                email: response.user.email,
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                expiresAt: expiresAtDate,
                tokenType: response.tokenType
            )

            self.session = session
            persist(session: session)
        } catch SupabaseClientError.unauthorized {
            throw AuthServiceError.invalidCredentials
        } catch {
            throw AuthServiceError.network(error.localizedDescription)
        }
    }

    func signOut() async throws {
        guard let session else { return }

        do {
            try await restClient.authPostNoBody(path: "/auth/v1/logout", bearerToken: session.accessToken)
        } catch {
            // Even when network fails we clear local session to avoid stale login state.
        }

        self.session = nil
        defaults.removeObject(forKey: Keys.session)
    }

    func refreshSubscription() async throws -> SubscriptionState {
        guard let session else {
            throw AuthServiceError.missingSession
        }

        if session.isExpired {
            throw AuthServiceError.sessionExpired
        }

        let query = [
            URLQueryItem(name: "user_id", value: "eq.\(session.userId)"),
            URLQueryItem(name: "select", value: "id,user_id,status,plan,pro_source,test_pro_expires_at,current_period_end"),
            URLQueryItem(name: "limit", value: "1")
        ]

        do {
            let rows: [SubscriptionDTO] = try await restClient.get(
                path: "/rest/v1/subscriptions",
                query: query,
                bearerToken: session.accessToken
            )

            guard let row = rows.first else {
                return SubscriptionState(
                    id: "local-free",
                    userId: session.userId,
                    status: .free,
                    plan: .free,
                    proSource: "none",
                    testProExpiresAt: nil,
                    currentPeriodEnd: nil
                )
            }

            return SubscriptionState(
                id: row.id,
                userId: row.userId,
                status: row.status,
                plan: row.plan,
                proSource: row.proSource ?? "none",
                testProExpiresAt: row.testProExpiresAt,
                currentPeriodEnd: row.currentPeriodEnd
            )
        } catch SupabaseClientError.unauthorized {
            throw AuthServiceError.sessionExpired
        } catch {
            throw AuthServiceError.network(error.localizedDescription)
        }
    }

    // MARK: - Sign Up

    func sendSignUpOTP(email: String) async throws {
        struct RequestBody: Encodable {
            let email: String
        }

        let url = webAPIBaseURL.appendingPathComponent("api/auth/send-otp")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RequestBody(email: email))
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthServiceError.network("サーバーに接続できませんでした。")
        }

        if http.statusCode == 409 {
            throw AuthServiceError.emailAlreadyExists
        }

        guard (200...299).contains(http.statusCode) else {
            let errorMessage = Self.extractErrorMessage(from: data)
                ?? "認証コードの送信に失敗しました。"
            throw AuthServiceError.network(errorMessage)
        }
    }

    func verifySignUpOTP(email: String, code: String, password: String) async throws {
        struct RequestBody: Encodable {
            let email: String
            let code: String
            let password: String
        }

        let url = webAPIBaseURL.appendingPathComponent("api/auth/signup-verify")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RequestBody(email: email, code: code, password: password))
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthServiceError.network("サーバーに接続できませんでした。")
        }

        if http.statusCode == 409 {
            throw AuthServiceError.emailAlreadyExists
        }

        guard (200...299).contains(http.statusCode) else {
            let errorMessage = Self.extractErrorMessage(from: data)
                ?? "アカウントの作成に失敗しました。"
            throw AuthServiceError.invalidOTP(errorMessage)
        }

        // Account created — sign in with Supabase to get a local session
        try await signIn(email: email, password: password)
    }

    private static func extractErrorMessage(from data: Data) -> String? {
        struct ErrorResponse: Decodable {
            let error: String?
        }
        return (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error
    }

    private static func loadSession(from defaults: UserDefaults) -> AuthSession? {
        guard let data = defaults.data(forKey: Keys.session) else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    private func persist(session: AuthSession) {
        if let encoded = try? JSONEncoder().encode(session) {
            defaults.set(encoded, forKey: Keys.session)
        }
    }
}
