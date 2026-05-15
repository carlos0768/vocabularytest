import SwiftUI

typealias WebMobilePageHeader<Trailing: View> = SolidPageHeader<Trailing>
typealias WebMobileRoundButton = SolidIconButton
typealias WebMobileMetricTile = SolidMetricTile
typealias WebMobileSectionTitle = SolidSectionTitle

extension View {
    func webSolidCard(
        cornerRadius: CGFloat = 18,
        borderColor: Color = MerkenTheme.solidBorder,
        shadowColor: Color = MerkenTheme.solidShadow,
        shadowOffset: CGSize = MerkenSolid.standardOffset
    ) -> some View {
        solidSurface(
            tone: .surface,
            depth: shadowOffset == .zero ? .flat : .standard,
            cornerRadius: cornerRadius,
            borderColor: borderColor,
            shadowColor: shadowColor,
            shadowOffset: shadowOffset
        )
    }

    func webInsetPage() -> some View {
        solidPagePadding()
    }
}
