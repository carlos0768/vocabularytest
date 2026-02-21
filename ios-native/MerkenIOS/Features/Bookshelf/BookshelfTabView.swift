import SwiftUI

struct BookshelfTabView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        if appState.isPro {
            BookshelfListView()
        } else {
            proGateView
        }
    }

    private var proGateView: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 20) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(MerkenTheme.mutedText)

                Text("本棚はPro限定機能です")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Text("複数の単語帳をまとめて学習できる「本棚」機能は、Proプランでご利用いただけます。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                if appState.isLoggedIn {
                    Text("設定画面からProプランにアップグレードしてください。")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                } else {
                    Text("まずログインし、Proプランに登録してください。")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
        .navigationTitle("本棚")
    }
}
