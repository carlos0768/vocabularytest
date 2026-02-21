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
    private let defaults: UserDefaults

    private enum Keys {
        static let session = "merken_auth_session"
    }

    init(restClient: SupabaseRESTClient, defaults: UserDefaults = .standard) {
        self.restClient = restClient
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
