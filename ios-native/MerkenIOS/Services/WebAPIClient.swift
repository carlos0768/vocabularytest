import Foundation
import OSLog

enum WebAPIError: LocalizedError {
    case notAuthenticated
    case proRequired
    case scanLimitReached(String)
    case badRequest(String)
    case serverError(String)
    case networkTimeout
    case noWordsExtracted
    case decodeFailed

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
        case .serverError(let message):
            return message
        case .networkTimeout:
            return "通信がタイムアウトしました。もう一度お試しください。"
        case .noWordsExtracted:
            return "単語を抽出できませんでした。別の画像をお試しください。"
        case .decodeFailed:
            return "レスポンスの解析に失敗しました。"
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
    let targetProjectId: String?

    enum CodingKeys: String, CodingKey {
        case wordCount
        case warnings
        case saveMode
        case extractedWords
        case targetProjectId
    }
}

struct ScanJobDTO: Codable, Identifiable, Sendable {
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
}

private struct ScanJobsResponse: Decodable {
    let jobs: [ScanJobDTO]
}

private struct ScanJobErrorResponse: Decodable {
    let error: String?
}

private struct ScanImagesRemoveRequest: Encodable {
    let prefixes: [String]
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

    private func sendJSONRequest<Body: Encodable>(
        path: String,
        bearerToken: String,
        timeout: TimeInterval,
        body: Body
    ) async throws -> (data: Data, http: HTTPURLResponse) {
        let url = baseURL.appendingPathComponent(path)

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
        } catch let error as URLError where error.code == .timedOut {
            throw WebAPIError.networkTimeout
        } catch {
            throw WebAPIError.serverError("通信エラー: \(error.localizedDescription)")
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("不明な通信エラー")
        }

        return (data, http)
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
            return message
        }
        return fallback
    }

    private func makeScanJobsDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .supabaseISO8601
        return decoder
    }

    func extractWords(
        imageBase64: String,
        mode: ScanMode,
        eikenLevel: EikenLevel?,
        bearerToken: String
    ) async throws -> [ExtractedWord] {
        let url = baseURL.appendingPathComponent("api/extract")

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
        } catch let error as URLError where error.code == .timedOut {
            throw WebAPIError.networkTimeout
        } catch {
            throw WebAPIError.serverError("通信エラー: \(error.localizedDescription)")
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
            throw WebAPIError.decodeFailed
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
        let url = baseURL.appendingPathComponent("api/search/semantic")

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
        } catch let error as URLError where error.code == .timedOut {
            throw WebAPIError.networkTimeout
        } catch {
            throw WebAPIError.serverError("通信エラー: \(error.localizedDescription)")
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
            throw WebAPIError.decodeFailed
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
            throw WebAPIError.decodeFailed
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
            throw WebAPIError.decodeFailed
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

    func uploadScanImages(
        _ images: [ScanUploadImage],
        userId: String,
        bearerToken: String
    ) async throws -> [String] {
        guard !images.isEmpty else { return [] }

        var uploadedPaths: [String] = []
        uploadedPaths.reserveCapacity(images.count)

        do {
            for (index, image) in images.enumerated() {
                let ext = image.fileExtension.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                let safeExt = ext.isEmpty ? "jpg" : ext
                let path = "\(userId)/\(Int(Date().timeIntervalSince1970 * 1000))-\(index)-\(UUID().uuidString).\(safeExt)"
                try await uploadScanImage(
                    imageData: image.data,
                    path: path,
                    contentType: image.contentType,
                    bearerToken: bearerToken
                )
                uploadedPaths.append(path)
            }

            return uploadedPaths
        } catch {
            await removeScanImages(paths: uploadedPaths, bearerToken: bearerToken)
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
        clientPlatform: String = "ios",
        bearerToken: String
    ) async throws -> ScanJobCreateResponse {
        let body = ScanJobCreateRequest(
            imagePaths: imagePaths,
            projectTitle: projectTitle,
            projectIcon: projectIcon,
            scanMode: scanMode.rawValue,
            eikenLevel: scanMode == .eiken ? eikenLevel?.rawValue : nil,
            targetProjectId: targetProjectId,
            clientPlatform: clientPlatform
        )

        let (data, http) = try await sendJSONRequest(
            path: "api/scan-jobs/create",
            bearerToken: bearerToken,
            timeout: 60,
            body: body
        )

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
            throw WebAPIError.decodeFailed
        }
    }

    func fetchScanJobs(bearerToken: String) async throws -> [ScanJobDTO] {
        let url = baseURL.appendingPathComponent("api/scan-jobs")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch let error as URLError where error.code == .timedOut {
            throw WebAPIError.networkTimeout
        } catch {
            throw WebAPIError.serverError("通信エラー: \(error.localizedDescription)")
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
                decodeErrorMessage(from: data, fallback: "スキャンジョブの取得に失敗しました。")
            )
        }

        do {
            let decoded = try makeScanJobsDecoder().decode(ScanJobsResponse.self, from: data)
            return decoded.jobs
        } catch {
            logger.error("Scan jobs decode failed: \(error.localizedDescription)")
            throw WebAPIError.decodeFailed
        }
    }

    func acknowledgeScanJob(jobId: String, bearerToken: String) async throws {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/scan-jobs"), resolvingAgainstBaseURL: false)
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
        } catch let error as URLError where error.code == .timedOut {
            throw WebAPIError.networkTimeout
        } catch {
            throw WebAPIError.serverError("通信エラー: \(error.localizedDescription)")
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
        request.timeoutInterval = 60
        request.httpBody = imageData

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch let error as URLError where error.code == .timedOut {
            throw WebAPIError.networkTimeout
        } catch {
            throw WebAPIError.serverError("アップロード通信エラー: \(error.localizedDescription)")
        }

        guard let http = response as? HTTPURLResponse else {
            throw WebAPIError.serverError("アップロードレスポンスが不正です。")
        }

        guard (200 ... 299).contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw WebAPIError.notAuthenticated
            }
            throw WebAPIError.serverError(
                decodeErrorMessage(from: data, fallback: "画像アップロードに失敗しました。")
            )
        }
    }
}
