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

// MARK: - Solid compatibility wrappers

struct SolidCard<Content: View>: View {
    let content: Content
    let cardPadding: CGFloat
    let bordered: Bool
    let cornerRadius: CGFloat

    init(
        padding: CGFloat = 16,
        bordered: Bool = true,
        cornerRadius: CGFloat = 18,
        @ViewBuilder content: () -> Content
    ) {
        self.cardPadding = padding
        self.bordered = bordered
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        SolidSurface(
            tone: .surface,
            depth: bordered ? .standard : .flat,
            cornerRadius: cornerRadius,
            padding: cardPadding,
            showsBorder: bordered
        ) {
            content
        }
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
        SolidSurface(
            tone: .surface,
            depth: .small,
            cornerRadius: cornerRadius,
            padding: 12
        ) {
            content
        }
    }
}

// MARK: - Backward compatibility typealiases

typealias GlassCard = SolidCard
typealias GlassPane = SolidPane

// MARK: - Button Styles

struct PrimaryGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        SolidButtonStyle(
            .inverse,
            size: .medium,
            expands: true,
            cornerRadius: 16
        )
        .makeBody(configuration: configuration)
    }
}

struct GhostGlassButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        SolidButtonStyle(
            .surface,
            size: .medium,
            expands: false,
            cornerRadius: 16
        )
        .makeBody(configuration: configuration)
    }
}

// MARK: - Solid TextField Style

struct SolidTextField: ViewModifier {
    var cornerRadius: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .padding(.vertical, 13)
            .solidSurface(
                tone: .surface,
                depth: .flat,
                cornerRadius: cornerRadius
            )
    }
}

// MARK: - Placeholder fields (SwiftUI `prompt` / placeholder follows accent tint; overlay avoids blue)

struct MerkenPlaceholderTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var textInputAutocapitalization: TextInputAutocapitalization = .sentences
    var disableAutocorrection: Bool = false

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(.body)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .allowsHitTesting(false)
            }
            TextField("", text: $text)
                .font(.body)
                .foregroundStyle(MerkenTheme.primaryText)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(textInputAutocapitalization)
                .autocorrectionDisabled(disableAutocorrection)
        }
    }
}

struct MerkenPlaceholderSecureField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(.body)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .allowsHitTesting(false)
            }
            SecureField("", text: $text)
                .font(.body)
                .foregroundStyle(MerkenTheme.primaryText)
        }
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
