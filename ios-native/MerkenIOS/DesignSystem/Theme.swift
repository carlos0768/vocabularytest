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

    // Accent — deep teal (stationery/ink feel)
    static let accentBlue = Color(red: 0.176, green: 0.416, blue: 0.310)  // #2D6A4F
    static let accentBlueStrong = Color(red: 0.133, green: 0.353, blue: 0.259)  // #225A42
    static let accentBlueLight = Color(red: 0.176, green: 0.416, blue: 0.310).opacity(0.1)

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

    // Placeholder thumbnail colors — warm, muted tones (stationery palette)
    static let thumbnailColors: [Color] = [
        Color(red: 0.176, green: 0.416, blue: 0.310),  // teal
        Color(red: 0.545, green: 0.231, blue: 0.231),  // brick red
        Color(red: 0.380, green: 0.318, blue: 0.224),  // olive brown
        Color(red: 0.420, green: 0.290, blue: 0.520),  // muted purple
        Color(red: 0.220, green: 0.420, blue: 0.400),  // dark cyan
        Color(red: 0.600, green: 0.400, blue: 0.180),  // amber
        Color(red: 0.310, green: 0.460, blue: 0.290),  // sage
        Color(red: 0.470, green: 0.350, blue: 0.280),  // warm brown
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
