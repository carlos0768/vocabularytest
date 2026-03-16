import Foundation
import OSLog
import UIKit

/// Manages background URLSession uploads so scan image uploads continue
/// even when the app is suspended or terminated.
final class BackgroundUploadService: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    static let shared = BackgroundUploadService()
    static let sessionIdentifier = "jp.merken.scan-upload"

    private let logger = Logger(subsystem: "MerkenIOS", category: "BackgroundUpload")

    /// Called by the system when all events for the background session have been delivered.
    private var systemCompletionHandler: (() -> Void)?

    /// Per-task completion continuations keyed by taskIdentifier.
    private var taskContinuations: [Int: CheckedContinuation<Data, Error>] = [:]
    private let lock = NSLock()

    /// Accumulated response data per task (background tasks deliver data via delegate).
    private var taskResponseData: [Int: Data] = [:]

    private lazy var backgroundSession: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.shouldUseExtendedBackgroundIdleMode = true
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    private override init() {
        super.init()
    }

    /// Must be called early (e.g. in `application(_:didFinishLaunchingWithOptions:)`)
    /// so the background session reconnects to any in-flight tasks from a previous launch.
    func activate() {
        _ = backgroundSession
        logger.info("Background upload session activated")
    }

    /// Store the system completion handler provided by
    /// `application(_:handleEventsForBackgroundURLSession:completionHandler:)`.
    func setSystemCompletionHandler(_ handler: @escaping () -> Void) {
        systemCompletionHandler = handler
    }

    // MARK: - Upload

    /// Upload image data to the given URL using a background upload task.
    /// Writes data to a temporary file (required for background uploads).
    func upload(
        imageData: Data,
        request: URLRequest
    ) async throws -> Data {
        // Write to temp file — background upload tasks require file-based body
        let tempDir = FileManager.default.temporaryDirectory
        let tempFile = tempDir.appendingPathComponent("scan-upload-\(UUID().uuidString).jpg")
        try imageData.write(to: tempFile)

        let task = backgroundSession.uploadTask(with: request, fromFile: tempFile)

        return try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            taskContinuations[task.taskIdentifier] = continuation
            taskResponseData[task.taskIdentifier] = Data()
            lock.unlock()

            task.resume()
            logger.info("Background upload task started: id=\(task.taskIdentifier)")
        }
    }

    // MARK: - URLSessionDataDelegate

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock()
        taskResponseData[dataTask.taskIdentifier, default: Data()].append(data)
        lock.unlock()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        let continuation = taskContinuations.removeValue(forKey: task.taskIdentifier)
        let responseData = taskResponseData.removeValue(forKey: task.taskIdentifier) ?? Data()
        lock.unlock()

        // Clean up temp file
        if let originalRequest = task.originalRequest,
           let bodyFileURL = originalRequest.url,
           bodyFileURL.scheme == "file" {
            try? FileManager.default.removeItem(at: bodyFileURL)
        }

        if let error {
            logger.error("Background upload failed: taskId=\(task.taskIdentifier) error=\(error.localizedDescription)")
            continuation?.resume(throwing: error)
            return
        }

        guard let httpResponse = task.response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let statusCode = (task.response as? HTTPURLResponse)?.statusCode ?? -1
            logger.error("Background upload HTTP error: taskId=\(task.taskIdentifier) status=\(statusCode)")
            continuation?.resume(throwing: WebAPIError.serverError("アップロードに失敗しました (HTTP \(statusCode))"))
            return
        }

        logger.info("Background upload completed: taskId=\(task.taskIdentifier)")
        continuation?.resume(returning: responseData)
    }

    // MARK: - Session-level delegate

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        logger.info("All background upload events delivered")
        DispatchQueue.main.async { [weak self] in
            self?.systemCompletionHandler?()
            self?.systemCompletionHandler = nil
        }
    }
}
