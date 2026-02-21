import SwiftUI

// MARK: - Glass Surface Components

struct GlassCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 24).fill(.white.opacity(0.08)))
    }
}

struct GlassPane<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = 18

    init(cornerRadius: CGFloat = 18, @ViewBuilder content: () -> Content) {
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        content
            .padding(12)
            .background(RoundedRectangle(cornerRadius: cornerRadius).fill(.white.opacity(0.05)))
    }
}

struct PrimaryGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(configuration.isPressed
                          ? MerkenTheme.accentBlueStrong.opacity(0.6)
                          : MerkenTheme.accentBlue.opacity(0.5))
            )
    }
}

struct GhostGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(.white.opacity(configuration.isPressed ? 0.15 : 0.06))
            )
    }
}
