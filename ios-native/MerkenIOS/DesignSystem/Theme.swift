import SwiftUI
import UIKit

// MARK: - Theme Mode

enum ThemeMode: String, CaseIterable, Sendable {
    case light = "light"
    case dark = "dark"
    case system = "system"

    var label: String {
        switch self {
        case .light: return "ライト"
        case .dark: return "ダーク"
        case .system: return "システム"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }
}

@MainActor
final class ThemeManager: ObservableObject {
    @AppStorage("themeMode") var themeMode: String = ThemeMode.system.rawValue

    var mode: ThemeMode {
        get { ThemeMode(rawValue: themeMode) ?? .system }
        set { themeMode = newValue.rawValue; objectWillChange.send() }
    }

    var preferredColorScheme: ColorScheme? {
        mode.colorScheme
    }
}

// MARK: - MerkenTheme (adaptive colors)

enum MerkenTheme {
    private static func uiColor(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat, _ alpha: CGFloat = 1) -> UIColor {
        UIColor(red: red, green: green, blue: blue, alpha: alpha)
    }

    private static func adaptiveColor(light: UIColor, dark: UIColor) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    // Backgrounds
    static let background = Color("ThemeBackground")
    static let surface = Color("ThemeSurface")
    static let surfaceAlt = Color("ThemeSurfaceAlt")

    // Borders
    static let border = Color("ThemeBorder")
    static let borderLight = Color("ThemeBorderLight")

    // Accent — Web solid ink, adapted for dark mode
    static let solidInk = adaptiveColor(
        light: uiColor(0.10, 0.10, 0.10),
        dark: uiColor(0.94, 0.95, 0.96)
    )
    static let solidBorder = adaptiveColor(
        light: uiColor(0.10, 0.10, 0.10),
        dark: uiColor(0.78, 0.82, 0.88)
    )
    static let solidShadow = adaptiveColor(
        light: uiColor(0.10, 0.10, 0.10),
        dark: uiColor(0.02, 0.03, 0.04)
    )
    static let inverseSurface = adaptiveColor(
        light: uiColor(0.10, 0.10, 0.10),
        dark: uiColor(0.94, 0.95, 0.96)
    )
    static let inverseText = adaptiveColor(
        light: uiColor(1, 1, 1),
        dark: uiColor(0.06, 0.07, 0.09)
    )
    static let selectedGlassFill = adaptiveColor(
        light: uiColor(1, 1, 1, 0.36),
        dark: uiColor(1, 1, 1, 0.14)
    )
    static let accentBlue = adaptiveColor(
        light: uiColor(0.10, 0.10, 0.10),
        dark: uiColor(37 / 255, 99 / 255, 235 / 255)
    )
    static let accentBlueStrong = adaptiveColor(
        light: uiColor(0.05, 0.05, 0.05),
        dark: uiColor(29 / 255, 78 / 255, 216 / 255)
    )
    static let accentBlueLight = adaptiveColor(
        light: uiColor(0.10, 0.10, 0.10, 0.10),
        dark: uiColor(37 / 255, 99 / 255, 235 / 255, 0.18)
    )
    static let accentGreen = Color(red: 21 / 255, green: 128 / 255, blue: 61 / 255)  // #15803d
    static let accentGreenInk = adaptiveColor(
        light: uiColor(20 / 255, 83 / 255, 45 / 255),
        dark: uiColor(134 / 255, 239 / 255, 172 / 255)
    )
    static let accentGreenLight = adaptiveColor(
        light: uiColor(220 / 255, 252 / 255, 231 / 255),
        dark: uiColor(12 / 255, 45 / 255, 29 / 255)
    )
    static let paperBackground = adaptiveColor(
        light: uiColor(243 / 255, 240 / 255, 233 / 255),
        dark: uiColor(13 / 255, 15 / 255, 19 / 255)
    )
    static let notebookPaper = adaptiveColor(
        light: uiColor(1.0, 253 / 255, 247 / 255),
        dark: uiColor(23 / 255, 26 / 255, 32 / 255)
    )

    // Chart/Stats accent — original blue for data visualizations
    static let chartBlue = Color(red: 0.075, green: 0.498, blue: 0.925)  // #137fec

    // Status
    static let success = Color(red: 0.13, green: 0.77, blue: 0.37)
    static let successLight = Color(red: 0.13, green: 0.77, blue: 0.37).opacity(0.1)
    /// Aligns with web `--color-warning` fallback `#f59e0b` (Tailwind amber-500)
    static let warning = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
    static let warningLight = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255).opacity(0.1)
    static let danger = Color(red: 0.94, green: 0.35, blue: 0.35)
    static let dangerLight = Color(red: 0.94, green: 0.35, blue: 0.35).opacity(0.1)

    // Text
    static let primaryText = Color("ThemePrimaryText")
    static let secondaryText = Color("ThemeSecondaryText")
    static let mutedText = Color("ThemeMutedText")

    // Placeholder thumbnail colors — colorful palette
    static let thumbnailColors: [Color] = [
        Color(red: 0.075, green: 0.498, blue: 0.925),  // blue
        Color(red: 0.400, green: 0.300, blue: 0.700),  // purple
        Color(red: 0.133, green: 0.545, blue: 0.133),  // green
        Color(red: 0.180, green: 0.400, blue: 0.750),  // medium blue
        Color(red: 0.85, green: 0.45, blue: 0.25),     // orange
        Color(red: 0.200, green: 0.450, blue: 0.700),  // slate blue
        Color(red: 0.80, green: 0.30, blue: 0.35),     // red
        Color(red: 0.24, green: 0.63, blue: 0.72),     // teal
    ]

    static func placeholderColor(for id: String, isDark: Bool = false) -> Color {
        let hash = id.utf8.reduce(0) { $0 &+ Int($1) }
        let color = thumbnailColors[abs(hash) % thumbnailColors.count]
        return isDark ? color.opacity(0.7) : color
    }

    // Legacy compat
    static let bgTop = background
    static let bgBottom = background
}
