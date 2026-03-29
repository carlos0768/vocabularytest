import Foundation

protocol WordRepositoryProtocol: Sendable {
    func fetchProjects(userId: String) async throws -> [Project]
    func createProject(title: String, userId: String, iconImage: String?) async throws -> Project
    func updateProject(id: String, title: String) async throws
    func updateProjectIcon(id: String, iconImage: String?) async throws
    func updateProjectFavorite(id: String, isFavorite: Bool) async throws
    func updateProjectSourceLabels(id: String, sourceLabels: [String]) async throws
    func deleteProject(id: String) async throws

    func fetchWords(projectId: String) async throws -> [Word]
    func fetchAllWords(userId: String) async throws -> [Word]
    func createWords(_ inputs: [WordInput]) async throws -> [Word]
    func updateWord(id: String, patch: WordPatch) async throws
    func deleteWord(id: String) async throws
}

protocol ProjectShareServiceProtocol: Sendable {
    func generateShareId(projectId: String) async throws -> String
    func updateShareScope(projectId: String, shareScope: ProjectShareScope) async throws
}

protocol OfflinePrefetchingRepository: Sendable {
    func prefetchRecentProjects(userId: String, limit: Int) async
}

enum RepositoryMode: Equatable, Sendable {
    case guestLocal
    case proCloud
    case readonlyCloud
}

enum RepositoryError: LocalizedError {
    case notFound
    case unauthorized
    case invalidResponse
    case misconfigured(String)
    case underlying(String)

    var errorDescription: String? {
        switch self {
        case .notFound:
            return "データが見つかりません。"
        case .unauthorized:
            return "認証が必要です。再ログインしてください。"
        case .invalidResponse:
            return "サーバーから不正なレスポンスを受信しました。"
        case .misconfigured(let key):
            return "設定値 \(key) が不足しています。"
        case .underlying(let message):
            return message
        }
    }
}
