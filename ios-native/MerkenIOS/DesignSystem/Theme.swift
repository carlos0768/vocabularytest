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

// MARK: - MerkenTheme — Charcoal × Electric Lime

enum MerkenTheme {
    // Backgrounds
    static let background = Color("ThemeBackground")
    static let surface = Color("ThemeSurface")
    static let surfaceAlt = Color("ThemeSurfaceAlt")

    // Borders
    static let border = Color("ThemeBorder")
    static let borderLight = Color("ThemeBorderLight")

    // Accent — Electric Lime (light vs dark adaptive)
    static let accentBlue = Color(red: 0.486, green: 0.710, blue: 0.094)        // #7CB518
    static let accentBlueStrong = Color(red: 0.353, green: 0.541, blue: 0.059)   // #5A8A0F
    static let accentBlueLight = Color(red: 0.706, green: 0.890, blue: 0.239).opacity(0.1) // #B4E33D

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

    // Placeholder thumbnail colors — Charcoal/Lime monochrome palette
    static let thumbnailColors: [Color] = [
        Color(red: 0.486, green: 0.710, blue: 0.094),  // lime
        Color(red: 0.240, green: 0.240, blue: 0.240),  // charcoal
        Color(red: 0.706, green: 0.890, blue: 0.239),  // bright lime
        Color(red: 0.333, green: 0.333, blue: 0.333),  // dark gray
        Color(red: 0.420, green: 0.557, blue: 0.137),  // olive
        Color(red: 0.290, green: 0.290, blue: 0.290),  // medium gray
        Color(red: 0.604, green: 0.804, blue: 0.196),  // yellow-green
        Color(red: 0.180, green: 0.180, blue: 0.180),  // near black
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
