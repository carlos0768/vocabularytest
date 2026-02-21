import Foundation

@MainActor
final class GuestSessionStore {
    private enum Keys {
        static let guestUserId = "merken_guest_user_id"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var guestUserId: String {
        if let existing = defaults.string(forKey: Keys.guestUserId), !existing.isEmpty {
            return existing
        }

        let id = "guest_\(UUID().uuidString.lowercased())"
        defaults.set(id, forKey: Keys.guestUserId)
        return id
    }
}
