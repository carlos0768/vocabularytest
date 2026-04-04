import SwiftUI

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
    // Backgrounds
    static let background = Color("ThemeBackground")
    static let surface = Color("ThemeSurface")
    static let surfaceAlt = Color("ThemeSurfaceAlt")

    // Borders
    static let border = Color("ThemeBorder")
    static let borderLight = Color("ThemeBorderLight")

    // Accent — Black
    static let accentBlue = Color(red: 0.10, green: 0.10, blue: 0.10)  // #1a1a1a
    static let accentBlueStrong = Color(red: 0.05, green: 0.05, blue: 0.05)  // #0d0d0d
    static let accentBlueLight = Color(red: 0.10, green: 0.10, blue: 0.10).opacity(0.1)

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
