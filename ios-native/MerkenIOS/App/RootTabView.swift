import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingScan = false
    @State private var showLoginAlert = false
    @State private var previousTab: Int = 0

    var body: some View {
        ZStack {
            AppBackground()

            TabView(selection: $appState.selectedTab) {
                NavigationStack {
                    HomeView()
                }
                .tag(0)
                .tabItem {
                    Label("ホーム", systemImage: "house.fill")
                }

                NavigationStack {
                    BookshelfListView()
                }
                .tag(1)
                .tabItem {
                    Label("本棚", systemImage: "books.vertical.fill")
                }

                // Center scan tab (dummy view, intercept selection to show sheet)
                Color.clear
                    .tag(99)
                    .tabItem {
                        Label("スキャン", systemImage: "doc.viewfinder")
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
            .onChange(of: appState.selectedTab) { newTab in
                if newTab == 99 {
                    // Intercept scan tab — show sheet, stay on current tab
                    appState.selectedTab = previousTab
                    showingScan = true
                } else {
                    previousTab = newTab
                }
            }
        }
        .overlay(alignment: .top) {
            if let banner = appState.scanBanner {
                ScanBannerView(state: banner)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.88), value: appState.scanBanner?.id)
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

private struct ScanBannerView: View {
    let state: ScanBannerState

    private var iconName: String {
        switch state.level {
        case .success:
            return "checkmark.circle.fill"
        case .error:
            return "exclamationmark.triangle.fill"
        }
    }

    private var accentColor: Color {
        switch state.level {
        case .success:
            return MerkenTheme.success
        case .error:
            return MerkenTheme.warning
        }
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
        let baseContent = HStack(alignment: .top, spacing: 12) {
            Image(systemName: iconName)
                .font(.headline.weight(.semibold))
                .foregroundStyle(accentColor)
                .padding(.top, 1)

            VStack(alignment: .leading, spacing: 4) {
                Text(state.title)
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)

                Text(state.message)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        Group {
            if #available(iOS 26.0, *) {
                baseContent.glassEffect(.regular.tint(accentColor.opacity(0.20)))
            } else {
                baseContent.background(.ultraThinMaterial, in: shape)
            }
        }
        .overlay(
            shape.stroke(accentColor.opacity(0.35), lineWidth: 1)
        )
        .clipShape(shape)
        .shadow(color: Color.black.opacity(0.20), radius: 12, x: 0, y: 6)
    }
}
