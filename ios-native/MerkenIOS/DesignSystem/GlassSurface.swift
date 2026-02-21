import SwiftUI

// MARK: - Solid Card (Web版の border-2 + border-b-4 3Dカード)

struct SolidCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(MerkenTheme.border, lineWidth: 2)
            )
            .shadow(color: MerkenTheme.border.opacity(0.5), radius: 0, x: 0, y: 2)
    }
}

struct SolidPane<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = 14

    init(cornerRadius: CGFloat = 14, @ViewBuilder content: () -> Content) {
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        content
            .padding(12)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
            )
            .shadow(color: MerkenTheme.border.opacity(0.3), radius: 0, x: 0, y: 1)
    }
}

// MARK: - Backward compatibility typealiases

typealias GlassCard = SolidCard
typealias GlassPane = SolidPane

// MARK: - Button Styles

struct PrimaryGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(
                MerkenTheme.accentBlue,
                in: .rect(cornerRadius: 16)
            )
            .overlay(alignment: .bottom) {
                UnevenRoundedRectangle(bottomLeadingRadius: 16, bottomTrailingRadius: 16)
                    .fill(MerkenTheme.accentBlueStrong)
                    .frame(height: 3)
            }
            .clipShape(.rect(cornerRadius: 16))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

struct GhostGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(MerkenTheme.secondaryText)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(MerkenTheme.surface, in: .capsule)
            .overlay(
                Capsule().stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .shadow(color: MerkenTheme.border.opacity(0.3), radius: 0, x: 0, y: 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Solid TextField Style

struct SolidTextField: ViewModifier {
    var cornerRadius: CGFloat = 12

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
            )
    }
}

extension View {
    func solidTextField(cornerRadius: CGFloat = 12) -> some View {
        modifier(SolidTextField(cornerRadius: cornerRadius))
    }
}
