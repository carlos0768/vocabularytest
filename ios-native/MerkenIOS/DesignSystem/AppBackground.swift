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
            // Light: original iOS color, Dark: Web版 #181c22
            let color: Color = colorScheme == .dark
                ? Color(red: 0.094, green: 0.110, blue: 0.133)
                : Color(red: 0.80, green: 0.82, blue: 0.86)

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
