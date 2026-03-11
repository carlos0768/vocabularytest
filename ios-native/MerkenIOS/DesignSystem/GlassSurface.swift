import SwiftUI

struct TopSafeAreaScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct CameraAreaGlassOverlay: View {
    let safeAreaTop: CGFloat
    let scrollOffset: CGFloat

    private var progress: CGFloat {
        let scrolledDistance = max(-scrollOffset, 0)
        return min(scrolledDistance / 18, 1)
    }

    var body: some View {
        glassBackground
            .opacity(progress)
            .offset(y: -safeAreaTop)
            .allowsHitTesting(false)
            .animation(.easeOut(duration: 0.18), value: progress)
    }

    @ViewBuilder
    private var glassBackground: some View {
        let glassLayer = Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: safeAreaTop)
            .clipShape(Rectangle())

        if #available(iOS 26.0, *) {
            glassLayer
                .glassEffect(.regular.tint(Color.white.opacity(0.20)))
        } else {
            glassLayer
                .background(.ultraThinMaterial)
        }
    }
}

// MARK: - Solid Card (Web版の border-2 + border-b-4 3Dカード)

struct SolidCard<Content: View>: View {
    let content: Content
    let cardPadding: CGFloat

    init(padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.cardPadding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
    }
}

struct SolidPane<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = 18

    init(cornerRadius: CGFloat = 18, @ViewBuilder content: () -> Content) {
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
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(MerkenTheme.border)
                    .offset(y: 2)
            )
    }
}

// MARK: - Backward compatibility typealiases

typealias GlassCard = SolidCard
typealias GlassPane = SolidPane

// MARK: - Button Styles

struct PrimaryGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(
                MerkenTheme.accentBlue,
                in: .rect(cornerRadius: 20)
            )
            .overlay(alignment: .bottom) {
                UnevenRoundedRectangle(bottomLeadingRadius: 20, bottomTrailingRadius: 20)
                    .fill(MerkenTheme.accentBlueStrong)
                    .frame(height: 3)
            }
            .clipShape(.rect(cornerRadius: 20))
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
            .background(
                Capsule().fill(MerkenTheme.border).offset(y: 1)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Solid TextField Style

struct SolidTextField: ViewModifier {
    var cornerRadius: CGFloat = 16

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
    func solidTextField(cornerRadius: CGFloat = 16) -> some View {
        modifier(SolidTextField(cornerRadius: cornerRadius))
    }

    @ViewBuilder
    func disableTopScrollEdgeEffectIfAvailable() -> some View {
        if #available(iOS 26.0, *) {
            self.scrollEdgeEffectStyle(.none, for: .top)
        } else {
            self
        }
    }

    func cameraAreaGlassOverlay(scrollOffset: CGFloat) -> some View {
        overlay(alignment: .top) {
            GeometryReader { geometry in
                CameraAreaGlassOverlay(
                    safeAreaTop: geometry.safeAreaInsets.top,
                    scrollOffset: scrollOffset
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .ignoresSafeArea()
        }
    }

    /// Web版の sticky header スタイル: 半透明背景 + 下辺ボーダー
    func stickyHeaderStyle() -> some View {
        self
            .background(MerkenTheme.background.opacity(0.95))
            .overlay(alignment: .bottom) {
                MerkenTheme.borderLight
                    .frame(height: 1)
            }
    }
}
