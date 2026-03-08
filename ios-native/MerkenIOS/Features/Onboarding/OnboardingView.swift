import SwiftUI

struct OnboardingView: View {
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var currentPage = 0

    private let pages: [(symbol: String, title: String, description: String)] = [
        (
            "camera.viewfinder",
            "ノートを撮影",
            "手書きノートやプリントを撮影するだけで\n英単語を自動抽出"
        ),
        (
            "rectangle.portrait.on.rectangle.portrait",
            "フラッシュカードで学習",
            "抽出した単語をフラッシュカードや\nクイズで効率的に暗記"
        ),
        (
            "chart.line.uptrend.xyaxis",
            "学習を継続",
            "スペーシング復習で記憶を定着。\n毎日の進捗を確認しよう"
        ),
    ]

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                TabView(selection: $currentPage) {
                    ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                        pageView(page)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .indexViewStyle(.page(backgroundDisplayMode: .always))

                // "始める" button — only on last page
                VStack {
                    if currentPage == pages.count - 1 {
                        Button {
                            hasSeenOnboarding = true
                            dismiss()
                        } label: {
                            Text("始める")
                        }
                        .buttonStyle(PrimaryGlassButton())
                        .padding(.horizontal, 32)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .frame(height: 80)
                .animation(.easeInOut(duration: 0.3), value: currentPage)

                Spacer().frame(height: 32)
            }
        }
    }

    @ViewBuilder
    private func pageView(_ page: (symbol: String, title: String, description: String)) -> some View {
        VStack(spacing: 24) {
            Spacer()

            // Icon circle
            ZStack {
                Circle()
                    .fill(MerkenTheme.accentBlueLight)
                    .frame(width: 120, height: 120)

                Image(systemName: page.symbol)
                    .font(.system(size: 48))
                    .foregroundStyle(MerkenTheme.accentBlue)
            }

            // Title
            Text(page.title)
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            // Description
            Text(page.description)
                .font(.system(size: 16))
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)
                .lineSpacing(4)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 32)
    }
}

#Preview {
    OnboardingView()
}
