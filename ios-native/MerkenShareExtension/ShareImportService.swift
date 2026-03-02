import Foundation

enum ShareImportServiceError: LocalizedError {
    case misconfigured(String)
    case unauthorized
    case badRequest(String)
    case unprocessable(String)
    case rateLimited(String)
    case server(String)
    case network(String)
    case decode

    var errorDescription: String? {
        switch self {
        case .misconfigured(let key):
            return "設定値 \(key) が不足しています。"
        case .unauthorized:
            return "ログインが必要です。"
        case .badRequest(let message):
            return message
        case .unprocessable(let message):
            return message
        case .rateLimited(let message):
            return message
        case .server(let message):
            return message
        case .network(let message):
            return message
        case .decode:
            return "レスポンスの解析に失敗しました。"
        }
    }
}

actor ShareImportService {
    private let baseURL: URL
    private let supabaseURL: URL
    private let supabaseAnonKey: String
    private let urlSession: URLSession

    init(baseURL: URL, supabaseURL: URL, supabaseAnonKey: String) {
        self.baseURL = baseURL
        self.supabaseURL = supabaseURL
        self.supabaseAnonKey = supabaseAnonKey

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        self.urlSession = URLSession(configuration: config)
    }

    static func makeFromBundle(bundle: Bundle = .main) throws -> ShareImportService {
        let info = bundle.infoDictionary ?? [:]
        guard let raw = info["WEB_API_BASE_URL"] as? String,
              let baseURL = URL(string: raw), !raw.isEmpty else {
            throw ShareImportServiceError.misconfigured("WEB_API_BASE_URL")
        }
        guard let supabaseRaw = info["SUPABASE_URL"] as? String,
              let supabaseURL = URL(string: supabaseRaw), !supabaseRaw.isEmpty else {
            throw ShareImportServiceError.misconfigured("SUPABASE_URL")
        }
        guard let anonKey = info["SUPABASE_ANON_KEY"] as? String, !anonKey.isEmpty else {
            throw ShareImportServiceError.misconfigured("SUPABASE_ANON_KEY")
        }
        return ShareImportService(
            baseURL: baseURL,
            supabaseURL: supabaseURL,
            supabaseAnonKey: anonKey
        )
    }

    func refreshSession(using snapshot: SharedAuthSnapshot) async throws -> SharedAuthSnapshot {
        struct RefreshRequestBody: Encodable {
            let refreshToken: String

            enum CodingKeys: String, CodingKey {
                case refreshToken = "refresh_token"
            }
        }

        struct RefreshUserDTO: Decodable {
            let id: String
            let email: String?
        }

        struct RefreshResponseDTO: Decodable {
            let accessToken: String
            let tokenType: String
            let expiresIn: Int?
            let expiresAt: Int?
            let refreshToken: String?
            let user: RefreshUserDTO
        }

        guard let refreshToken = snapshot.refreshToken, !refreshToken.isEmpty else {
            throw ShareImportServiceError.unauthorized
        }

        var components = URLComponents(url: supabaseURL.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        guard let url = components?.url else {
            throw ShareImportServiceError.server("URLの生成に失敗しました。")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = 20
        request.httpBody = try JSONEncoder().encode(RefreshRequestBody(refreshToken: refreshToken))

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw ShareImportServiceError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw ShareImportServiceError.server("通信エラー")
        }

        if http.statusCode == 400 || http.statusCode == 401 {
            throw ShareImportServiceError.unauthorized
        }
        guard (200 ... 299).contains(http.statusCode) else {
            throw ShareImportServiceError.server(errorMessage(from: data, fallback: "認証更新に失敗しました。"))
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let decoded: RefreshResponseDTO
        do {
            decoded = try decoder.decode(RefreshResponseDTO.self, from: data)
        } catch {
            throw ShareImportServiceError.decode
        }

        let expiresAtDate: Date?
        if let unix = decoded.expiresAt {
            expiresAtDate = Date(timeIntervalSince1970: TimeInterval(unix))
        } else if let expiresIn = decoded.expiresIn {
            expiresAtDate = Date().addingTimeInterval(TimeInterval(expiresIn))
        } else {
            expiresAtDate = nil
        }

        return SharedAuthSnapshot(
            userId: decoded.user.id,
            email: decoded.user.email,
            accessToken: decoded.accessToken,
            refreshToken: decoded.refreshToken ?? snapshot.refreshToken,
            expiresAt: expiresAtDate,
            tokenType: decoded.tokenType
        )
    }

    func preview(
        text: String,
        sourceApp: String?,
        locale: String?,
        bearerToken: String
    ) async throws -> ShareImportPreviewCandidateDTO {
        let requestBody = ShareImportPreviewRequestDTO(text: text, sourceApp: sourceApp, locale: locale)
        let (data, http) = try await sendJSON(
            method: "POST",
            path: "api/share-import/preview",
            bearerToken: bearerToken,
            body: requestBody
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw ShareImportServiceError.unauthorized
        case 422:
            throw ShareImportServiceError.unprocessable(errorMessage(from: data, fallback: "英単語を判定できませんでした。"))
        case 429:
            throw ShareImportServiceError.rateLimited(errorMessage(from: data, fallback: "利用上限に達しました。"))
        case 400:
            throw ShareImportServiceError.badRequest(errorMessage(from: data, fallback: "入力値が不正です。"))
        default:
            throw ShareImportServiceError.server(errorMessage(from: data, fallback: "プレビューの生成に失敗しました。"))
        }

        do {
            return try ShareImportDecode.preview(from: data)
        } catch let error as ShareImportServiceError {
            throw error
        } catch {
            throw ShareImportServiceError.decode
        }
    }

    func fetchProjects(limit: Int, bearerToken: String) async throws -> [ShareImportProjectOptionDTO] {
        var components = URLComponents(url: try makeURL(path: "api/share-import/projects"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "limit", value: String(max(1, min(50, limit))))]
        guard let url = components?.url else {
            throw ShareImportServiceError.server("URLの生成に失敗しました。")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw ShareImportServiceError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw ShareImportServiceError.server("通信エラー")
        }

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw ShareImportServiceError.unauthorized
        default:
            throw ShareImportServiceError.server(errorMessage(from: data, fallback: "単語帳一覧の取得に失敗しました。"))
        }

        do {
            return try ShareImportDecode.projects(from: data)
        } catch let error as ShareImportServiceError {
            throw error
        } catch {
            throw ShareImportServiceError.decode
        }
    }

    func commit(
        targetProjectId: String?,
        newProjectTitle: String?,
        english: String,
        japanese: String,
        originalText: String?,
        sourceApp: String?,
        bearerToken: String
    ) async throws -> ShareImportCommitResultDTO {
        let requestBody = ShareImportCommitRequestDTO(
            targetProjectId: targetProjectId,
            newProjectTitle: newProjectTitle,
            english: english,
            japanese: japanese,
            originalText: originalText,
            sourceApp: sourceApp
        )

        let (data, http) = try await sendJSON(
            method: "POST",
            path: "api/share-import/commit",
            bearerToken: bearerToken,
            body: requestBody
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw ShareImportServiceError.unauthorized
        case 403:
            throw ShareImportServiceError.badRequest(errorMessage(from: data, fallback: "保存先の単語帳にアクセスできません。"))
        case 400, 422:
            throw ShareImportServiceError.badRequest(errorMessage(from: data, fallback: "保存データが不正です。"))
        default:
            throw ShareImportServiceError.server(errorMessage(from: data, fallback: "保存に失敗しました。"))
        }

        do {
            return try ShareImportDecode.commit(from: data)
        } catch let error as ShareImportServiceError {
            throw error
        } catch {
            throw ShareImportServiceError.decode
        }
    }

    private func sendJSON<Body: Encodable>(
        method: String,
        path: String,
        bearerToken: String,
        body: Body
    ) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: try makeURL(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw ShareImportServiceError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw ShareImportServiceError.server("通信エラー")
        }

        return (data, http)
    }

    private func makeURL(path: String) throws -> URL {
        let normalized = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let origin = URL(string: "/", relativeTo: baseURL)?.absoluteURL,
              let url = URL(string: normalized, relativeTo: origin)?.absoluteURL else {
            throw ShareImportServiceError.server("URLの生成に失敗しました。")
        }
        return url
    }

    private func errorMessage(from data: Data, fallback: String) -> String {
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let message = object["error"] as? String, !message.isEmpty {
                return message
            }
            if let message = object["message"] as? String, !message.isEmpty {
                return message
            }
        }

        if let raw = String(data: data, encoding: .utf8), !raw.isEmpty {
            return raw
        }

        return fallback
    }
}
