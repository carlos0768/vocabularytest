import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.openURL) private var openURL

    @State private var email = ""
    @State private var password = ""
    @State private var showingSignUp = false
    @State private var showingContact = false
    @State private var showingTerms = false
    @State private var showingPrivacy = false
    @State private var showingSignOutAlert = false
    @State private var isPurchasing = false
    @State private var isRestoring = false
    @State private var purchaseErrorMessage: String?
    @State private var purchaseSuccessMessage: String?
    @State private var localAIEnabled = true

    private var isLoggedInAndActive: Bool {
        appState.isLoggedIn && !appState.isSessionExpired
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollViewReader { scrollProxy in
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    Color.clear.frame(height: 0).id("settingsTop")
                    HStack {
                        Text("設定")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Spacer()
                    }
                    .padding(.top, 8)

                    // Account profile card
                    accountProfileCard

                    if isLoggedInAndActive {
                        // Preferences
                        settingsGroup {
                            aiToggleRow
                        }

                        // Plan
                        settingsGroup {
                            planRow
                        }

                        // Support
                        settingsGroup {
                            settingsNavRow(icon: "envelope", title: "お問い合わせ") {
                                showingContact = true
                            }
                            settingsDivider
                            settingsNavRow(icon: "doc.text", title: "利用規約") {
                                showingTerms = true
                            }
                            settingsDivider
                            settingsNavRow(icon: "hand.raised", title: "プライバシーポリシー") {
                                showingPrivacy = true
                            }
                        }

                        // Sign out
                        settingsGroup {
                            settingsActionRow(icon: "rectangle.portrait.and.arrow.right", title: "ログアウト", color: MerkenTheme.danger) {
                                showingSignOutAlert = true
                            }
                        }
                    } else {
                        // Guest: login + signup
                        if appState.isSessionExpired {
                            sessionExpiredBanner
                        }

                        if let message = appState.authErrorMessage, !appState.isSessionExpired {
                            authErrorBanner(message)
                        }

                        settingsGroup {
                            guestAuthSection
                        }

                        // Support
                        settingsGroup {
                            settingsNavRow(icon: "envelope", title: "お問い合わせ") {
                                showingContact = true
                            }
                            settingsDivider
                            settingsNavRow(icon: "doc.text", title: "利用規約") {
                                showingTerms = true
                            }
                            settingsDivider
                            settingsNavRow(icon: "hand.raised", title: "プライバシーポリシー") {
                                showingPrivacy = true
                            }
                        }
                    }

                    // Version
                    Text("v1.0.0")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 100)
            }
            .scrollIndicators(.hidden)
            .onChange(of: appState.scrollToTopTrigger) { _ in
                withAnimation {
                    scrollProxy.scrollTo("settingsTop", anchor: .top)
                }
            }
            } // ScrollViewReader
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $showingContact) {
            ContactView()
        }
        .navigationDestination(isPresented: $showingTerms) {
            TermsView()
        }
        .navigationDestination(isPresented: $showingPrivacy) {
            PrivacyView()
        }
        .task(id: appState.isLoggedIn) {
            localAIEnabled = appState.isAIEnabled

            guard appState.isLoggedIn, appState.aiPreference == nil else { return }
            await appState.refreshUserPreferences(showLoadingIndicator: false)
            localAIEnabled = appState.isAIEnabled
        }
        .onChange(of: appState.isAIEnabled) { _ in
            localAIEnabled = appState.isAIEnabled
        }
        .alert("ログアウトしますか？", isPresented: $showingSignOutAlert) {
            Button("ログアウト", role: .destructive) {
                Task {
                    await appState.signOut()
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("現在のセッションを終了します。")
        }
        .sheet(isPresented: $showingSignUp) {
            SignUpView()
                .environmentObject(appState)
        }
    }

    // MARK: - Settings Group Container

    private func settingsGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    private var settingsDivider: some View {
        Divider()
            .overlay(MerkenTheme.borderLight)
            .padding(.leading, 52)
    }

    // MARK: - Account Profile Card

    private var accountProfileCard: some View {
        HStack(spacing: 14) {
            // Avatar circle
            ZStack {
                Circle()
                    .fill(
                        appState.isLoggedIn
                            ? MerkenTheme.accentBlue.opacity(0.15)
                            : MerkenTheme.mutedText.opacity(0.15)
                    )
                Image(systemName: appState.isLoggedIn ? "person.crop.circle.fill" : "person.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(appState.isLoggedIn ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                if appState.isLoggedIn {
                    Text(appState.session?.email ?? "ログイン中")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(1)
                        .truncationMode(.middle)
                } else {
                    Text("ゲスト")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                }

                HStack(spacing: 8) {
                    if appState.isPro {
                        proChip
                    } else {
                        planLabel(appState.isLoggedIn ? "Free" : "ゲスト")
                    }

                    if appState.isLoggedIn {
                        if appState.isSessionExpired {
                            statusDot(color: MerkenTheme.warning, text: "期限切れ")
                        } else {
                            statusDot(color: MerkenTheme.success, text: "有効")
                        }
                    }
                }
            }

            Spacer(minLength: 0)

            // Storage indicator
            VStack(spacing: 2) {
                Image(systemName: appState.isPro ? "icloud.fill" : "iphone")
                    .font(.system(size: 16))
                    .foregroundStyle(appState.isPro ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                Text(appState.isPro ? "クラウド" : "ローカル")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
        .padding(16)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    // MARK: - AI Toggle Row

    private var aiToggleRow: some View {
        HStack(spacing: 14) {
            settingsIcon("sparkles", color: MerkenTheme.success)

            VStack(alignment: .leading, spacing: 2) {
                Text("クイズ生成")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(localAIEnabled ? "4択クイズを自動生成" : "OFFで高速スキャン")
                    .font(.system(size: 12))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer(minLength: 0)

            Toggle("", isOn: Binding(
                get: { localAIEnabled },
                set: { newValue in
                    localAIEnabled = newValue
                    Task {
                        await appState.setAIPreference(newValue)
                    }
                }
            ))
            .labelsHidden()
            .tint(MerkenTheme.accentBlue)
            .disabled(!appState.isLoggedIn)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Plan Row

    private var planRow: some View {
        VStack(spacing: 0) {
            if appState.isPro {
                proPlanContent
            } else {
                freePlanContent
            }
        }
    }

    private var proPlanContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                settingsIcon("creditcard.fill", color: MerkenTheme.accentBlue)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("プラン")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.primaryText)
                        proChip
                    }
                    Text("¥500/月")
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer(minLength: 0)
            }

            // Feature chips
            HStack(spacing: 6) {
                featureChip("スキャン無制限")
                featureChip("単語数無制限")
                featureChip("クラウド同期")
            }

            if let periodEnd = appState.subscription?.currentPeriodEnd {
                let formatted = periodEnd.formatted(.dateTime.year().month().day())
                Text("次回更新: \(formatted)")
                    .font(.system(size: 11))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            if appState.subscription?.proSource == "appstore" {
                Button {
                    guard let url = URL(string: "https://apps.apple.com/account/subscriptions") else { return }
                    openURL(url)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 11, weight: .semibold))
                        Text("App Storeで管理")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
        .padding(16)
    }

    private var freePlanContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                settingsIcon("creditcard.fill", color: MerkenTheme.mutedText)

                VStack(alignment: .leading, spacing: 2) {
                    Text("プラン")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("Free - 3回/日スキャン, 50語まで")
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer(minLength: 0)
            }

            // Upgrade CTA
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    proChip
                    Text("にアップグレード")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                }

                VStack(alignment: .leading, spacing: 6) {
                    upgradeFeatureRow("スキャン無制限")
                    upgradeFeatureRow("単語数無制限")
                    upgradeFeatureRow("クラウド同期")
                }

                Button {
                    purchaseProSubscription()
                } label: {
                    Text(isPurchasing ? "購入処理中..." : "¥500/月で始める")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 10))
                }
                .disabled(isPurchasing || isRestoring)

                Button {
                    restoreProSubscription()
                } label: {
                    Text(isRestoring ? "復元中..." : "購入を復元")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .frame(maxWidth: .infinity)
                }
                .disabled(isPurchasing || isRestoring)

                if let purchaseErrorMessage {
                    Text(purchaseErrorMessage)
                        .font(.system(size: 11))
                        .foregroundStyle(MerkenTheme.warning)
                }

                if let purchaseSuccessMessage {
                    Text(purchaseSuccessMessage)
                        .font(.system(size: 11))
                        .foregroundStyle(MerkenTheme.success)
                }
            }
            .padding(12)
            .background(MerkenTheme.accentBlue.opacity(0.06), in: .rect(cornerRadius: 10))
        }
        .padding(16)
    }

    // MARK: - Navigation Row

    private func settingsNavRow(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                settingsIcon(icon, color: MerkenTheme.accentBlue)

                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func settingsActionRow(icon: String, title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                settingsIcon(icon, color: color)

                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(color)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Login Form

    private var guestAuthSection: some View {
        VStack(spacing: 0) {
            loginFormSection
            settingsDivider
            signUpRow
        }
    }

    private var loginFormSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                settingsIcon("key.fill", color: MerkenTheme.accentBlue)

                Text("サインイン")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(MerkenTheme.primaryText)
            }

            Text("ログインも新規登録も、この画面にまとめています。")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)

            TextField("メールアドレス", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 15))
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(MerkenTheme.background, in: .rect(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(MerkenTheme.borderLight, lineWidth: 1)
                )
                .accessibilityIdentifier("emailField")

            SecureField("パスワード", text: $password)
                .font(.system(size: 15))
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(MerkenTheme.background, in: .rect(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(MerkenTheme.borderLight, lineWidth: 1)
                )
                .accessibilityIdentifier("passwordField")

            Button {
                Task {
                    await appState.signIn(email: email, password: password)
                }
            } label: {
                HStack {
                    if appState.isSigningIn {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(appState.isSigningIn ? "サインイン中..." : "サインイン")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 10))
            }
            .disabled(appState.isSigningIn)
            .opacity(appState.isSigningIn ? 0.7 : 1)
            .accessibilityIdentifier("signInButton")
        }
        .padding(16)
    }

    // MARK: - Sign Up Row

    private var signUpRow: some View {
        Button {
            showingSignUp = true
        } label: {
            HStack(spacing: 14) {
                settingsIcon("person.badge.plus", color: MerkenTheme.success)

                VStack(alignment: .leading, spacing: 2) {
                    Text("新規登録")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("アカウントを作成してクラウド同期を開始")
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Banners

    private var sessionExpiredBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.warning)
            VStack(alignment: .leading, spacing: 2) {
                Text("セッション期限切れ")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("再ログインしてください。")
                    .font(.system(size: 12))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            Spacer()
        }
        .padding(14)
        .background(MerkenTheme.warning.opacity(0.08), in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(MerkenTheme.warning.opacity(0.3), lineWidth: 1)
        )
    }

    private func authErrorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.warning)
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(MerkenTheme.secondaryText)
            Spacer()
        }
        .padding(14)
        .background(MerkenTheme.warning.opacity(0.08), in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(MerkenTheme.warning.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Small Components

    private func settingsIcon(_ name: String, color: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 34, height: 34)
            .background(color, in: .rect(cornerRadius: 9))
    }

    private var proChip: some View {
        HStack(spacing: 3) {
            Image(systemName: "sparkles")
                .font(.system(size: 9, weight: .bold))
            Text("Pro")
                .font(.system(size: 11, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(MerkenTheme.accentBlue, in: .capsule)
    }

    private func planLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(MerkenTheme.mutedText)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(MerkenTheme.mutedText.opacity(0.12), in: .capsule)
    }

    private func statusDot(color: Color, text: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(color)
        }
    }

    private func featureChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(MerkenTheme.accentBlue)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(MerkenTheme.accentBlue.opacity(0.10), in: .capsule)
    }

    private func upgradeFeatureRow(_ text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(MerkenTheme.success)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }

    // MARK: - Purchase Logic

    private func purchaseProSubscription() {
        guard appState.isLoggedIn else {
            purchaseErrorMessage = "購入にはログインが必要です。"
            return
        }

        isPurchasing = true
        purchaseErrorMessage = nil
        purchaseSuccessMessage = nil

        Task {
            defer { isPurchasing = false }
            do {
                try await appState.purchaseProWithAppStore()
                purchaseSuccessMessage = "Proプランを有効化しました。"
            } catch {
                purchaseErrorMessage = error.localizedDescription
            }
        }
    }

    private func restoreProSubscription() {
        guard appState.isLoggedIn else {
            purchaseErrorMessage = "復元にはログインが必要です。"
            return
        }

        isRestoring = true
        purchaseErrorMessage = nil
        purchaseSuccessMessage = nil

        Task {
            defer { isRestoring = false }
            do {
                try await appState.restoreProWithAppStore()
                purchaseSuccessMessage = "購入情報を復元しました。"
            } catch {
                purchaseErrorMessage = error.localizedDescription
            }
        }
    }
}
