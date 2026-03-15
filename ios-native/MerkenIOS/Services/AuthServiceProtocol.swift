import Foundation

@MainActor
protocol AuthServiceProtocol: AnyObject {
    var session: AuthSession? { get }
    func signIn(email: String, password: String) async throws
    func signOut() async throws
    func refreshSessionIfNeeded(forceRefresh: Bool) async throws -> AuthSession
    func refreshSubscription() async throws -> SubscriptionState
    func sendSignUpOTP(email: String) async throws
    func verifySignUpOTP(email: String, code: String, password: String) async throws
}

enum AuthServiceError: LocalizedError {
    case invalidCredentials
    case missingSession
    case sessionExpired
    case notPro
    case emailAlreadyExists
    case invalidOTP(String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "メールアドレスまたはパスワードが正しくありません。入力内容を確認して、もう一度お試しください。"
        case .missingSession:
            return "ログインセッションが見つかりません。"
        case .sessionExpired:
            return "セッションが期限切れです。再ログインしてください。"
        case .notPro:
            return "クラウド同期は Pro ユーザーのみ利用できます。"
        case .emailAlreadyExists:
            return "このメールアドレスは既に登録されています。"
        case .invalidOTP(let message):
            return message
        case .network(let message):
            return message
        }
    }
}
