import Foundation

struct SharedAuthSnapshot: Codable, Sendable {
    let userId: String
    let email: String?
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
    let tokenType: String

    var isExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt <= Date()
    }
}

struct SharedImportEvent: Codable, Sendable {
    let id: String
    let projectId: String
    let projectTitle: String
    let wordCount: Int
    let createdAt: Date
}

enum ShareImportBridge {
    static let appGroupIdentifier = "group.com.merken.iosnative.shared"

    private enum Keys {
        static let authSnapshot = "merken_shared_auth_snapshot"
        static let lastImportEvent = "merken_last_share_import_event"
    }

    private static func sharedDefaults() -> UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    static func saveAuthSnapshot(_ snapshot: SharedAuthSnapshot) {
        guard let defaults = sharedDefaults(),
              let data = try? JSONEncoder().encode(snapshot) else {
            return
        }
        defaults.set(data, forKey: Keys.authSnapshot)
    }

    static func loadAuthSnapshot() -> SharedAuthSnapshot? {
        guard let defaults = sharedDefaults(),
              let data = defaults.data(forKey: Keys.authSnapshot),
              let snapshot = try? JSONDecoder().decode(SharedAuthSnapshot.self, from: data) else {
            return nil
        }
        return snapshot
    }

    static func clearAuthSnapshot() {
        sharedDefaults()?.removeObject(forKey: Keys.authSnapshot)
    }

    static func saveImportEvent(_ event: SharedImportEvent) {
        guard let defaults = sharedDefaults(),
              let data = try? JSONEncoder().encode(event) else {
            return
        }
        defaults.set(data, forKey: Keys.lastImportEvent)
    }

    static func consumeImportEvent() -> SharedImportEvent? {
        guard let defaults = sharedDefaults(),
              let data = defaults.data(forKey: Keys.lastImportEvent),
              let event = try? JSONDecoder().decode(SharedImportEvent.self, from: data) else {
            return nil
        }

        defaults.removeObject(forKey: Keys.lastImportEvent)
        return event
    }
}
