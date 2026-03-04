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

// MARK: - MerkenTheme — Deep Navy × Copper

enum MerkenTheme {
    // Backgrounds
    static let background = Color("ThemeBackground")
    static let surface = Color("ThemeSurface")
    static let surfaceAlt = Color("ThemeSurfaceAlt")

    // Borders
    static let border = Color("ThemeBorder")
    static let borderLight = Color("ThemeBorderLight")

    // Accent — Copper
    static let accentBlue = Color(red: 0.784, green: 0.475, blue: 0.255)       // #C87941
    static let accentBlueStrong = Color(red: 0.659, green: 0.388, blue: 0.188)  // #A86330
    static let accentBlueLight = Color(red: 0.784, green: 0.475, blue: 0.255).opacity(0.1)

    // Secondary — Teal
    static let accentTeal = Color(red: 0.180, green: 0.490, blue: 0.549)        // #2E7D8C

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

    // Placeholder thumbnail colors — Navy/Copper palette
    static let thumbnailColors: [Color] = [
        Color(red: 0.784, green: 0.475, blue: 0.255),  // copper
        Color(red: 0.180, green: 0.490, blue: 0.549),  // teal
        Color(red: 0.545, green: 0.435, blue: 0.290),  // warm brown
        Color(red: 0.118, green: 0.302, blue: 0.431),  // deep navy
        Color(red: 0.627, green: 0.322, blue: 0.176),  // sienna
        Color(red: 0.227, green: 0.365, blue: 0.357),  // dark teal
        Color(red: 0.831, green: 0.659, blue: 0.333),  // gold
        Color(red: 0.290, green: 0.427, blue: 0.549),  // slate blue
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
