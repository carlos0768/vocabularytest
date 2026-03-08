import SwiftUI
import UIKit

private struct RootTabItem: Identifiable {
    let tab: Int
    let title: String
    let systemImage: String

    var id: Int { tab }
}

struct RootTabView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingScanOverlay = false
    @State private var selectedScanMode: ScanMode?
    @State private var selectedEikenLevel: EikenLevel?
    @State private var selectedScanSource: ScanSource?
    @State private var showingScanFlow = false

    private let tabItems: [RootTabItem] = [
        .init(tab: 0, title: "ホーム", systemImage: "house.fill"),
        .init(tab: 3, title: "進歩", systemImage: "chart.bar.fill"),
        .init(tab: 1, title: "本棚", systemImage: "books.vertical.fill"),
        .init(tab: 4, title: "設定", systemImage: "gearshape.fill")
    ]

    init() {
        UITabBar.appearance().isHidden = true
    }

    var body: some View {
        ZStack {
            AppBackground()

            TabView(selection: $appState.selectedTab) {
                NavigationStack {
                    HomeView()
                }
                .toolbar(.hidden, for: .tabBar)
                .tag(0)

                NavigationStack {
                    StatsView()
                }
                .toolbar(.hidden, for: .tabBar)
                .tag(3)

                NavigationStack {
                    BookshelfListView()
                }
                .toolbar(.hidden, for: .tabBar)
                .tag(1)

                NavigationStack {
                    SettingsView()
                }
                .toolbar(.hidden, for: .tabBar)
                .tag(4)
            }
            .tint(MerkenTheme.accentBlue)
            .toolbar(.hidden, for: .tabBar)
            .safeAreaPadding(.bottom, appState.tabBarVisible ? 96 : 0)
        }
        .overlay(alignment: .bottom) {
            if appState.tabBarVisible {
                bottomNavigationBar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .ignoresSafeArea(.container, edges: .bottom)
                    .ignoresSafeArea(.keyboard)
            }
        }
        .animation(MerkenSpring.snappy, value: appState.tabBarVisible)
        .overlay(alignment: .top) {
            if let banner = appState.scanBanner {
                ScanBannerView(state: banner)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay {
            if showingScanOverlay {
                ScanModeOverlay(
                    isPro: appState.subscription?.isActivePro ?? false,
                    onSelectMode: { mode, eikenLevel, source in
                        selectedScanMode = mode
                        selectedEikenLevel = eikenLevel
                        selectedScanSource = source
                        withAnimation(MerkenSpring.snappy) {
                            showingScanOverlay = false
                        }
                        showingScanFlow = true
                    },
                    onDismiss: {
                        withAnimation(MerkenSpring.snappy) {
                            showingScanOverlay = false
                        }
                    }
                )
                .transition(.opacity)
            }
        }
        .overlay {
            if showingScanFlow {
                ScanCoordinatorView(
                    preselectedMode: selectedScanMode,
                    preselectedEikenLevel: selectedEikenLevel,
                    preselectedSource: selectedScanSource,
                    onDismissRequest: closeScanFlow
                )
                .environmentObject(appState)
                .transition(.opacity)
                .zIndex(2)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.88), value: appState.scanBanner?.id)
        .animation(MerkenSpring.snappy, value: showingScanFlow)
    }

    private func closeScanFlow() {
        withAnimation(MerkenSpring.snappy) {
            showingScanFlow = false
        }
        selectedScanMode = nil
        selectedEikenLevel = nil
        selectedScanSource = nil
    }

    private var bottomNavigationBar: some View {
        HStack(alignment: .bottom, spacing: 12) {
            sharedTabBar
            scanButton
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(Color.clear)
    }

    private var sharedTabBar: some View {
        let shape = Capsule(style: .continuous)
        let baseBar = HStack(spacing: 6) {
            ForEach(tabItems) { item in
                tabButton(for: item)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)

        return Group {
            if #available(iOS 26.0, *) {
                baseBar.glassEffect(.regular.tint(Color.white.opacity(0.18)))
            } else {
                baseBar.background(.ultraThinMaterial, in: shape)
            }
        }
        .overlay(
            shape.stroke(Color.white.opacity(0.35), lineWidth: 1)
        )
        .clipShape(shape)
        .shadow(color: Color.black.opacity(0.10), radius: 16, x: 0, y: 8)
    }

    private func tabButton(for item: RootTabItem) -> some View {
        let isSelected = appState.selectedTab == item.tab

        return Button {
            MerkenHaptic.selection()
            if appState.selectedTab == item.tab {
                appState.scrollToTopTrigger += 1
            } else {
                appState.selectedTab = item.tab
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: item.systemImage)
                    .font(.system(size: 18, weight: .semibold))
                Text(item.title)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isSelected ? MerkenTheme.primaryText : MerkenTheme.secondaryText)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background {
                if isSelected {
                    Capsule(style: .continuous)
                        .fill(MerkenTheme.surface.opacity(0.92))
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(Color.white.opacity(0.45), lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 4)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
    }

    private var scanButton: some View {
        Button {
            MerkenHaptic.selection()
            withAnimation(MerkenSpring.snappy) {
                showingScanOverlay.toggle()
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(.white)
                .rotationEffect(.degrees(showingScanOverlay ? 45 : 0))
                .animation(MerkenSpring.snappy, value: showingScanOverlay)
                .frame(width: 62, height: 62)
                .background(
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.black.opacity(0.96), Color.black.opacity(0.82)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.14), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.18), radius: 14, x: 0, y: 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("スキャン")
    }
}

private struct ScanBannerView: View {
    let state: ScanBannerState

    private var iconName: String {
        switch state.level {
        case .success:
            return "checkmark.circle.fill"
        case .warning:
            return "arrow.triangle.2.circlepath.circle.fill"
        case .error:
            return "exclamationmark.triangle.fill"
        }
    }

    private var accentColor: Color {
        switch state.level {
        case .success:
            return MerkenTheme.success
        case .warning:
            return MerkenTheme.accentBlue
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
