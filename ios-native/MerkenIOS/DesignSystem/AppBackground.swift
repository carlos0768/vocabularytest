import SwiftUI

struct AppBackground: View {
    var body: some View {
        MerkenTheme.background
            .overlay {
                GridPattern()
            }
            .ignoresSafeArea()
    }
}

/// Graph-paper grid pattern — faint ruled lines
private struct GridPattern: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Canvas { context, size in
            let spacing: CGFloat = 20
            let lineWidth: CGFloat = 0.5
            let color: Color = colorScheme == .dark
                ? Color(red: 0.08, green: 0.14, blue: 0.24)   // dark navy grid
                : Color(red: 0.82, green: 0.78, blue: 0.72)   // warm light grid

            // Vertical lines
            for x in stride(from: CGFloat(0), through: size.width, by: spacing) {
                let path = Path { p in
                    p.move(to: CGPoint(x: x, y: 0))
                    p.addLine(to: CGPoint(x: x, y: size.height))
                }
                context.stroke(path, with: .color(color), lineWidth: lineWidth)
            }

            // Horizontal lines
            for y in stride(from: CGFloat(0), through: size.height, by: spacing) {
                let path = Path { p in
                    p.move(to: CGPoint(x: 0, y: y))
                    p.addLine(to: CGPoint(x: size.width, y: y))
                }
                context.stroke(path, with: .color(color), lineWidth: lineWidth)
            }
        }
        .allowsHitTesting(false)
    }
}
