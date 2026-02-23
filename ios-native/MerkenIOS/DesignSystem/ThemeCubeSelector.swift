import SwiftUI

struct ThemeCubeSelector: View {
    @Binding var mode: ThemeMode

    // The ordered cycle: light → system → dark → light …
    private static let cycle: [ThemeMode] = [.light, .system, .dark]

    private var currentIndex: Int {
        Self.cycle.firstIndex(of: mode) ?? 0
    }

    // X-axis rotation angle for each position
    private var rotationAngle: Double {
        Double(currentIndex) * 90
    }

    private let cubeHeight: CGFloat = 44

    var body: some View {
        HStack(spacing: 0) {
            // Left chevron - go backwards
            Button {
                let prev = (currentIndex - 1 + Self.cycle.count) % Self.cycle.count
                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                    mode = Self.cycle[prev]
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .frame(width: 28, height: cubeHeight)
                    .contentShape(Rectangle())
            }

            // 3D Cube
            ZStack {
                // Front face (current)
                cubeFace(for: mode)
                    .rotation3DEffect(
                        .degrees(0),
                        axis: (x: 1, y: 0, z: 0),
                        perspective: 0.5
                    )
            }
            .frame(height: cubeHeight)
            .frame(maxWidth: .infinity)
            .rotation3DEffect(
                .degrees(-rotationAngle),
                axis: (x: 1, y: 0, z: 0),
                perspective: 0.5
            )
            .clipped()
            .onTapGesture {
                let next = (currentIndex + 1) % Self.cycle.count
                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                    mode = Self.cycle[next]
                }
            }

            // Right chevron - go forwards
            Button {
                let next = (currentIndex + 1) % Self.cycle.count
                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                    mode = Self.cycle[next]
                }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .frame(width: 28, height: cubeHeight)
                    .contentShape(Rectangle())
            }
        }
        .frame(width: 200)
    }

    @ViewBuilder
    private func cubeFace(for themeMode: ThemeMode) -> some View {
        HStack(spacing: 6) {
            Image(systemName: themeMode.iconName)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(themeMode.iconColor)
                .symbolEffect(.bounce, value: mode)

            Text(themeMode.label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(MerkenTheme.primaryText)
        }
        .frame(maxWidth: .infinity)
        .frame(height: cubeHeight)
        .background(themeMode.faceBackground, in: .rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(themeMode.faceBorderColor, lineWidth: 1)
        )
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

    var faceBackground: Color {
        switch self {
        case .light: return Color(red: 1, green: 1, blue: 1).opacity(0.9)
        case .dark: return Color(red: 0.12, green: 0.13, blue: 0.17).opacity(0.9)
        case .system: return Color(red: 0.55, green: 0.55, blue: 0.58).opacity(0.15)
        }
    }

    var faceBorderColor: Color {
        switch self {
        case .light: return Color(red: 0.9, green: 0.9, blue: 0.9)
        case .dark: return Color(red: 0.25, green: 0.25, blue: 0.3)
        case .system: return MerkenTheme.borderLight
        }
    }
}
