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
                    Label("単語帳", systemImage: "text.book.closed.fill")
                }

                NavigationStack {
                    SearchView()
                }
                .tabItem {
                    Label("検索", systemImage: "magnifyingglass")
                }

                NavigationStack {
                    StatsView()
                }
                .tabItem {
                    Label("統計", systemImage: "chart.bar.fill")
                }

                NavigationStack {
                    SettingsView()
                }
                .tabItem {
                    Label("設定", systemImage: "gearshape.fill")
                }
            }
            .tint(MerkenTheme.accentBlue)

            // FAB removed — scan is accessible from individual pages
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
