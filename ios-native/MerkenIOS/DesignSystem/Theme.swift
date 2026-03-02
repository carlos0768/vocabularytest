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

    // Accent
    static let accentBlue = Color(red: 0.08, green: 0.50, blue: 0.93)  // #137fec
    static let accentBlueStrong = Color(red: 0.05, green: 0.42, blue: 0.83)
    static let accentBlueLight = Color(red: 0.08, green: 0.50, blue: 0.93).opacity(0.1)

    // Status
    static let success = Color(red: 0.13, green: 0.77, blue: 0.37)
    static let successLight = Color(red: 0.13, green: 0.77, blue: 0.37).opacity(0.1)
    static let warning = Color(red: 0.96, green: 0.67, blue: 0.15)
    static let warningLight = Color(red: 0.96, green: 0.67, blue: 0.15).opacity(0.1)
    static let danger = Color(red: 0.94, green: 0.35, blue: 0.35)
    static let dangerLight = Color(red: 0.94, green: 0.35, blue: 0.35).opacity(0.1)

    // Text
    static let primaryText = Color("ThemePrimaryText")
    static let secondaryText = Color("ThemeSecondaryText")
    static let mutedText = Color("ThemeMutedText")

    // Placeholder thumbnail colors (light mode – vivid)
    static let thumbnailColors: [Color] = [
        Color(red: 0.91, green: 0.30, blue: 0.53),
        Color(red: 0.25, green: 0.47, blue: 0.85),
        Color(red: 0.87, green: 0.28, blue: 0.28),
        Color(red: 0.58, green: 0.35, blue: 0.83),
        Color(red: 0.15, green: 0.68, blue: 0.65),
        Color(red: 0.93, green: 0.55, blue: 0.18),
        Color(red: 0.20, green: 0.70, blue: 0.40),
        Color(red: 0.40, green: 0.55, blue: 0.85),
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
