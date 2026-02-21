import SwiftUI

enum MerkenTheme {
    // Backgrounds
    static let background = Color(red: 0.96, green: 0.97, blue: 0.98) // #f5f7fa
    static let surface = Color.white
    static let surfaceAlt = Color(red: 0.97, green: 0.97, blue: 0.98)

    // Borders (Web版: border-2 + border-b-4)
    static let border = Color(red: 0.85, green: 0.87, blue: 0.90)      // #d9dee6
    static let borderLight = Color(red: 0.90, green: 0.92, blue: 0.95)

    // Accent
    static let accentBlue = Color(red: 0.08, green: 0.50, blue: 0.93)  // #137fec
    static let accentBlueStrong = Color(red: 0.05, green: 0.42, blue: 0.83)
    static let accentBlueLight = Color(red: 0.08, green: 0.50, blue: 0.93).opacity(0.1)

    // Status
    static let success = Color(red: 0.13, green: 0.77, blue: 0.37)     // #22c55e
    static let successLight = Color(red: 0.13, green: 0.77, blue: 0.37).opacity(0.1)
    static let warning = Color(red: 0.96, green: 0.67, blue: 0.15)
    static let warningLight = Color(red: 0.96, green: 0.67, blue: 0.15).opacity(0.1)
    static let danger = Color(red: 0.94, green: 0.35, blue: 0.35)
    static let dangerLight = Color(red: 0.94, green: 0.35, blue: 0.35).opacity(0.1)

    // Text
    static let primaryText = Color(red: 0.10, green: 0.12, blue: 0.16) // ほぼ黒
    static let secondaryText = Color(red: 0.40, green: 0.43, blue: 0.48)
    static let mutedText = Color(red: 0.55, green: 0.58, blue: 0.63)

    // Legacy compat (dark bg references removed — use background instead)
    static let bgTop = background
    static let bgBottom = background
}
