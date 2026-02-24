import SwiftUI

struct ThemeCubeSelector: View {
    @Binding var mode: ThemeMode

    private static let allModes: [ThemeMode] = [.system, .light, .dark]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Self.allModes, id: \.self) { themeMode in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        mode = themeMode
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: themeMode.iconName)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(mode == themeMode ? themeMode.iconColor : MerkenTheme.mutedText)

                        Text(themeMode.label)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(mode == themeMode ? MerkenTheme.primaryText : MerkenTheme.mutedText)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .background(
                        mode == themeMode
                            ? themeMode.selectedBackground
                            : Color.clear,
                        in: .rect(cornerRadius: 8)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(
                                mode == themeMode ? themeMode.selectedBorderColor : Color.clear,
                                lineWidth: 1
                            )
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(MerkenTheme.surfaceAlt.opacity(0.6), in: .rect(cornerRadius: 10))
    }
}

// MARK: - ThemeMode face styling

private extension ThemeMode {
    var iconName: String {
        switch self {
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        case .system: return "circle.lefthalf.filled"
        }
    }

    var iconColor: Color {
        switch self {
        case .light: return .orange
        case .dark: return .yellow
        case .system: return MerkenTheme.accentBlue
        }
    }

    var selectedBackground: Color {
        switch self {
        case .light: return Color(red: 1, green: 1, blue: 1).opacity(0.9)
        case .dark: return Color(red: 0.12, green: 0.13, blue: 0.17).opacity(0.9)
        case .system: return Color(red: 0.55, green: 0.55, blue: 0.58).opacity(0.15)
        }
    }

    var selectedBorderColor: Color {
        switch self {
        case .light: return Color(red: 0.9, green: 0.9, blue: 0.9)
        case .dark: return Color(red: 0.25, green: 0.25, blue: 0.3)
        case .system: return MerkenTheme.borderLight
        }
    }
}
