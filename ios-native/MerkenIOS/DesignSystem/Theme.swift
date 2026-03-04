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

    // Accent — Stitch Blue (matches web main)
    static let accentBlue = Color(red: 0.075, green: 0.498, blue: 0.925)  // #137fec
    static let accentBlueStrong = Color(red: 0.051, green: 0.431, blue: 0.800)  // #0d6ecc
    static let accentBlueLight = Color(red: 0.075, green: 0.498, blue: 0.925).opacity(0.1)

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

    // Placeholder thumbnail colors — blue-based palette (matches Stitch Blue)
    static let thumbnailColors: [Color] = [
        Color(red: 0.075, green: 0.498, blue: 0.925),  // stitch blue
        Color(red: 0.180, green: 0.400, blue: 0.750),  // medium blue
        Color(red: 0.100, green: 0.350, blue: 0.650),  // deep blue
        Color(red: 0.300, green: 0.500, blue: 0.800),  // sky blue
        Color(red: 0.051, green: 0.431, blue: 0.800),  // primary dark
        Color(red: 0.200, green: 0.450, blue: 0.700),  // slate blue
        Color(red: 0.133, green: 0.545, blue: 0.133),  // green accent
        Color(red: 0.400, green: 0.300, blue: 0.700),  // purple accent
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
