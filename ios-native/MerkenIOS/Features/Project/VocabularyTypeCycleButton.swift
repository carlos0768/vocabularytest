import SwiftUI

/// Web `VocabularyTypeButton` に相当。`nil → active → passive → nil` でタップごとに循環。
struct VocabularyTypeCycleButton: View {
    let vocabularyType: VocabularyType?
    var isEnabled: Bool = true
    let onTap: () -> Void

    private let size: CGFloat = 28

    var body: some View {
        Group {
            if isEnabled {
                Button(action: onTap) {
                    label
                }
                .buttonStyle(.plain)
            } else {
                label
            }
        }
        .accessibilityLabel(accessibilityLabelText)
        .accessibilityHint(isEnabled ? "タップで次のモードに切り替え" : "")
    }

    private var label: some View {
        Text(shortLabel)
            .font(.system(size: 11, weight: .black))
            .foregroundStyle(foregroundColor)
            .frame(width: size, height: size)
            .background(backgroundColor, in: Circle())
            .overlay(
                Circle()
                    .stroke(borderColor, lineWidth: vocabularyType == nil ? 1 : 0)
            )
            .opacity(isEnabled ? 1 : 0.85)
    }

    private var shortLabel: String {
        switch vocabularyType {
        case .active: return "A"
        case .passive: return "P"
        case nil: return "—"
        }
    }

    private var foregroundColor: Color {
        switch vocabularyType {
        case .active, .passive: return .white
        case nil: return MerkenTheme.mutedText
        }
    }

    private var backgroundColor: Color {
        switch vocabularyType {
        case .active: return MerkenTheme.accentBlue
        case .passive: return MerkenTheme.secondaryText.opacity(0.5)
        case nil: return Color.clear
        }
    }

    private var borderColor: Color {
        vocabularyType == nil ? MerkenTheme.border : Color.clear
    }

    private var accessibilityLabelText: String {
        let current: String = switch vocabularyType {
        case .active: "Active"
        case .passive: "Passive"
        case nil: "未設定"
        }
        let next = VocabularyType.cyclingNext(after: vocabularyType)
        let nextLabel: String = switch next {
        case .active: "Active"
        case .passive: "Passive"
        case nil: "未設定"
        }
        return isEnabled ? "語彙モード \(current)、次は \(nextLabel)" : "語彙モード \(current)"
    }
}
