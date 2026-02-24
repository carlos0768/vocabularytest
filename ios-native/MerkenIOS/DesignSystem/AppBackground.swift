import SwiftUI

struct AppBackground: View {
    var body: some View {
        MerkenTheme.background
            .overlay {
                DotPattern()
            }
            .ignoresSafeArea()
    }
}

/// Dot pattern matching Web版 `bg-dot-pattern` (16px grid, small gray dots)
private struct DotPattern: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Canvas { context, size in
            let spacing: CGFloat = 16
            let dotRadius: CGFloat = 1.0
            // Web: light #6b7280, dark #1a1e23
            let color: Color = colorScheme == .dark
                ? Color(red: 0.10, green: 0.12, blue: 0.14)
                : Color(red: 0.42, green: 0.45, blue: 0.50)

            for x in stride(from: CGFloat(0), through: size.width, by: spacing) {
                for y in stride(from: CGFloat(0), through: size.height, by: spacing) {
                    let rect = CGRect(
                        x: x - dotRadius,
                        y: y - dotRadius,
                        width: dotRadius * 2,
                        height: dotRadius * 2
                    )
                    context.fill(Circle().path(in: rect), with: .color(color))
                }
            }
        }
        .allowsHitTesting(false)
    }
}
