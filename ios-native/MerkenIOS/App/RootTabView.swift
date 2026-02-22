import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingScan = false
    @State private var showLoginAlert = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $appState.selectedTab) {
                NavigationStack {
                    HomeView()
                }
                .tag(0)
                .tabItem {
                    Label("ホーム", systemImage: "house.fill")
                }

                NavigationStack {
                    ProjectListView()
                }
                .tag(1)
                .tabItem {
                    Label("単語帳", systemImage: "text.book.closed.fill")
                }

                NavigationStack {
                    SearchView()
                }
                .tag(2)
                .tabItem {
                    Label("検索", systemImage: "magnifyingglass")
                }

                NavigationStack {
                    StatsView()
                }
                .tag(3)
                .tabItem {
                    Label("統計", systemImage: "chart.bar.fill")
                }

                NavigationStack {
                    SettingsView()
                }
                .tag(4)
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
        .sheet(isPresented: $showingScan) {
            ScanCoordinatorView()
                .environmentObject(appState)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .alert("ログインが必要です", isPresented: $showLoginAlert) {
            Button("OK") {}
        } message: {
            Text("スキャン機能を利用するにはログインが必要です。設定画面からログインしてください。")
        }
    }
}
