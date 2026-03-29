import SwiftUI
import UIKit

private struct RootTabItem: Identifiable {
    let tab: Int
    let title: String
    let systemImage: String

    var id: Int { tab }
}

private struct LiquidBarButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .brightness(configuration.isPressed ? 0.02 : 0)
            .overlay {
                if configuration.isPressed {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.18))
                }
            }
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

struct RootTabView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingScanFlow = false
    @State private var showingSignInFlow = false
    @State private var showingSignUpFlow = false

    private let tabItems: [RootTabItem] = [
        .init(tab: 0, title: "ホーム", systemImage: "house.fill"),
        .init(tab: 1, title: "共有", systemImage: "person.2.fill"),
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

            if appState.isLoggedIn {
                TabView(selection: $appState.selectedTab) {
                    NavigationStack {
                        HomeView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(0)

                    NavigationStack {
                        SharedProjectsTabView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(1)

                    NavigationStack {
                        StatsView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(3)

                    NavigationStack {
                        SettingsView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(4)
                }
                .tint(MerkenTheme.accentBlue)
                .toolbar(.hidden, for: .tabBar)
                .safeAreaPadding(.bottom, appState.tabBarVisible ? 92 : 0)
            } else {
                NavigationStack {
                    RootAuthLandingView(
                        onGetStarted: {
                            showingSignUpFlow = true
                        },
                        onSignIn: { showingSignInFlow = true }
                    )
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar(.hidden, for: .navigationBar)
                    .navigationDestination(isPresented: $showingSignUpFlow) {
                        SignUpView()
                            .environmentObject(appState)
                    }
                    .navigationDestination(isPresented: $showingSignInFlow) {
                        RootSignInView()
                            .environmentObject(appState)
                    }
                }
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
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
            if appState.isLoggedIn && showingScanFlow {
                ScanCoordinatorView(
                    onDismissRequest: closeScanFlow
                )
                .environmentObject(appState)
                .transition(.opacity)
                .zIndex(2)
            }
        }
        .overlay(alignment: .bottom) {
            if appState.isLoggedIn && appState.tabBarVisible {
                bottomNavigationBar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .ignoresSafeArea(.container, edges: .bottom)
                    .ignoresSafeArea(.keyboard)
                    .zIndex(3)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.88), value: appState.scanBanner?.id)
        .animation(MerkenSpring.snappy, value: showingScanFlow)
    }

    private func closeScanFlow() {
        withAnimation(MerkenSpring.snappy) {
            showingScanFlow = false
        }
    }

    private var bottomNavigationBar: some View {
        HStack(alignment: .bottom, spacing: 12) {
            sharedTabBar
            scanButton
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 0)
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
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity)
        .frame(height: 56)

        return baseBar
            .background(.ultraThinMaterial, in: shape)
            .overlay(
                shape.stroke(Color.white.opacity(0.32), lineWidth: 1)
            )
            .clipShape(shape)
            .shadow(color: Color.black.opacity(0.12), radius: 16, x: 0, y: 8)
            .allowsHitTesting(!showingScanFlow)
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
            VStack(spacing: 1) {
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
            .padding(.vertical, 3)
            .background {
                if isSelected {
                    Capsule(style: .continuous)
                        .fill(Color.white.opacity(0.58))
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(Color.white.opacity(0.38), lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.10), radius: 8, x: 0, y: 4)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(LiquidBarButtonStyle())
        .accessibilityLabel(item.title)
    }

    private var scanButton: some View {
        Button {
            MerkenHaptic.selection()
            withAnimation(MerkenSpring.snappy) {
                showingScanFlow.toggle()
            }
        } label: {
            ZStack {
                Image(systemName: "plus")
                    .opacity(showingScanFlow ? 0 : 1)
                    .scaleEffect(showingScanFlow ? 0.55 : 1)
                    .rotationEffect(.degrees(showingScanFlow ? 90 : 0))

                Image(systemName: "xmark")
                    .opacity(showingScanFlow ? 1 : 0)
                    .scaleEffect(showingScanFlow ? 1 : 0.55)
                    .rotationEffect(.degrees(showingScanFlow ? 0 : -90))
            }
            .font(.system(size: 24, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 56, height: 56)
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
        .buttonStyle(LiquidBarButtonStyle())
        .accessibilityLabel(showingScanFlow ? "閉じる" : "スキャン")
    }
}

private struct RootAuthLandingView: View {
    let onGetStarted: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                Spacer(minLength: 24)

                ZStack {
                    RoundedRectangle(cornerRadius: 44, style: .continuous)
                        .fill(Color.black)
                        .frame(width: 212, height: 430)
                        .rotationEffect(.degrees(-10))
                        .offset(x: 86, y: -10)

                    RoundedRectangle(cornerRadius: 36, style: .continuous)
                        .fill(Color.white)
                        .frame(width: 186, height: 390)
                        .rotationEffect(.degrees(-10))
                        .overlay(alignment: .top) {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Image(systemName: "applelogo")
                                    Text("Merken")
                                        .font(.system(size: 18, weight: .bold))
                                }
                                .foregroundStyle(MerkenTheme.primaryText)
                                .padding(.top, 28)
                                .padding(.horizontal, 18)

                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .fill(MerkenTheme.background)
                                    .frame(height: 220)
                                    .overlay {
                                        VStack(spacing: 16) {
                                            Image(systemName: "camera.viewfinder")
                                                .font(.system(size: 44, weight: .medium))
                                                .foregroundStyle(MerkenTheme.accentBlue)
                                            Text("スキャンして作成")
                                                .font(.system(size: 18, weight: .bold))
                                                .foregroundStyle(MerkenTheme.primaryText)
                                        }
                                    }
                                    .padding(.horizontal, 14)
                            }
                        }
                }
                .frame(height: 360)

                Spacer(minLength: 28)

                VStack(spacing: 20) {
                    Text("英語学習を\nもっと簡単に")
                        .font(.system(size: 34, weight: .black))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(MerkenTheme.primaryText)

                    Button(action: onGetStarted) {
                        Text("はじめる")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 20)
                            .background(Color.black, in: Capsule())
                    }

                    HStack(spacing: 6) {
                        Text("すでにアカウントをお持ちですか？")
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Button("ログイン", action: onSignIn)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                    }
                    .font(.system(size: 16, weight: .medium))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 34)
            }
        }
    }
}

private struct RootSignInView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            AppBackground()

            VStack(alignment: .leading, spacing: 18) {
                Text("サインイン")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)

                TextField("メールアドレス", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .solidTextField(cornerRadius: 16)

                SecureField("パスワード", text: $password)
                    .solidTextField(cornerRadius: 16)

                if let message = appState.authErrorMessage, !message.isEmpty {
                    Text(message)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.danger)
                }

                Button {
                    Task {
                        await appState.signIn(email: email, password: password)
                        if appState.isLoggedIn {
                            dismiss()
                        }
                    }
                } label: {
                    HStack {
                        if appState.isSigningIn {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(appState.isSigningIn ? "サインイン中..." : "サインイン")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .disabled(appState.isSigningIn)
                .opacity(appState.isSigningIn ? 0.7 : 1)

                Spacer()
            }
            .padding(24)
        }
        .navigationTitle("サインイン")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
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
