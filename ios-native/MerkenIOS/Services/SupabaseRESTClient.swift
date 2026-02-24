import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}

enum SupabaseClientError: LocalizedError {
    case invalidURL
    case unauthorized
    case requestFailed(Int, String)
    case decodeFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "API URL が不正です。"
        case .unauthorized:
            return "認証エラーです。再ログインしてください。"
        case .requestFailed(let code, let message):
            return "API エラー (\(code)): \(message)"
        case .decodeFailed:
            return "レスポンスの解析に失敗しました。"
        }
    }
}

actor SupabaseRESTClient {
    private let config: AppConfig
    private let urlSession: URLSession

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .supabaseISO8601
        return decoder
    }()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .supabaseISO8601
        return encoder
    }()

    init(config: AppConfig, urlSession: URLSession = .shared) {
        self.config = config
        self.urlSession = urlSession
    }

    func get<Response: Decodable>(
        path: String,
        query: [URLQueryItem] = [],
        bearerToken: String? = nil,
        preferReturnRepresentation: Bool = false,
        rangeHeader: String? = nil
    ) async throws -> Response {
        let data = try await request(
            method: .get,
            path: path,
            query: query,
            body: nil,
            bearerToken: bearerToken,
            preferReturnRepresentation: preferReturnRepresentation,
            rangeHeader: rangeHeader
        )

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw SupabaseClientError.decodeFailed
        }
    }

    func post<Body: Encodable, Response: Decodable>(
        path: String,
        body: Body,
        query: [URLQueryItem] = [],
        bearerToken: String? = nil,
        preferReturnRepresentation: Bool = true
    ) async throws -> Response {
        let payload = try encoder.encode(body)
        let data = try await request(
            method: .post,
            path: path,
            query: query,
            body: payload,
            bearerToken: bearerToken,
            preferReturnRepresentation: preferReturnRepresentation
        )

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw SupabaseClientError.decodeFailed
        }
    }

    func patch<Body: Encodable, Response: Decodable>(
        path: String,
        body: Body,
        query: [URLQueryItem] = [],
        bearerToken: String? = nil,
        preferReturnRepresentation: Bool = false
    ) async throws -> Response {
        let payload = try encoder.encode(body)
        let data = try await request(
            method: .patch,
            path: path,
            query: query,
            body: payload,
            bearerToken: bearerToken,
            preferReturnRepresentation: preferReturnRepresentation
        )

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw SupabaseClientError.decodeFailed
        }
    }

    func delete<Response: Decodable>(
        path: String,
        query: [URLQueryItem] = [],
        bearerToken: String? = nil,
        preferReturnRepresentation: Bool = false
    ) async throws -> Response {
        let data = try await request(
            method: .delete,
            path: path,
            query: query,
            body: nil,
            bearerToken: bearerToken,
            preferReturnRepresentation: preferReturnRepresentation
        )

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw SupabaseClientError.decodeFailed
        }
    }

    func authPost<Body: Encodable, Response: Decodable>(
        path: String,
        body: Body,
        query: [URLQueryItem] = [],
        bearerToken: String? = nil
    ) async throws -> Response {
        let payload = try encoder.encode(body)
        let data = try await request(
            method: .post,
            path: path,
            query: query,
            body: payload,
            bearerToken: bearerToken,
            preferReturnRepresentation: false,
            acceptProfileHeaders: false
        )

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw SupabaseClientError.decodeFailed
        }
    }

    func authPostNoBody(path: String, bearerToken: String) async throws {
        _ = try await request(
            method: .post,
            path: path,
            query: [],
            body: nil,
            bearerToken: bearerToken,
            preferReturnRepresentation: false,
            acceptProfileHeaders: false
        )
    }

    private func request(
        method: HTTPMethod,
        path: String,
        query: [URLQueryItem],
        body: Data?,
        bearerToken: String?,
        preferReturnRepresentation: Bool,
        acceptProfileHeaders: Bool = true,
        rangeHeader: String? = nil
    ) async throws -> Data {
        guard var components = URLComponents(url: config.supabaseURL, resolvingAgainstBaseURL: false) else {
            throw SupabaseClientError.invalidURL
        }

        components.path = path
        components.queryItems = query.isEmpty ? nil : query

        guard let url = components.url else {
            throw SupabaseClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")

        if acceptProfileHeaders {
            request.setValue("public", forHTTPHeaderField: "Accept-Profile")
            request.setValue("public", forHTTPHeaderField: "Content-Profile")
        }

        if preferReturnRepresentation {
            request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        }

        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }

        if let rangeHeader {
            request.setValue(rangeHeader, forHTTPHeaderField: "Range")
        }

        request.httpBody = body

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseClientError.requestFailed(-1, "No HTTP response")
        }

        switch http.statusCode {
        case 200 ... 299:
            return data
        case 401, 403:
            throw SupabaseClientError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8) ?? "Unknown"
            throw SupabaseClientError.requestFailed(http.statusCode, message)
        }
    }
}
