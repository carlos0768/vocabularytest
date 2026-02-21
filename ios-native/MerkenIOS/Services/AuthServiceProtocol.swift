import Foundation

@MainActor
protocol AuthServiceProtocol: AnyObject {
    var session: AuthSession? { get }
    func signIn(email: String, password: String) async throws
    func signOut() async throws
    func refreshSubscription() async throws -> SubscriptionState
}

enum AuthServiceError: LocalizedError {
    case invalidCredentials
    case missingSession
    case sessionExpired
    case notPro
    case network(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "メールアドレスまたはパスワードが正しくありません。"
        case .missingSession:
            return "ログインセッションが見つかりません。"
        case .sessionExpired:
            return "セッションが期限切れです。再ログインしてください。"
        case .notPro:
            return "クラウド同期は Pro ユーザーのみ利用できます。"
        case .network(let message):
            return message
        }
    }
}
