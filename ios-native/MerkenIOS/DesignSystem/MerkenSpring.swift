import SwiftUI

/// Centralized spring animation presets
enum MerkenSpring {
    /// Gentle spring for subtle transitions
    static let gentle = Animation.spring(response: 0.5, dampingFraction: 0.8)

    /// Bouncy spring for playful interactions
    static let bouncy = Animation.spring(response: 0.4, dampingFraction: 0.6)

    /// Snappy spring for quick feedback
    static let snappy = Animation.spring(response: 0.3, dampingFraction: 0.7)

    /// Stiff spring for immediate response
    static let stiff = Animation.spring(response: 0.2, dampingFraction: 0.9)
}
