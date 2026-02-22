import Foundation
import OSLog
import UserNotifications

protocol ScanNotificationServiceProtocol: Sendable {
    func requestAuthorizationIfNeeded() async
    func notifySuccess(projectTitle: String, wordCount: Int) async
    func notifyFailure(message: String) async
}

actor ScanNotificationService: ScanNotificationServiceProtocol {
    private let logger = Logger(subsystem: "MerkenIOS", category: "ScanNotification")
    private let center: UNUserNotificationCenter
    private var hasAttemptedAuthorization = false

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func requestAuthorizationIfNeeded() async {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .notDetermined else { return }
        guard !hasAttemptedAuthorization else { return }
        hasAttemptedAuthorization = true

        do {
            _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            logger.error("Notification authorization request failed: \(error.localizedDescription)")
        }
    }

    func notifySuccess(projectTitle: String, wordCount: Int) async {
        await requestAuthorizationIfNeeded()
        guard await canDeliverNotification() else { return }

        let content = UNMutableNotificationContent()
        content.title = "スキャン完了"
        content.body = "「\(projectTitle)」に\(wordCount)語を追加しました。"
        content.sound = .default

        await schedule(content: content, identifierPrefix: "scan.success")
    }

    func notifyFailure(message: String) async {
        await requestAuthorizationIfNeeded()
        guard await canDeliverNotification() else { return }

        let content = UNMutableNotificationContent()
        content.title = "スキャン保存失敗"
        content.body = message
        content.sound = .default

        await schedule(content: content, identifierPrefix: "scan.failure")
    }

    private func canDeliverNotification() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    private func schedule(content: UNMutableNotificationContent, identifierPrefix: String) async {
        let request = UNNotificationRequest(
            identifier: "\(identifierPrefix).\(UUID().uuidString)",
            content: content,
            trigger: nil
        )

        do {
            try await center.add(request)
        } catch {
            logger.error("Failed to schedule scan notification: \(error.localizedDescription)")
        }
    }
}
