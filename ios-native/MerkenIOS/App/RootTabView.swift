import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingScan = false
    @State private var showLoginAlert = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView {
                NavigationStack {
                    HomeView()
                }
                .tabItem {
                    Label("ホーム", systemImage: "house.fill")
                }

                NavigationStack {
                    ProjectListView()
                }
                .tabItem {
                    Label("単語帳", systemImage: "books.vertical.fill")
                }

                NavigationStack {
                    StatsView()
                }
                .tabItem {
                    Label("統計", systemImage: "chart.bar.fill")
                }

                NavigationStack {
                    FavoritesView()
                }
                .tabItem {
                    Label("お気に入り", systemImage: "heart.fill")
                }

                NavigationStack {
                    SettingsView()
                }
                .tabItem {
                    Label("設定", systemImage: "gearshape.fill")
                }
            }
            .tint(MerkenTheme.accentBlue)

            // FAB - Scan Button
            Button {
                if appState.isLoggedIn {
                    showingScan = true
                } else {
                    showLoginAlert = true
                }
            } label: {
                Image(systemName: "camera.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .glassEffect(.regular.tint(MerkenTheme.accentBlue), in: .circle)
            }
            .padding(.trailing, 20)
            .padding(.bottom, 64)
            .accessibilityIdentifier("scanFAB")
        }
        .background {
            AppBackground()
        }
        .fullScreenCover(isPresented: $showingScan) {
            ScanCoordinatorView()
                .environmentObject(appState)
        }
        .alert("ログインが必要です", isPresented: $showLoginAlert) {
            Button("OK") {}
        } message: {
            Text("スキャン機能を利用するにはログインが必要です。設定画面からログインしてください。")
        }
    }
}
