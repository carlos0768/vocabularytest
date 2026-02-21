import SwiftUI

struct AppBackground: View {
    var body: some View {
        MerkenTheme.meshGradient
            .ignoresSafeArea()
    }
}

extension MerkenTheme {
    /// Pre-built static mesh gradient – no blur, no overlay, zero per-frame cost.
    static let meshGradient: some View = MeshGradient(
        width: 3, height: 3,
        points: [
            [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
            [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
            [0.0, 1.0], [0.5, 1.0], [1.0, 1.0]
        ],
        colors: [
            bgTop,                                          // top-left
            bgTop,                                          // top-center
            Color(red: 0.04, green: 0.12, blue: 0.28),     // top-right (subtle blue tint)
            Color(red: 0.02, green: 0.06, blue: 0.14),     // mid-left
            Color(red: 0.05, green: 0.15, blue: 0.30),     // center (accent glow)
            bgBottom,                                       // mid-right
            Color(red: 0.02, green: 0.08, blue: 0.12),     // bottom-left (subtle green tint)
            bgBottom,                                       // bottom-center
            bgBottom                                        // bottom-right
        ]
    )
}
