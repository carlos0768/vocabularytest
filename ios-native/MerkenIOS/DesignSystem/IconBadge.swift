import SwiftUI

/// Reusable icon badge: colored icon inside a tinted circle.
/// Web版のカラー丸アイコンバッジを再現。
struct IconBadge: View {
    let systemName: String
    let color: Color
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.42, weight: .medium))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.12), in: .circle)
    }
}
