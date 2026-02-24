import UIKit
import UserNotifications
import OSLog

/// AppDelegate handles APNs device token registration and remote notification delivery.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    private let logger = Logger(subsystem: "MerkenIOS", category: "AppDelegate")

    // MARK: - UIApplicationDelegate

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// Called when APNs returns a device token after successful registration.
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        logger.info("APNs device token received: \(tokenString.prefix(16), privacy: .public)...")

        // Post notification so AppState can pick it up and register with server
        NotificationCenter.default.post(
            name: .didReceiveAPNsDeviceToken,
            object: nil,
            userInfo: ["token": tokenString]
        )
    }

    /// Called when APNs registration fails.
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        logger.error("APNs registration failed: \(error.localizedDescription)")
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Handle notification when app is in foreground — show as banner.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    /// Handle notification tap — user tapped on the notification.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        logger.info("User tapped notification: \(String(describing: userInfo))")

        // Post notification for deep linking if needed
        if let projectId = userInfo["projectId"] as? String, !projectId.isEmpty {
            NotificationCenter.default.post(
                name: .didTapPushNotification,
                object: nil,
                userInfo: ["projectId": projectId]
            )
        }

        completionHandler()
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let didReceiveAPNsDeviceToken = Notification.Name("didReceiveAPNsDeviceToken")
    static let didTapPushNotification = Notification.Name("didTapPushNotification")
}
