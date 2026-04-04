import Foundation
import OSLog
import UIKit

enum WebAPIError: LocalizedError {
    case notAuthenticated
    case proRequired
    case scanLimitReached(String)
    case badRequest(String)
    case conflict(String)
    case unprocessable(String)
    case serverError(String)
    case networkTimeout
    case noWordsExtracted
    case decodeFailed(String?)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "認証エラーです。再ログインしてください。"
        case .proRequired:
            return "この機能はProプラン限定です。"
        case .scanLimitReached(let message):
            return message
        case .badRequest(let message):
            return message
        case .conflict(let message):
            return message
        case .unprocessable(let message):
            return message
        case .serverError(let message):
            return message
        case .networkTimeout:
            return "通信がタイムアウトしました。もう一度お試しください。"
        case .noWordsExtracted:
            return "単語を抽出できませんでした。別の画像をお試しください。"
        case .decodeFailed(let reason):
            let base = "レスポンスの解析に失敗しました。"
            guard let reason, !reason.isEmpty else { return base }
            let clipped = reason.count > 200 ? String(reason.prefix(200)) + "…" : reason
            return "\(base)（\(clipped)）"
        }
    }
}

struct QuizPrefillWordInput: Encodable, Sendable {
    let id: String
    let english: String
    let japanese: String
}

struct QuizPrefillResult: Decodable, Sendable {
    let wordId: String
    let distractors: [String]
    let partOfSpeechTags: [String]?
    let exampleSentence: String?
    let exampleSentenceJa: String?
}

private struct QuizPrefillRequest: Encodable {
    let words: [QuizPrefillWordInput]
}

private struct QuizPrefillResponse: Decodable {
    let success: Bool
    let results: [QuizPrefillResult]?
    let error: String?
}

private struct EmbeddingSyncRequest: Encodable {
    let wordIds: [String]
    let limit: Int
}

private struct EmbeddingSyncResponse: Decodable {
    let success: Bool?
    let error: String?
}

private struct Quiz2SimilarBatchRequest: Encodable {
    let sourceWordIds: [String]
    let limit: Int
}

struct SentenceQuizGeneratedResponse: Sendable {
    let questions: [SentenceQuizQuestion]
    let rawResponseData: Data
}

struct ScanUploadImage: Sendable {
    let data: Data
    let contentType: String
    let fileExtension: String
}

enum ScanJobSaveMode: String, Codable, Sendable {
    case serverCloud = "server_cloud"
    case clientLocal = "client_local"
}

enum ScanJobStatus: String, Codable, Sendable {
    case pending
    case processing
    case completed
    case failed
}

struct ScanJobResultPayload: Decodable, Sendable {
    let wordCount: Int?
    let warnings: [String]?
    let saveMode: ScanJobSaveMode?
    let extractedWords: [ExtractedWord]?
    let sourceLabels: [String]?
    let targetProjectId: String?

    enum CodingKeys: String, CodingKey {
        case wordCount
        case warnings
        case saveMode
        case extractedWords
        case sourceLabels
        case targetProjectId
    }
}

private enum ScanJobResultContainer: Decodable {
    case string(String)
    case object([String: AnyDecodableValue])
    case array([AnyDecodableValue])
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: AnyDecodableValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([AnyDecodableValue].self) {
            self = .array(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else {
            self = .null
        }
    }
}

private enum AnyDecodableValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: AnyDecodableValue])
    case array([AnyDecodableValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode([String: AnyDecodableValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([AnyDecodableValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    fileprivate func toJSONCompatible() -> Any {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value
        case .bool(let value):
            return value
        case .object(let value):
            return value.mapValues { $0.toJSONCompatible() }
        case .array(let value):
            return value.map { $0.toJSONCompatible() }
        case .null:
            return NSNull()
        }
    }
}

struct ScanJobDTO: Decodable, Identifiable, Sendable {
    let id: String
    let userId: String
    let projectId: String?
    let targetProjectId: String?
    let projectTitle: String
    let scanMode: String
    let saveMode: ScanJobSaveMode
    let imagePath: String?
    let imagePaths: [String]?
    let status: ScanJobStatus
    let result: String?
    let errorMessage: String?
    let createdAt: Date?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case projectId = "project_id"
        case targetProjectId = "target_project_id"
        case projectTitle = "project_title"
        case scanMode = "scan_mode"
        case saveMode = "save_mode"
        case imagePath = "image_path"
        case imagePaths = "image_paths"
        case status
        case result
        case errorMessage = "error_message"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        userId = (try? container.decode(String.self, forKey: .userId)) ?? ""
        projectId = try? container.decodeIfPresent(String.self, forKey: .projectId)
        targetProjectId = try? container.decodeIfPresent(String.self, forKey: .targetProjectId)
        projectTitle = (try? container.decode(String.self, forKey: .projectTitle)) ?? "スキャン"
        scanMode = (try? container.decode(String.self, forKey: .scanMode)) ?? "all"
        saveMode = (try? container.decode(ScanJobSaveMode.self, forKey: .saveMode)) ?? .serverCloud
        imagePath = try? container.decodeIfPresent(String.self, forKey: .imagePath)
        imagePaths = try? container.decodeIfPresent([String].self, forKey: .imagePaths)
        status = (try? container.decode(ScanJobStatus.self, forKey: .status)) ?? .pending
        errorMessage = try? container.decodeIfPresent(String.self, forKey: .errorMessage)
        createdAt = try? container.decodeIfPresent(Date.self, forKey: .createdAt)
        updatedAt = try? container.decodeIfPresent(Date.self, forKey: .updatedAt)

        if let raw = try? container.decodeIfPresent(String.self, forKey: .result) {
            result = raw
        } else if let decoded = try? container.decodeIfPresent(ScanJobResultContainer.self, forKey: .result) {
            switch decoded {
            case .string(let value):
                result = value
            case .object(let map):
                if JSONSerialization.isValidJSONObject(map.mapValues({ $0.toJSONCompatible() })),
                   let data = try? JSONSerialization.data(withJSONObject: map.mapValues({ $0.toJSONCompatible() })),
                   let json = String(data: data, encoding: .utf8) {
                    result = json
                } else {
                    result = nil
                }
            case .array(let array):
                let jsonCompatible = array.map { $0.toJSONCompatible() }
                if JSONSerialization.isValidJSONObject(jsonCompatible),
                   let data = try? JSONSerialization.data(withJSONObject: jsonCompatible),
                   let json = String(data: data, encoding: .utf8) {
                    result = json
                } else {
                    result = nil
                }
            case .number(let value):
                result = String(value)
            case .bool(let value):
                result = value ? "true" : "false"
            case .null:
                result = nil
            }
        } else {
            result = nil
        }
    }

    var decodedResult: ScanJobResultPayload? {
        guard let result, let data = result.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ScanJobResultPayload.self, from: data)
    }
}

struct ScanJobCreateResponse: Decodable, Sendable {
    let success: Bool
    let jobId: String
    let saveMode: ScanJobSaveMode
}

private struct ScanJobCreateRequest: Encodable {
    let imagePaths: [String]
    let projectTitle: String
    let projectIcon: String?
    let scanMode: String
    let eikenLevel: String?
    let targetProjectId: String?
    let clientPlatform: String
    let aiEnabled: Bool?
}

private struct ScanJobsResponse: Decodable {
    let jobs: [ScanJobDTO]
}

private struct ScanJobErrorResponse: Decodable {
    let error: String?
}

private struct UserPreferencesResponse: Decodable {
    let aiEnabled: Bool?
}

private struct UserPreferencesUpdateRequest: Encodable {
    let aiEnabled: Bool
}

private struct ProfileResponse: Decodable {
    let username: String?
}

private struct ProfileUpdateRequest: Encodable {
    let username: String
}

private struct ScanImagesRemoveRequest: Encodable {
    let prefixes: [String]
}

private struct AppStoreVerifyRequest: Encodable {
    let transactionId: String
    let source: String
}

struct AppStoreVerifiedSubscription: Decodable, Sendable {
    let status: String
    let plan: String
    let proSource: String
    let currentPeriodEnd: String?
    let isActivePro: Bool
}

struct AppStoreVerifiedMeta: Decodable, Sendable {
    let productId: String
    let originalTransactionId: String
    let latestTransactionId: String
    let environment: String
}

struct AppStoreVerifyResponse: Decodable, Sendable {
    let success: Bool
    let subscription: AppStoreVerifiedSubscription?
    let verified: AppStoreVerifiedMeta?
    let error: String?
}

struct ShareImportPreviewCandidate: Decodable, Sendable {
    let english: String
    let japanese: String
    let wasSentence: Bool
    let warnings: [String]
}

struct ShareImportPreviewResponse: Decodable, Sendable {
    let success: Bool
    let candidate: ShareImportPreviewCandidate?
    let error: String?
}

struct ShareImportProjectOption: Decodable, Sendable {
    let id: String
    let title: String
    let updatedAt: Date?
}

private struct ShareImportProjectsResponse: Decodable {
    let success: Bool
    let projects: [ShareImportProjectOption]
    let error: String?
}

struct ShareImportCommitResponse: Decodable, Sendable {
    let success: Bool
    let projectId: String
    let projectTitle: String
    let wordId: String?
    let created: Bool
    let duplicate: Bool
    let error: String?
}

private struct ShareImportPreviewRequest: Encodable {
    let text: String
    let sourceApp: String?
    let locale: String?
}

private struct ShareImportCommitRequest: Encodable {
    let targetProjectId: String?
    let newProjectTitle: String?
    let english: String
    let japanese: String
    let originalText: String?
    let sourceApp: String?
}

private struct SharedProjectSummaryDTO: Decodable {
    let project: ProjectDTO
    let accessRole: SharedProjectAccessRole
    let wordCount: Int?
    let collaboratorCount: Int?
    let ownerUsername: String?
}

private struct SharedProjectsResponse: Decodable {
    let success: Bool
    let owned: [SharedProjectSummaryDTO]?
    let joined: [SharedProjectSummaryDTO]?
    let publicProjects: [SharedProjectSummaryDTO]?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case success
        case owned
        case joined
        case publicProjects = "public"
        case error
    }
}

private struct SharedProjectJoinRequest: Encodable {
    let codeOrLink: String
}

private struct SharedProjectJoinResponse: Decodable {
    let success: Bool
    let item: SharedProjectSummaryDTO?
    let error: String?
}

private struct SharedProjectDetailResponse: Decodable {
    let success: Bool
    let project: ProjectDTO?
    let accessRole: SharedProjectAccessRole?
    let collaboratorCount: Int?
    let words: [WordDTO]?
    let error: String?
}

private struct SharedProjectWordRequest: Encodable {
    let english: String
    let japanese: String
}

private struct SharedProjectWordResponse: Decodable {
    let success: Bool
    let word: WordDTO?
    let error: String?
}

private struct SharedProjectDeleteWordResponse: Decodable {
    let success: Bool
    let error: String?
}

actor WebAPIClient {
    private let baseURL: URL
    private let supabaseURL: URL
    private let supabaseAnonKey: String
    private let urlSession: URLSession
    private let logger = Logger(subsystem: "MerkenIOS", category: "WebAPIClient")

    init(baseURL: URL, supabaseURL: URL, supabaseAnonKey: String) {
        self.baseURL = baseURL
        self.supabaseURL = supabaseURL
        self.supabaseAnonKey = supabaseAnonKey

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 90
        self.urlSession = URLSession(configuration: config)
    }

    private func rethrowTransportError(
        _ error: Error,
        messagePrefix: String = "通信エラー"
    ) throws -> Never {
        if error.isCancellationError {
            throw error
        }

        if let urlError = error as? URLError, urlError.code == .timedOut {
            throw WebAPIError.networkTimeout
        }

        throw WebAPIError.serverError("\(messagePrefix): \(error.localizedDescription)")
    }

    private func sendJSONRequest<Body: Encodable>(
        path: String,
        bearerToken: String,
        timeout: TimeInterval,
        body: Body
    ) async throws -> (data: Data, http: HTTPURLResponse) {
        let url = try makeWebAPIURL(path: path)
        logger.info("Web API request started: method=POST url=\(url.absoluteString, privacy: .public)")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = timeout
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        logger.info("Web API response received: method=POST url=\(url.absoluteString, privacy: .public) status=\(http.statusCode, privacy: .public)")

        return (data, http)
    }

    private func sendRequest(
        method: String,
        path: String,
        bearerToken: String,
        timeout: TimeInterval,
        body: Data? = nil
    ) async throws -> (data: Data, http: HTTPURLResponse) {
        let url = try makeWebAPIURL(path: path)
        logger.info("Web API request started: method=\(method, privacy: .public) url=\(url.absoluteString, privacy: .public)")

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = timeout
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        logger.info("Web API response received: method=\(method, privacy: .public) url=\(url.absoluteString, privacy: .public) status=\(http.statusCode, privacy: .public)")

        return (data, http)
    }

    private func makeWebAPIURL(path: String) throws -> URL {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw WebAPIError.serverError("API URL の生成に失敗しました。")
        }

        if let absolute = URL(string: trimmed), absolute.scheme != nil {
            return absolute
        }

        guard let origin = URL(string: "/", relativeTo: baseURL)?.absoluteURL else {
            throw WebAPIError.serverError("API URL の生成に失敗しました。")
        }

        let normalized = trimmed.hasPrefix("/") ? String(trimmed.dropFirst()) : trimmed
        guard let url = URL(string: normalized, relativeTo: origin)?.absoluteURL else {
            throw WebAPIError.serverError("API URL の生成に失敗しました。")
        }
        return url
    }

    private func makeSupabaseStorageURL(path: String) throws -> URL {
        let raw = "storage/v1/\(path)"
        guard let url = URL(string: raw, relativeTo: supabaseURL)?.absoluteURL else {
            throw WebAPIError.serverError("Storage URL の生成に失敗しました。")
        }
        return url
    }

    private func decodeErrorMessage(from data: Data, fallback: String) -> String {
        if let decoded = try? JSONDecoder().decode(ScanJobErrorResponse.self, from: data),
           let message = decoded.error,
           !message.isEmpty {
            return message
        }
        if let message = String(data: data, encoding: .utf8),
           !message.isEmpty {
            if message.contains("<!DOCTYPE html") || message.contains("<html") {
                return fallback
            }
            return message
        }
        return fallback
    }

    private func isLikelyHTML(_ data: Data) -> Bool {
        guard let message = String(data: data, encoding: .utf8), !message.isEmpty else {
            return false
        }
        return message.contains("<!DOCTYPE html") || message.contains("<html")
    }

    private func makeScanJobsDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .supabaseISO8601
        return decoder
    }

    private func makeSupabaseJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .supabaseISO8601
        return decoder
    }

    private func mapSharedProjectSummary(from dto: SharedProjectSummaryDTO) -> SharedProjectSummary {
        SharedProjectSummary(
            project: SupabaseMapper.project(from: dto.project),
            accessRole: dto.accessRole,
            wordCount: dto.wordCount ?? 0,
            collaboratorCount: dto.collaboratorCount ?? 1,
            ownerUsername: dto.ownerUsername
        )
    }

    func extractWords(
        imageBase64: String,
        mode: ScanMode,
        eikenLevel: EikenLevel?,
        bearerToken: String
    ) async throws -> [ExtractedWord] {
        let url = try makeWebAPIURL(path: "api/extract")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60

        let body = ExtractRequest(
            image: imageBase64,
            mode: mode.rawValue,
            eikenLevel: mode == .eiken ? eikenLevel?.rawValue : nil
        )

        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(body)

        logger.info("Sending extract request: mode=\(mode.rawValue), imageSize=\(request.httpBody?.count ?? 0) bytes")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        logger.info("Extract response: status=\(http.statusCode)")

        switch http.statusCode {
        case 200...299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 429:
            let errorResponse = try? JSONDecoder().decode(ExtractResponse.self, from: data)
            let message = errorResponse?.error ?? "スキャン上限に達しました。"
            throw WebAPIError.scanLimitReached(message)
        case 400:
            let errorResponse = try? JSONDecoder().decode(ExtractResponse.self, from: data)
            let message = errorResponse?.error ?? "画像の形式が不正です。"
            throw WebAPIError.badRequest(message)
        default:
            let errorResponse = try? JSONDecoder().decode(ExtractResponse.self, from: data)
            let message = errorResponse?.error ?? "サーバーエラーが発生しました。"
            throw WebAPIError.serverError(message)
        }

        let decoded: ExtractResponse
        do {
            decoded = try JSONDecoder().decode(ExtractResponse.self, from: data)
        } catch {
            logger.error("Decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }

        guard decoded.success else {
            throw WebAPIError.serverError(decoded.error ?? "抽出に失敗しました。")
        }

        guard let words = decoded.words, !words.isEmpty else {
            throw WebAPIError.noWordsExtracted
        }

        logger.info("Extracted \(words.count) words")
        return words
    }

    func searchSemantic(
        query: String,
        bearerToken: String
    ) async throws -> [SemanticSearchResult] {
        let url = try makeWebAPIURL(path: "api/search/semantic")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let body = ["query": query]
        request.httpBody = try JSONEncoder().encode(body)

        logger.info("Sending semantic search: query=\(query)")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        logger.info("Semantic search response: status=\(http.statusCode)")

        switch http.statusCode {
        case 200...299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        default:
            throw WebAPIError.serverError("検索に失敗しました。")
        }

        let decoded: SemanticSearchResponse
        do {
            decoded = try JSONDecoder().decode(SemanticSearchResponse.self, from: data)
        } catch {
            logger.error("Semantic search decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }

        logger.info("Semantic search returned \(decoded.results.count) results")
        return decoded.results
    }

    func generateQuizPrefill(
        words: [QuizPrefillWordInput],
        bearerToken: String
    ) async throws -> [QuizPrefillResult] {
        guard !words.isEmpty else { return [] }
        logger.info("Sending quiz prefill request: \(words.count) words")

        let (data, http) = try await sendJSONRequest(
            path: "api/generate-quiz-distractors",
            bearerToken: bearerToken,
            timeout: 90,
            body: QuizPrefillRequest(words: words)
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 400:
            let errorResponse = try? JSONDecoder().decode(QuizPrefillResponse.self, from: data)
            throw WebAPIError.badRequest(errorResponse?.error ?? "リクエストが不正です。")
        default:
            let errorResponse = try? JSONDecoder().decode(QuizPrefillResponse.self, from: data)
            throw WebAPIError.serverError(errorResponse?.error ?? "補完データの生成に失敗しました。")
        }

        let decoded: QuizPrefillResponse
        do {
            decoded = try JSONDecoder().decode(QuizPrefillResponse.self, from: data)
        } catch {
            logger.error("Quiz prefill decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }

        guard decoded.success else {
            throw WebAPIError.serverError(decoded.error ?? "補完データの生成に失敗しました。")
        }

        return decoded.results ?? []
    }

    func generateSentenceQuizWithRawResponse(
        words: [SentenceQuizWordInput],
        bearerToken: String
    ) async throws -> SentenceQuizGeneratedResponse {
        logger.info("Sending sentence-quiz request: \(words.count) words")

        let (data, http) = try await sendJSONRequest(
            path: "api/sentence-quiz/lite",
            bearerToken: bearerToken,
            timeout: 30,
            body: SentenceQuizRequest(words: words, useVectorSearch: false)
        )

        logger.info("Sentence-quiz response: status=\(http.statusCode)")

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 400:
            let errorResponse = try? JSONDecoder().decode(SentenceQuizResponse.self, from: data)
            throw WebAPIError.badRequest(errorResponse?.error ?? "リクエストが不正です。")
        default:
            let errorResponse = try? JSONDecoder().decode(SentenceQuizResponse.self, from: data)
            throw WebAPIError.serverError(errorResponse?.error ?? "サーバーエラーが発生しました。")
        }

        let decoded: SentenceQuizResponse
        do {
            decoded = try JSONDecoder().decode(SentenceQuizResponse.self, from: data)
        } catch {
            logger.error("Sentence-quiz decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }

        guard decoded.success else {
            throw WebAPIError.serverError(decoded.error ?? "問題の生成に失敗しました。")
        }

        guard let questions = decoded.questions, !questions.isEmpty else {
            throw WebAPIError.serverError("問題を生成できませんでした。もう一度お試しください。")
        }

        logger.info("Generated \(questions.count) sentence-quiz questions")
        return SentenceQuizGeneratedResponse(questions: questions, rawResponseData: data)
    }

    func generateSentenceQuiz(
        words: [SentenceQuizWordInput],
        bearerToken: String
    ) async throws -> [SentenceQuizQuestion] {
        let generated = try await generateSentenceQuizWithRawResponse(
            words: words,
            bearerToken: bearerToken
        )
        return generated.questions
    }

    func syncEmbeddings(
        wordIds: [String],
        limit: Int,
        bearerToken: String
    ) async throws {
        guard !wordIds.isEmpty else { return }
        logger.info("Sync embeddings request: \(wordIds.count) words")

        let (data, http) = try await sendJSONRequest(
            path: "api/embeddings/sync",
            bearerToken: bearerToken,
            timeout: 90,
            body: EmbeddingSyncRequest(wordIds: wordIds, limit: limit)
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 400:
            let errorResponse = try? JSONDecoder().decode(EmbeddingSyncResponse.self, from: data)
            throw WebAPIError.badRequest(errorResponse?.error ?? "Embedding同期リクエストが不正です。")
        default:
            let errorResponse = try? JSONDecoder().decode(EmbeddingSyncResponse.self, from: data)
            throw WebAPIError.serverError(errorResponse?.error ?? "Embedding同期に失敗しました。")
        }

        if let decoded = try? JSONDecoder().decode(EmbeddingSyncResponse.self, from: data),
           decoded.success == false {
            throw WebAPIError.serverError(decoded.error ?? "Embedding同期に失敗しました。")
        }
    }

    func warmQuiz2Similar(
        sourceWordIds: [String],
        limit: Int,
        bearerToken: String
    ) async throws {
        guard !sourceWordIds.isEmpty else { return }
        logger.info("Warm quiz2 similar request: \(sourceWordIds.count) words")

        let (data, http) = try await sendJSONRequest(
            path: "api/quiz2/similar/batch",
            bearerToken: bearerToken,
            timeout: 90,
            body: Quiz2SimilarBatchRequest(sourceWordIds: sourceWordIds, limit: limit)
        )

        switch http.statusCode {
        case 200 ... 299:
            return
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 400:
            if let message = String(data: data, encoding: .utf8), !message.isEmpty {
                throw WebAPIError.badRequest(message)
            }
            throw WebAPIError.badRequest("類似語キャッシュのリクエストが不正です。")
        default:
            if let message = String(data: data, encoding: .utf8), !message.isEmpty {
                throw WebAPIError.serverError(message)
            }
            throw WebAPIError.serverError("類似語キャッシュのウォームアップに失敗しました。")
        }
    }

    func verifyAppStoreTransaction(
        transactionId: String,
        source: String,
        bearerToken: String
    ) async throws -> AppStoreVerifyResponse {
        let (data, http) = try await sendJSONRequest(
            path: "api/subscription/appstore/verify",
            bearerToken: bearerToken,
            timeout: 45,
            body: AppStoreVerifyRequest(transactionId: transactionId, source: source)
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 400:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "購入情報の検証に失敗しました。")
            )
        case 401:
            throw WebAPIError.notAuthenticated
        case 409:
            throw WebAPIError.conflict(
                decodeErrorMessage(from: data, fallback: "既存の契約情報と競合しました。")
            )
        case 422:
            throw WebAPIError.unprocessable(
                decodeErrorMessage(from: data, fallback: "購入情報の署名検証に失敗しました。")
            )
        case 502:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "Appleサーバーとの通信に失敗しました。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "購入情報の検証に失敗しました。")
            )
        }

        let decoded: AppStoreVerifyResponse
        do {
            decoded = try JSONDecoder().decode(AppStoreVerifyResponse.self, from: data)
        } catch {
            logger.error("App Store verify decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }

        guard decoded.success else {
            throw WebAPIError.serverError(decoded.error ?? "購入情報の検証に失敗しました。")
        }

        return decoded
    }

    func uploadScanImages(
        _ images: [ScanUploadImage],
        userId: String,
        bearerToken: String
    ) async throws -> [String] {
        guard !images.isEmpty else { return [] }

        let timestamp = Int(Date().timeIntervalSince1970 * 1000)

        // Build paths upfront so order is deterministic
        let indexedImages: [(index: Int, image: ScanUploadImage, path: String)] = images.enumerated().map { index, image in
            let ext = image.fileExtension.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let safeExt = ext.isEmpty ? "jpg" : ext
            let path = "\(userId)/\(timestamp)-\(index)-\(UUID().uuidString).\(safeExt)"
            return (index, image, path)
        }

        // Upload all images in parallel
        do {
            try await withThrowingTaskGroup(of: (Int, String).self) { group in
                for item in indexedImages {
                    group.addTask {
                        try await self.uploadScanImage(
                            imageData: item.image.data,
                            path: item.path,
                            contentType: item.image.contentType,
                            bearerToken: bearerToken
                        )
                        return (item.index, item.path)
                    }
                }

                // Wait for all to complete (throws on first failure)
                for try await _ in group {}
            }

            // Return paths in original order
            return indexedImages.map(\.path)
        } catch {
            let allPaths = indexedImages.map(\.path)
            await removeScanImages(paths: allPaths, bearerToken: bearerToken)
            throw error
        }
    }

    func removeScanImages(paths: [String], bearerToken: String) async {
        guard !paths.isEmpty else { return }

        do {
            let url = try makeSupabaseStorageURL(path: "object/scan-images")
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
            request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.timeoutInterval = 30
            request.httpBody = try JSONEncoder().encode(ScanImagesRemoveRequest(prefixes: paths))
            _ = try await urlSession.data(for: request)
        } catch {
            logger.warning("Failed to cleanup uploaded scan images: \(error.localizedDescription)")
        }
    }

    func createScanJob(
        imagePaths: [String],
        projectTitle: String,
        projectIcon: String?,
        scanMode: ScanMode,
        eikenLevel: EikenLevel?,
        targetProjectId: String?,
        aiEnabled: Bool?,
        clientPlatform: String = "ios",
        bearerToken: String
    ) async throws -> ScanJobCreateResponse {
        let bodyWithPreference = ScanJobCreateRequest(
            imagePaths: imagePaths,
            projectTitle: projectTitle,
            projectIcon: projectIcon,
            scanMode: scanMode.rawValue,
            eikenLevel: scanMode == .eiken ? eikenLevel?.rawValue : nil,
            targetProjectId: targetProjectId,
            clientPlatform: clientPlatform,
            aiEnabled: aiEnabled
        )

        func sendCreateRequest(_ body: ScanJobCreateRequest) async throws -> (Data, HTTPURLResponse) {
            try await sendJSONRequest(
                path: "api/scan-jobs/create",
                bearerToken: bearerToken,
                timeout: 60,
                body: body
            )
        }

        var requestBody = bodyWithPreference
        var (data, http) = try await sendCreateRequest(requestBody)

        // Backward compatibility: older backend schemas may reject unknown "aiEnabled".
        if http.statusCode == 400, aiEnabled != nil {
            let message = decodeErrorMessage(from: data, fallback: "")
            let shouldRetryWithoutPreference =
                message == "Missing required fields"
                || message.contains("required fields")
                || message.contains("Invalid request body")
            if shouldRetryWithoutPreference {
                logger.warning("scan-jobs/create rejected aiEnabled field; retrying without aiEnabled for compatibility.")
                requestBody = ScanJobCreateRequest(
                    imagePaths: imagePaths,
                    projectTitle: projectTitle,
                    projectIcon: projectIcon,
                    scanMode: scanMode.rawValue,
                    eikenLevel: scanMode == .eiken ? eikenLevel?.rawValue : nil,
                    targetProjectId: targetProjectId,
                    clientPlatform: clientPlatform,
                    aiEnabled: nil
                )
                (data, http) = try await sendCreateRequest(requestBody)
            }
        }

        if http.statusCode == 400, requestBody.projectIcon != nil {
            let message = decodeErrorMessage(from: data, fallback: "")
            let shouldRetryWithoutIcon =
                message == "Missing required fields"
                || message.contains("required fields")
                || message.contains("Invalid request body")
            if shouldRetryWithoutIcon {
                logger.warning("scan-jobs/create rejected projectIcon field; retrying without projectIcon for compatibility.")
                requestBody = ScanJobCreateRequest(
                    imagePaths: imagePaths,
                    projectTitle: projectTitle,
                    projectIcon: nil,
                    scanMode: scanMode.rawValue,
                    eikenLevel: scanMode == .eiken ? eikenLevel?.rawValue : nil,
                    targetProjectId: targetProjectId,
                    clientPlatform: clientPlatform,
                    aiEnabled: requestBody.aiEnabled
                )
                (data, http) = try await sendCreateRequest(requestBody)
            }
        }

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 429:
            throw WebAPIError.scanLimitReached(
                decodeErrorMessage(from: data, fallback: "本日のスキャン上限に達しました。")
            )
        case 400:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "スキャンジョブの作成に失敗しました。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "スキャンジョブの作成に失敗しました。")
            )
        }

        do {
            return try JSONDecoder().decode(ScanJobCreateResponse.self, from: data)
        } catch {
            logger.error("Scan job create decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func fetchUserPreferences(bearerToken: String) async throws -> Bool? {
        let (data, http) = try await sendRequest(
            method: "GET",
            path: "api/user-preferences",
            bearerToken: bearerToken,
            timeout: 15
        )

        switch http.statusCode {
        case 200 ... 299:
            if isLikelyHTML(data) {
                // Fallback for environments where the endpoint is not deployed yet.
                return nil
            }
            break
        case 404, 405:
            // Backward compatibility when running against an older backend.
            return nil
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "設定の取得に失敗しました。")
            )
        }

        do {
            return try JSONDecoder().decode(UserPreferencesResponse.self, from: data).aiEnabled
        } catch {
            logger.error("User preferences decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func updateUserPreferences(
        aiEnabled: Bool,
        bearerToken: String
    ) async throws -> Bool? {
        let requestBody = try JSONEncoder().encode(UserPreferencesUpdateRequest(aiEnabled: aiEnabled))
        let (data, http) = try await sendRequest(
            method: "PUT",
            path: "api/user-preferences",
            bearerToken: bearerToken,
            timeout: 15,
            body: requestBody
        )

        switch http.statusCode {
        case 200 ... 299:
            if isLikelyHTML(data) {
                // Fallback for environments where the endpoint is not deployed yet.
                return nil
            }
            break
        case 404, 405:
            // Backward compatibility when running against an older backend.
            return nil
        case 401:
            throw WebAPIError.notAuthenticated
        case 400:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "設定の更新リクエストが不正です。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "設定の更新に失敗しました。")
            )
        }

        do {
            return try JSONDecoder().decode(UserPreferencesResponse.self, from: data).aiEnabled
        } catch {
            logger.error("User preferences update decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    // MARK: - Profile

    func fetchProfile(bearerToken: String) async throws -> UserProfile {
        let (data, http) = try await sendRequest(
            method: "GET",
            path: "api/profile",
            bearerToken: bearerToken,
            timeout: 15
        )

        switch http.statusCode {
        case 200 ... 299:
            if isLikelyHTML(data) {
                return UserProfile(userId: "", username: nil)
            }
            break
        case 404, 405:
            return UserProfile(userId: "", username: nil)
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "プロフィールの取得に失敗しました。")
            )
        }

        do {
            let response = try JSONDecoder().decode(ProfileResponse.self, from: data)
            return UserProfile(userId: "", username: response.username)
        } catch {
            logger.error("Profile decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func updateProfile(
        username: String,
        bearerToken: String
    ) async throws -> UserProfile {
        let requestBody = try JSONEncoder().encode(ProfileUpdateRequest(username: username))
        let (data, http) = try await sendRequest(
            method: "PUT",
            path: "api/profile",
            bearerToken: bearerToken,
            timeout: 15,
            body: requestBody
        )

        switch http.statusCode {
        case 200 ... 299:
            if isLikelyHTML(data) {
                return UserProfile(userId: "", username: username)
            }
            break
        case 404, 405:
            return UserProfile(userId: "", username: username)
        case 401:
            throw WebAPIError.notAuthenticated
        case 400:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "ユーザー名が不正です。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "プロフィールの更新に失敗しました。")
            )
        }

        do {
            let response = try JSONDecoder().decode(ProfileResponse.self, from: data)
            return UserProfile(userId: "", username: response.username)
        } catch {
            logger.error("Profile update decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func previewShareImport(
        text: String,
        sourceApp: String?,
        locale: String?,
        bearerToken: String
    ) async throws -> ShareImportPreviewCandidate {
        let (data, http) = try await sendJSONRequest(
            path: "api/share-import/preview",
            bearerToken: bearerToken,
            timeout: 20,
            body: ShareImportPreviewRequest(
                text: text,
                sourceApp: sourceApp,
                locale: locale
            )
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 429:
            throw WebAPIError.scanLimitReached(
                decodeErrorMessage(from: data, fallback: "利用上限に達しました。")
            )
        case 422:
            throw WebAPIError.unprocessable(
                decodeErrorMessage(from: data, fallback: "英単語を判定できませんでした。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "共有プレビューの生成に失敗しました。")
            )
        }

        let decoded: ShareImportPreviewResponse
        do {
            decoded = try JSONDecoder().decode(ShareImportPreviewResponse.self, from: data)
        } catch {
            logger.error("Share import preview decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }

        guard decoded.success, let candidate = decoded.candidate else {
            throw WebAPIError.serverError(decoded.error ?? "共有プレビューの生成に失敗しました。")
        }

        return candidate
    }

    func fetchShareImportProjects(
        limit: Int = 20,
        bearerToken: String
    ) async throws -> [ShareImportProjectOption] {
        var components = URLComponents(url: try makeWebAPIURL(path: "api/share-import/projects"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "limit", value: String(max(1, min(50, limit))))]
        guard let url = components?.url else {
            throw WebAPIError.serverError("単語帳取得URLの生成に失敗しました。")
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
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "単語帳一覧の取得に失敗しました。")
            )
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .supabaseISO8601
            let decoded = try decoder.decode(ShareImportProjectsResponse.self, from: data)
            guard decoded.success else {
                throw WebAPIError.serverError(decoded.error ?? "単語帳一覧の取得に失敗しました。")
            }
            return decoded.projects
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Share import projects decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func commitShareImport(
        targetProjectId: String?,
        newProjectTitle: String?,
        english: String,
        japanese: String,
        originalText: String?,
        sourceApp: String?,
        bearerToken: String
    ) async throws -> ShareImportCommitResponse {
        let (data, http) = try await sendJSONRequest(
            path: "api/share-import/commit",
            bearerToken: bearerToken,
            timeout: 20,
            body: ShareImportCommitRequest(
                targetProjectId: targetProjectId,
                newProjectTitle: newProjectTitle,
                english: english,
                japanese: japanese,
                originalText: originalText,
                sourceApp: sourceApp
            )
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "保存先の単語帳にアクセスできません。")
            )
        case 400, 422:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "共有単語の保存に失敗しました。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "共有単語の保存に失敗しました。")
            )
        }

        do {
            return try JSONDecoder().decode(ShareImportCommitResponse.self, from: data)
        } catch {
            logger.error("Share import commit decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func fetchSharedProjects(bearerToken: String) async throws -> SharedProjectCatalog {
        let (data, http) = try await sendRequest(
            method: "GET",
            path: "api/shared-projects",
            bearerToken: bearerToken,
            timeout: 20
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "共有単語帳一覧の取得に失敗しました。")
            )
        }

        do {
            let decoded = try makeSupabaseJSONDecoder().decode(SharedProjectsResponse.self, from: data)
            guard decoded.success else {
                throw WebAPIError.serverError(decoded.error ?? "共有単語帳一覧の取得に失敗しました。")
            }
            return SharedProjectCatalog(
                owned: (decoded.owned ?? []).map(mapSharedProjectSummary(from:)),
                joined: (decoded.joined ?? []).map(mapSharedProjectSummary(from:)),
                publicProjects: (decoded.publicProjects ?? []).map(mapSharedProjectSummary(from:))
            )
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Shared projects decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func joinSharedProject(
        codeOrLink: String,
        bearerToken: String
    ) async throws -> SharedProjectSummary {
        let (data, http) = try await sendJSONRequest(
            path: "api/shared-projects",
            bearerToken: bearerToken,
            timeout: 20,
            body: SharedProjectJoinRequest(codeOrLink: codeOrLink)
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 400, 404:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "共有コードを確認してください。")
            )
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "共有単語帳への参加に失敗しました。")
            )
        }

        do {
            let decoded = try makeSupabaseJSONDecoder().decode(SharedProjectJoinResponse.self, from: data)
            guard decoded.success, let item = decoded.item else {
                throw WebAPIError.serverError(decoded.error ?? "共有単語帳への参加に失敗しました。")
            }
            return mapSharedProjectSummary(from: item)
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Shared project join decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func fetchSharedProjectDetail(
        projectId: String,
        bearerToken: String
    ) async throws -> SharedProjectDetail {
        let (data, http) = try await sendRequest(
            method: "GET",
            path: "api/shared-projects/\(projectId)",
            bearerToken: bearerToken,
            timeout: 20
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403, 404:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "共有単語帳にアクセスできません。")
            )
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "共有単語帳の読み込みに失敗しました。")
            )
        }

        do {
            let decoded = try makeSupabaseJSONDecoder().decode(SharedProjectDetailResponse.self, from: data)
            guard decoded.success,
                  let project = decoded.project,
                  let accessRole = decoded.accessRole,
                  let words = decoded.words else {
                throw WebAPIError.serverError(decoded.error ?? "共有単語帳の読み込みに失敗しました。")
            }
            return SharedProjectDetail(
                project: SupabaseMapper.project(from: project),
                words: words.map(SupabaseMapper.word(from:)),
                accessRole: accessRole,
                collaboratorCount: decoded.collaboratorCount ?? 1
            )
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Shared project detail decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func createSharedProjectWord(
        projectId: String,
        english: String,
        japanese: String,
        bearerToken: String
    ) async throws -> Word {
        let (data, http) = try await sendJSONRequest(
            path: "api/shared-projects/\(projectId)/words",
            bearerToken: bearerToken,
            timeout: 20,
            body: SharedProjectWordRequest(english: english, japanese: japanese)
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 400, 403, 404:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "単語の追加に失敗しました。")
            )
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "単語の追加に失敗しました。")
            )
        }

        do {
            let decoded = try makeSupabaseJSONDecoder().decode(SharedProjectWordResponse.self, from: data)
            guard decoded.success, let word = decoded.word else {
                throw WebAPIError.serverError(decoded.error ?? "単語の追加に失敗しました。")
            }
            return SupabaseMapper.word(from: word)
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Shared project word create decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func updateSharedProjectWord(
        projectId: String,
        wordId: String,
        english: String,
        japanese: String,
        bearerToken: String
    ) async throws -> Word {
        let requestBody = try JSONEncoder().encode(
            SharedProjectWordRequest(english: english, japanese: japanese)
        )
        let (data, http) = try await sendRequest(
            method: "PATCH",
            path: "api/shared-projects/\(projectId)/words/\(wordId)",
            bearerToken: bearerToken,
            timeout: 20,
            body: requestBody
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 400, 403, 404:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "単語の更新に失敗しました。")
            )
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "単語の更新に失敗しました。")
            )
        }

        do {
            let decoded = try makeSupabaseJSONDecoder().decode(SharedProjectWordResponse.self, from: data)
            guard decoded.success, let word = decoded.word else {
                throw WebAPIError.serverError(decoded.error ?? "単語の更新に失敗しました。")
            }
            return SupabaseMapper.word(from: word)
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Shared project word update decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func deleteSharedProjectWord(
        projectId: String,
        wordId: String,
        bearerToken: String
    ) async throws {
        let (data, http) = try await sendRequest(
            method: "DELETE",
            path: "api/shared-projects/\(projectId)/words/\(wordId)",
            bearerToken: bearerToken,
            timeout: 20
        )

        switch http.statusCode {
        case 200 ... 299:
            break
        case 400, 403, 404:
            throw WebAPIError.badRequest(
                decodeErrorMessage(from: data, fallback: "単語の削除に失敗しました。")
            )
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "単語の削除に失敗しました。")
            )
        }

        do {
            let decoded = try makeSupabaseJSONDecoder().decode(SharedProjectDeleteWordResponse.self, from: data)
            guard decoded.success else {
                throw WebAPIError.serverError(decoded.error ?? "単語の削除に失敗しました。")
            }
        } catch let error as WebAPIError {
            throw error
        } catch {
            logger.error("Shared project word delete decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func fetchScanJobs(bearerToken: String) async throws -> [ScanJobDTO] {
        let url = try makeWebAPIURL(path: "api/scan-jobs")
        logger.info("Web API request started: method=GET url=\(url.absoluteString, privacy: .public)")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        logger.info("Web API response received: method=GET url=\(url.absoluteString, privacy: .public) status=\(http.statusCode, privacy: .public)")

        switch http.statusCode {
        case 200 ... 299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "スキャンジョブの取得に失敗しました。")
            )
        }

        do {
            let decoded = try makeScanJobsDecoder().decode(ScanJobsResponse.self, from: data)
            let statusSummary = decoded.jobs.map { "\($0.id):\($0.status.rawValue)" }.joined(separator: ",")
            logger.info("Fetched scan jobs: \(statusSummary, privacy: .public)")
            return decoded.jobs
        } catch {
            logger.error("Scan jobs decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed(error.localizedDescription)
        }
    }

    func acknowledgeScanJob(jobId: String, bearerToken: String) async throws {
        var components = URLComponents(url: try makeWebAPIURL(path: "api/scan-jobs"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "jobId", value: jobId)]
        guard let url = components?.url else {
            throw WebAPIError.serverError("ジョブ確認URLの生成に失敗しました。")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            try rethrowTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        switch http.statusCode {
        case 200 ... 299:
            return
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "スキャンジョブの既読処理に失敗しました。")
            )
        }
    }

    // MARK: - iOS Push Notification Device Token

    struct RegisterDeviceTokenBody: Encodable {
        let deviceToken: String
        let bundleId: String
        let appVersion: String?
        let osVersion: String?
    }

    struct UnregisterDeviceTokenBody: Encodable {
        let deviceToken: String
    }

    func registerDeviceToken(
        _ token: String,
        bearerToken: String
    ) async throws {
        let bundleId = Bundle.main.bundleIdentifier ?? "com.merken.iosnative"
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let osVersion = UIDevice.current.systemVersion

        let body = RegisterDeviceTokenBody(
            deviceToken: token,
            bundleId: bundleId,
            appVersion: appVersion,
            osVersion: osVersion
        )

        let (data, http) = try await sendJSONRequest(
            path: "/api/notifications/ios-device-token",
            bearerToken: bearerToken,
            timeout: 15,
            body: body
        )

        switch http.statusCode {
        case 200 ... 299:
            return
        case 401:
            throw WebAPIError.notAuthenticated
        default:
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "デバイストークンの登録に失敗しました。")
            )
        }
    }

    func unregisterDeviceToken(
        _ token: String,
        bearerToken: String
    ) async throws {
        let url = try makeWebAPIURL(path: "api/notifications/ios-device-token")

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15
        request.httpBody = try JSONEncoder().encode(UnregisterDeviceTokenBody(deviceToken: token))

        let (_, response) = try await urlSession.data(for: request)

        guard let http = response as? HTTPURLResponse else { return }
        if http.statusCode == 401 {
            throw WebAPIError.notAuthenticated
        }
    }

    // MARK: - Scan Image Upload

    private func uploadScanImage(
        imageData: Data,
        path: String,
        contentType: String,
        bearerToken: String
    ) async throws {
        let url = try makeSupabaseStorageURL(path: "object/scan-images/\(path)")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("false", forHTTPHeaderField: "x-upsert")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("max-age=3600", forHTTPHeaderField: "cache-control")
        request.timeoutInterval = 120

        // Use background upload service so uploads continue even if the app is suspended
        do {
            _ = try await BackgroundUploadService.shared.upload(
                imageData: imageData,
                request: request
            )
        } catch let error as WebAPIError {
            throw error
        } catch {
            try rethrowTransportError(error, messagePrefix: "アップロード通信エラー")
        }
    }
}
