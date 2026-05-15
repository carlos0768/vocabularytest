import SwiftUI

enum MerkenSolid {
    static let borderWidth: CGFloat = 1.25
    static let radius: CGFloat = 20
    static let radiusSmall: CGFloat = 12
    static let radiusTile: CGFloat = 12
    static let standardOffset = CGSize(width: 3, height: 4)
    static let smallOffset = CGSize(width: 2, height: 2)
    static let pressedOffset = CGSize(width: 1, height: 1)
    static let pressedTranslation = CGSize(width: 1, height: 1)
}

enum SolidTone {
    case surface
    case surfaceAlt
    case paper
    case inverse
    case accent
    case success
    case warning
    case danger
    case muted

    var fill: Color {
        switch self {
        case .surface:
            return MerkenTheme.surface
        case .surfaceAlt:
            return MerkenTheme.surfaceAlt
        case .paper:
            return MerkenTheme.notebookPaper
        case .inverse:
            return MerkenTheme.solidInk
        case .accent:
            return MerkenTheme.accentGreen
        case .success:
            return MerkenTheme.successLight
        case .warning:
            return MerkenTheme.warningLight
        case .danger:
            return MerkenTheme.dangerLight
        case .muted:
            return MerkenTheme.borderLight
        }
    }

    var foreground: Color {
        switch self {
        case .inverse:
            return MerkenTheme.inverseText
        case .accent:
            return .white
        case .success:
            return MerkenTheme.success
        case .warning:
            return MerkenTheme.warning
        case .danger:
            return MerkenTheme.danger
        case .muted:
            return MerkenTheme.secondaryText
        case .surface, .surfaceAlt, .paper:
            return MerkenTheme.solidInk
        }
    }

    var border: Color {
        switch self {
        case .accent:
            return MerkenTheme.accentGreenInk
        case .success:
            return MerkenTheme.success
        case .warning:
            return MerkenTheme.warning
        case .danger:
            return MerkenTheme.danger
        default:
            return MerkenTheme.solidBorder
        }
    }

    var shadow: Color {
        MerkenTheme.solidShadow
    }
}

enum SolidDepth {
    case flat
    case small
    case standard
    case tile

    var offset: CGSize {
        switch self {
        case .flat:
            return .zero
        case .small, .tile:
            return MerkenSolid.smallOffset
        case .standard:
            return MerkenSolid.standardOffset
        }
    }

    var showsShadow: Bool {
        switch self {
        case .flat:
            return false
        case .small, .standard, .tile:
            return true
        }
    }
}

enum SolidControlSize {
    case small
    case medium
    case large
    case icon(CGFloat)

    var font: Font {
        switch self {
        case .small:
            return .system(size: 13, weight: .bold)
        case .medium:
            return .system(size: 15, weight: .bold)
        case .large:
            return .system(size: 16, weight: .bold)
        case .icon:
            return .system(size: 15, weight: .bold)
        }
    }

    var horizontalPadding: CGFloat {
        switch self {
        case .small:
            return 12
        case .medium:
            return 18
        case .large:
            return 24
        case .icon:
            return 0
        }
    }

    var verticalPadding: CGFloat {
        switch self {
        case .small:
            return 8
        case .medium:
            return 12
        case .large:
            return 15
        case .icon:
            return 0
        }
    }

    var iconFrame: CGFloat? {
        if case .icon(let size) = self {
            return size
        }
        return nil
    }
}

struct SolidSurface<Content: View>: View {
    let tone: SolidTone
    let depth: SolidDepth
    let cornerRadius: CGFloat
    let borderColor: Color?
    let shadowColor: Color?
    let shadowOffset: CGSize?
    let padding: CGFloat
    let alignment: Alignment
    let showsBorder: Bool
    let clipsToBounds: Bool
    let content: Content

    init(
        tone: SolidTone = .surface,
        depth: SolidDepth = .standard,
        cornerRadius: CGFloat = MerkenSolid.radius,
        borderColor: Color? = nil,
        shadowColor: Color? = nil,
        shadowOffset: CGSize? = nil,
        padding: CGFloat = 16,
        alignment: Alignment = .leading,
        showsBorder: Bool = true,
        clipsToBounds: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.tone = tone
        self.depth = depth
        self.cornerRadius = cornerRadius
        self.borderColor = borderColor
        self.shadowColor = shadowColor
        self.shadowOffset = shadowOffset
        self.padding = padding
        self.alignment = alignment
        self.showsBorder = showsBorder
        self.clipsToBounds = clipsToBounds
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: alignment)
            .solidSurface(
                tone: tone,
                depth: depth,
                cornerRadius: cornerRadius,
                borderColor: borderColor,
                shadowColor: shadowColor,
                shadowOffset: shadowOffset,
                showsBorder: showsBorder,
                clipsToBounds: clipsToBounds
            )
    }
}

private struct SolidSurfaceModifier: ViewModifier {
    let tone: SolidTone
    let depth: SolidDepth
    let cornerRadius: CGFloat
    let borderColor: Color?
    let shadowColor: Color?
    let shadowOffset: CGSize?
    let isPressed: Bool
    let showsBorder: Bool
    let clipsToBounds: Bool

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        let resolvedOffset = shadowOffset ?? depth.offset
        let offset = isPressed ? MerkenSolid.pressedOffset : resolvedOffset
        let hasShadow = shadowOffset.map { $0 != .zero } ?? depth.showsShadow
        let shadowOpacity: CGFloat = hasShadow && showsBorder ? 1 : 0

        let decorated = content
            .background(tone.fill, in: shape)
            .overlay(
                shape.stroke(
                    showsBorder ? (borderColor ?? tone.border) : .clear,
                    lineWidth: showsBorder ? MerkenSolid.borderWidth : 0
                )
            )
            .background(
                shape
                    .fill(shadowColor ?? tone.shadow)
                    .offset(x: offset.width, y: offset.height)
                    .opacity(shadowOpacity)
            )
            .offset(
                x: isPressed ? MerkenSolid.pressedTranslation.width : 0,
                y: isPressed ? MerkenSolid.pressedTranslation.height : 0
            )

        Group {
            if clipsToBounds {
                decorated.clipShape(shape)
            } else {
                decorated
            }
        }
    }
}

private struct SolidButtonBody<Label: View>: View {
    @Environment(\.isEnabled) private var isEnabled

    let label: Label
    let isPressed: Bool
    let tone: SolidTone
    let size: SolidControlSize
    let expands: Bool
    let cornerRadius: CGFloat

    var body: some View {
        label
            .font(size.font)
            .foregroundStyle(isEnabled ? tone.foreground : MerkenTheme.mutedText)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .frame(width: size.iconFrame, height: size.iconFrame)
            .frame(maxWidth: expands ? .infinity : nil)
            .solidSurface(
                tone: isEnabled ? tone : .muted,
                depth: .small,
                cornerRadius: cornerRadius,
                isPressed: isPressed && isEnabled
            )
            .opacity(isEnabled ? 1 : 0.55)
    }
}

struct SolidButtonStyle: ButtonStyle {
    let tone: SolidTone
    let size: SolidControlSize
    let expands: Bool
    let cornerRadius: CGFloat

    init(
        _ tone: SolidTone = .surface,
        size: SolidControlSize = .medium,
        expands: Bool = false,
        cornerRadius: CGFloat = MerkenSolid.radiusSmall
    ) {
        self.tone = tone
        self.size = size
        self.expands = expands
        self.cornerRadius = cornerRadius
    }

    func makeBody(configuration: Configuration) -> some View {
        SolidButtonBody(
            label: configuration.label,
            isPressed: configuration.isPressed,
            tone: tone,
            size: size,
            expands: expands,
            cornerRadius: cornerRadius
        )
    }
}

struct SolidIconButton: View {
    let systemImage: String
    let foreground: Color
    let background: Color
    let size: CGFloat
    let action: () -> Void

    init(
        systemImage: String,
        foreground: Color = MerkenTheme.solidInk,
        background: Color = MerkenTheme.surface,
        size: CGFloat = 40,
        action: @escaping () -> Void
    ) {
        self.systemImage = systemImage
        self.foreground = foreground
        self.background = background
        self.size = size
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: size, height: size)
        }
        .buttonStyle(
            SolidIconButtonStyle(
                foreground: foreground,
                background: background,
                size: size
            )
        )
    }
}

private struct SolidIconButtonStyle: ButtonStyle {
    let foreground: Color
    let background: Color
    let size: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background(background, in: .circle)
            .overlay(Circle().stroke(MerkenTheme.solidBorder, lineWidth: MerkenSolid.borderWidth))
            .background(
                Circle()
                    .fill(MerkenTheme.solidShadow)
                    .offset(
                        x: configuration.isPressed ? MerkenSolid.pressedOffset.width : MerkenSolid.smallOffset.width,
                        y: configuration.isPressed ? MerkenSolid.pressedOffset.height : MerkenSolid.smallOffset.height
                    )
            )
            .offset(
                x: configuration.isPressed ? MerkenSolid.pressedTranslation.width : 0,
                y: configuration.isPressed ? MerkenSolid.pressedTranslation.height : 0
            )
    }
}

struct SolidChip: View {
    let title: String
    let count: Int?
    let systemImage: String?
    let isSelected: Bool
    let action: () -> Void

    init(
        title: String,
        count: Int? = nil,
        systemImage: String? = nil,
        isSelected: Bool,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.count = count
        self.systemImage = systemImage
        self.isSelected = isSelected
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 12, weight: .black))
                }
                Text(title)
                if let count {
                    Text("\(count)")
                        .monospacedDigit()
                }
            }
            .lineLimit(1)
        }
        .buttonStyle(
            SolidButtonStyle(
                isSelected ? .inverse : .surface,
                size: .small,
                cornerRadius: 18
            )
        )
    }
}

struct SolidPageHeader<Trailing: View>: View {
    let kicker: String
    let title: String
    let subtitle: String?
    let trailing: Trailing

    init(
        kicker: String,
        title: String,
        subtitle: String? = nil,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) {
        self.kicker = kicker
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(kicker)
                        .font(.system(size: 11, weight: .black, design: .monospaced))
                        .tracking(1.5)
                        .foregroundStyle(MerkenTheme.accentGreen)

                    Text(title)
                        .font(.system(size: 30, weight: .black))
                        .foregroundStyle(MerkenTheme.solidInk)
                        .lineLimit(2)
                        .minimumScaleFactor(0.74)
                }

                Spacer(minLength: 8)

                trailing
            }

            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineSpacing(3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SolidMetricTile: View {
    let value: String
    let label: String
    let tint: Color
    var systemImage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(tint)
            }

            Text(value)
                .font(.system(size: 24, weight: .black))
                .monospacedDigit()
                .foregroundStyle(MerkenTheme.solidInk)
                .lineLimit(1)
                .minimumScaleFactor(0.68)

            Text(label)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.76)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .solidSurface(
            tone: .surface,
            depth: .small,
            cornerRadius: 16
        )
    }
}

struct SolidSectionTitle: View {
    let kicker: String?
    let title: String
    let count: Int?

    init(_ title: String, kicker: String? = nil, count: Int? = nil) {
        self.title = title
        self.kicker = kicker
        self.count = count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let kicker {
                Text(kicker)
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(MerkenTheme.accentGreen)
            }

            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(title)
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)

                if let count {
                    Text("\(count)")
                        .font(.system(size: 13, weight: .black))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
    }
}

struct SolidEmptyState<Action: View>: View {
    let icon: String
    let title: String
    let message: String
    let action: Action

    init(
        icon: String,
        title: String,
        message: String,
        @ViewBuilder action: () -> Action = { EmptyView() }
    ) {
        self.icon = icon
        self.title = title
        self.message = message
        self.action = action()
    }

    var body: some View {
        SolidSurface(padding: 24, alignment: .center) {
            VStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 28, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .frame(width: 58, height: 58)
                    .solidSurface(
                        tone: .surfaceAlt,
                        depth: .small,
                        cornerRadius: 18
                    )

                VStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text(message)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                }

                action
            }
            .frame(maxWidth: .infinity)
        }
    }
}

extension View {
    func solidSurface(
        tone: SolidTone = .surface,
        depth: SolidDepth = .standard,
        cornerRadius: CGFloat = MerkenSolid.radius,
        borderColor: Color? = nil,
        shadowColor: Color? = nil,
        shadowOffset: CGSize? = nil,
        isPressed: Bool = false,
        showsBorder: Bool = true,
        clipsToBounds: Bool = false
    ) -> some View {
        modifier(
            SolidSurfaceModifier(
                tone: tone,
                depth: depth,
                cornerRadius: cornerRadius,
                borderColor: borderColor,
                shadowColor: shadowColor,
                shadowOffset: shadowOffset,
                isPressed: isPressed,
                showsBorder: showsBorder,
                clipsToBounds: clipsToBounds
            )
        )
    }

    func solidPagePadding(bottom: CGFloat = 110) -> some View {
        padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, bottom)
    }
}
