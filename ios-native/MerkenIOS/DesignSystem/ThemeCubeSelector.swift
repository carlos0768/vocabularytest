import SwiftUI

struct ThemeCubeSelector: View {
    @Binding var mode: ThemeMode

    private static let allModes: [ThemeMode] = [.light, .dark, .system]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Self.allModes, id: \.self) { themeMode in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        mode = themeMode
                    }
                } label: {
                    Text(themeMode.label)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(mode == themeMode ? .white : MerkenTheme.mutedText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(
                            mode == themeMode
                                ? MerkenTheme.accentBlue
                                : Color.clear,
                            in: .capsule
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(MerkenTheme.background, in: .capsule)
        .overlay(
            Capsule()
                .stroke(MerkenTheme.borderLight, lineWidth: 1)
        )
    }
}
