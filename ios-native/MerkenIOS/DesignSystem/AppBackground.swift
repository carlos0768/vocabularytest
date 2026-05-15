import SwiftUI

struct AppBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if colorScheme == .dark {
                MerkenTheme.background
            } else {
                MerkenTheme.background
            }
        }
        .ignoresSafeArea()
    }
}

struct PaperDotBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        MerkenTheme.paperBackground
            .overlay {
                GeometryReader { geometry in
                    Canvas { context, size in
                        let step: CGFloat = 22
                        let dotSize: CGFloat = 1.4
                        let dotOpacity: CGFloat = colorScheme == .dark ? 0.06 : 0.045
                        var y: CGFloat = 0

                        while y < size.height {
                            var x: CGFloat = 0
                            while x < size.width {
                                let rect = CGRect(
                                    x: x,
                                    y: y,
                                    width: dotSize,
                                    height: dotSize
                                )
                                context.fill(
                                    Path(ellipseIn: rect),
                                    with: .color(MerkenTheme.solidInk.opacity(dotOpacity))
                                )
                                x += step
                            }
                            y += step
                        }
                    }
                    .frame(width: geometry.size.width, height: geometry.size.height)
                }
            }
            .ignoresSafeArea()
    }
}
