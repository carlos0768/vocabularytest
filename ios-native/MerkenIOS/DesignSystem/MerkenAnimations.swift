import SwiftUI

// MARK: - Merken Animation Language
// All motion uses spring physics. No linear or easeInOut.
// This file defines the app-wide animation constants.

enum MerkenSpring {
    /// Gentle, relaxed — page transitions, large elements
    static let gentle = Animation.spring(response: 0.5, dampingFraction: 0.82)
    /// Snappy, responsive — card flips, toggles
    static let snappy = Animation.spring(response: 0.35, dampingFraction: 0.78)
    /// Bouncy, playful — favorites, celebrations
    static let bouncy = Animation.spring(response: 0.4, dampingFraction: 0.6)
    /// Quick tap feedback — buttons, icons
    static let tap = Animation.spring(response: 0.25, dampingFraction: 0.7)
    /// Card flip — weighted, satisfying
    static let flip = Animation.spring(response: 0.45, dampingFraction: 0.75)
}

// MARK: - Stagger Helper

extension View {
    /// Apply a stagger delay based on index for sequential reveal
    func staggerIn(index: Int, isVisible: Bool) -> some View {
        self
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : 12)
            .animation(
                MerkenSpring.gentle.delay(Double(index) * 0.08),
                value: isVisible
            )
    }
}

// MARK: - Haptics

enum MerkenHaptic {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
