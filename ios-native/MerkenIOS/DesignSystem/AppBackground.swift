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
    var body: some View {
        Canvas { context, size in
            let spacing: CGFloat = 16
            let dotRadius: CGFloat = 0.8
            let color = Color(red: 0.78, green: 0.80, blue: 0.84) // subtle gray

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
