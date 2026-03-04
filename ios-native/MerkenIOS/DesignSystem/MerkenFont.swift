import SwiftUI

/// Merken typography system — Navy × Copper theme
/// Uses serif design for headings (classic, premium feel) and default for body
enum MerkenFont {
    // MARK: - Display / Headings (serif for elegance)

    /// Large title — hero sections, main headings
    static let largeTitle = Font.system(size: 34, weight: .bold, design: .serif)

    /// Title — section headings
    static let title = Font.system(size: 28, weight: .bold, design: .serif)

    /// Title 2 — sub-section headings
    static let title2 = Font.system(size: 22, weight: .semibold, design: .serif)

    /// Title 3 — card titles, list headers
    static let title3 = Font.system(size: 20, weight: .semibold, design: .serif)

    /// Headline — emphasized inline text
    static let headline = Font.system(size: 17, weight: .semibold, design: .serif)

    // MARK: - Body (default design for readability)

    /// Body — main content text
    static let body = Font.system(size: 17, weight: .regular, design: .default)

    /// Body medium — slightly emphasized body
    static let bodyMedium = Font.system(size: 17, weight: .medium, design: .default)

    /// Body bold
    static let bodyBold = Font.system(size: 17, weight: .bold, design: .default)

    /// Subheadline
    static let subheadline = Font.system(size: 15, weight: .regular, design: .default)

    /// Subheadline medium
    static let subheadlineMedium = Font.system(size: 15, weight: .medium, design: .default)

    /// Caption
    static let caption = Font.system(size: 12, weight: .regular, design: .default)

    /// Caption medium
    static let captionMedium = Font.system(size: 12, weight: .medium, design: .default)

    // MARK: - Special

    /// Monospace — for counts, numbers
    static let mono = Font.system(size: 17, weight: .medium, design: .monospaced)

    /// Small mono — for stats
    static let monoSmall = Font.system(size: 13, weight: .medium, design: .monospaced)

    // MARK: - Word display (vocabulary-specific)

    /// English word display — large, serif, premium
    static let wordEnglish = Font.system(size: 24, weight: .bold, design: .serif)

    /// Japanese translation
    static let wordJapanese = Font.system(size: 18, weight: .medium, design: .default)
}
