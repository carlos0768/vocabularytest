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

actor WebAPIClient {
    private let baseURL: URL
    private let urlSession: URLSession
    private let logger = Logger(subsystem: "MerkenIOS", category: "WebAPIClient")

    init(baseURL: URL) {
        self.baseURL = baseURL

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 90
        self.urlSession = URLSession(configuration: config)
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

    func generateSentenceQuiz(
        words: [SentenceQuizWordInput],
        bearerToken: String
    ) async throws -> [SentenceQuizQuestion] {
        let url = baseURL.appendingPathComponent("api/sentence-quiz")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 90 // AI processing is heavy

        let body = SentenceQuizRequest(words: words, useVectorSearch: false)
        request.httpBody = try JSONEncoder().encode(body)

        logger.info("Sending sentence-quiz request: \(words.count) words")

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

        logger.info("Sentence-quiz response: status=\(http.statusCode)")

        switch http.statusCode {
        case 200...299:
            break
        case 401:
            throw WebAPIError.notAuthenticated
        case 403:
            throw WebAPIError.proRequired
        case 400:
            let errorResponse = try? JSONDecoder().decode(SentenceQuizResponse.self, from: data)
            let message = errorResponse?.error ?? "リクエストが不正です。"
            throw WebAPIError.badRequest(message)
        default:
            let errorResponse = try? JSONDecoder().decode(SentenceQuizResponse.self, from: data)
            let message = errorResponse?.error ?? "サーバーエラーが発生しました。"
            throw WebAPIError.serverError(message)
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
        return questions
    }
}
