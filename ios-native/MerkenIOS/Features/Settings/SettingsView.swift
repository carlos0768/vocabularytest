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
    @State private var scrollOffset: CGFloat = 0
    @State private var isEditingUsername = false
    @State private var usernameInput = ""

    private var isLoggedInAndActive: Bool {
        appState.isLoggedIn && !appState.isSessionExpired
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollViewReader { scrollProxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Color.clear
                            .frame(height: 0)
                            .id("settingsTop")
                            .background(
                                GeometryReader { proxy in
                                    Color.clear.preference(
                                        key: TopSafeAreaScrollOffsetKey.self,
                                        value: proxy.frame(in: .named("settingsScroll")).minY
                                    )
                                }
                            )

                        headerSection

                        if appState.isSessionExpired {
                            sessionExpiredBanner
                        } else if let message = appState.authErrorMessage, !message.isEmpty, !isLoggedInAndActive {
                            authErrorBanner(message)
                        }

                        profileHeroCard

                        if isLoggedInAndActive {
                            settingsSection(title: "プロフィール") {
                                usernameRow
                            }

                            settingsSection(title: "アカウント") {
                                accountRows
                            }

                            settingsSection(title: "サポート") {
                                supportRows
                            }
                        } else {
                            settingsSection(title: "アカウント") {
                                guestAuthSection
                            }
                        }

                        if isLoggedInAndActive {
                            Text("v1.0.0")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(MerkenTheme.mutedText)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 100)
                }
                .coordinateSpace(name: "settingsScroll")
                .scrollIndicators(.hidden)
                .disableTopScrollEdgeEffectIfAvailable()
                .onChange(of: appState.scrollToTopTrigger) { _ in
                    withAnimation {
                        scrollProxy.scrollTo("settingsTop", anchor: .top)
                    }
                }
            } // ScrollViewReader
        }
        .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
        .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
            scrollOffset = value
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
            guard appState.isLoggedIn else { return }
            if appState.aiPreference == nil {
                await appState.refreshUserPreferences(showLoadingIndicator: false)
            }
            if appState.username == nil {
                await appState.refreshProfile(showLoadingIndicator: false)
            }
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
            NavigationStack {
                SignUpView()
                    .environmentObject(appState)
            }
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
    }

    private func settingsSection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(title: title)
            settingsGroup(content: content)
        }
    }

    private var settingsDivider: some View {
        Divider()
            .overlay(MerkenTheme.borderLight)
            .padding(.leading, 52)
    }

    private var headerSection: some View {
        Text("設定")
            .font(.system(size: 28, weight: .bold))
            .foregroundStyle(MerkenTheme.primaryText)
    }

    private var profileHeroCard: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(MerkenTheme.background)
                Image(systemName: appState.isLoggedIn ? "person.crop.circle" : "person")
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(MerkenTheme.primaryText)
            }
            .frame(width: 62, height: 62)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if appState.isPro {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(MerkenTheme.warning)
                        Text("Pro")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    } else if appState.isLoggedIn {
                        Text("Free")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    } else {
                        Text("ゲスト")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }

                Text(profilePrimaryText)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Text(profileSecondaryText)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 6) {
                planBadge
                Text(appState.isPro ? "クラウド同期" : "ローカル保存")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
    }

    private var profilePrimaryText: String {
        if let username = appState.username, !username.isEmpty {
            return username
        }
        if let email = appState.session?.email, !email.isEmpty {
            return email
        }
        return appState.isLoggedIn ? "ログイン中" : "サインインして同期を有効化"
    }

    private var profileSecondaryText: String {
        if appState.isLoggedIn {
            return appState.isPro
                ? "Merken Pro で複数端末の同期が有効です"
                : "この端末で学習データを管理しています"
        }
        return "アカウントを作成するとクラウド同期を使えます"
    }

    private var planBadge: some View {
        Group {
            if appState.isPro {
                proChip
            } else if appState.isLoggedIn {
                planLabel("Free")
            } else {
                planLabel("Guest")
            }
        }
    }

    private var accountRows: some View {
        Group {
            settingsInfoRow(
                icon: "person.text.rectangle",
                title: "アカウント状態",
                subtitle: appState.isSessionExpired ? "セッション期限切れ" : (appState.isLoggedIn ? "認証済み" : "未ログイン"),
                trailingText: appState.isPro ? "Pro" : (appState.isLoggedIn ? "Free" : "Guest")
            )

            settingsDivider

            settingsInfoRow(
                icon: appState.isPro ? "icloud" : "iphone",
                title: "保存先",
                subtitle: appState.isPro ? "複数端末で同期" : "この端末に保存",
                trailingText: appState.isPro ? "Cloud" : "Local"
            )

            settingsDivider

            planSettingsBlock
        }
    }

    private var supportRows: some View {
        Group {
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

            settingsDivider

            settingsActionRow(icon: "rectangle.portrait.and.arrow.right", title: "ログアウト", color: MerkenTheme.danger) {
                showingSignOutAlert = true
            }
        }
    }

    private func sectionHeader(title: String) -> some View {
        Text(title)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(MerkenTheme.secondaryText)
            .padding(.horizontal, 2)
    }

    // MARK: - Username

    private var usernameRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                settingsIcon("person.fill", color: MerkenTheme.accentBlue)

                VStack(alignment: .leading, spacing: 3) {
                    Text("ユーザー名")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("共有した単語帳に表示される名前です。")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer(minLength: 0)

                if appState.isLoadingProfile || appState.isSavingProfile {
                    ProgressView()
                        .progressViewStyle(.circular)
                }
            }

            if isEditingUsername {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("ユーザー名を入力", text: $usernameInput)
                        .solidTextField()
                        .onChange(of: usernameInput) { _, newValue in
                            if newValue.count > 20 {
                                usernameInput = String(newValue.prefix(20))
                            }
                        }

                    HStack(spacing: 8) {
                        Button {
                            let trimmed = usernameInput.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !trimmed.isEmpty else { return }
                            Task {
                                let success = await appState.setUsername(trimmed)
                                if success {
                                    isEditingUsername = false
                                }
                            }
                        } label: {
                            Text(appState.isSavingProfile ? "保存中..." : "保存")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(MerkenTheme.accentBlue, in: .capsule)
                        }
                        .disabled(appState.isSavingProfile || usernameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                        Button {
                            isEditingUsername = false
                            usernameInput = appState.username ?? ""
                        } label: {
                            Text("キャンセル")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(MerkenTheme.surfaceAlt, in: .capsule)
                        }
                        .disabled(appState.isSavingProfile)
                    }
                }
            } else {
                Button {
                    usernameInput = appState.username ?? ""
                    isEditingUsername = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)

                        Text(appState.username ?? "ユーザー名を設定")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(appState.username != nil ? MerkenTheme.primaryText : MerkenTheme.mutedText)

                        Spacer(minLength: 0)

                        Image(systemName: "pencil")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(MerkenTheme.background, in: .rect(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(MerkenTheme.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(appState.isLoadingProfile)
            }

            if let errorMessage = appState.profileErrorMessage, !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(.system(size: 11))
                    .foregroundStyle(MerkenTheme.warning)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Plan Block

    private var planSettingsBlock: some View {
        Group {
            if appState.isPro {
                proPlanBlock
            } else {
                freePlanBlock
            }
        }
    }

    private var proPlanBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                settingsIcon("creditcard.fill", color: MerkenTheme.accentBlue)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("Merken Pro")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.primaryText)
                        proChip
                    }
                    Text("¥300/月")
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 6) {
                featureChip("スキャン無制限")
                featureChip("単語数無制限")
                featureChip("クラウド同期")
            }

            if let subscription = appState.subscription,
               let label = subscription.displayDateLabel,
               let displayDate = subscription.displayDateValue {
                let formatted = displayDate.formatted(.dateTime.year().month().day())
                Text("\(label): \(formatted)")
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
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var freePlanBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                settingsIcon("creditcard.fill", color: MerkenTheme.mutedText)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Free プラン")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("Free - 3回/日スキャン, 50語まで")
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer(minLength: 0)
            }

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
                    Text(isPurchasing ? "購入処理中..." : "¥300/月で始める")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 14))
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
            .background(MerkenTheme.background, in: .rect(cornerRadius: 14))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
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

    private func settingsInfoRow(icon: String, title: String, subtitle: String, trailingText: String) -> some View {
        HStack(spacing: 14) {
            settingsIcon(icon, color: MerkenTheme.primaryText.opacity(0.88), filled: false)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer()

            Text(trailingText)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.mutedText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func settingsActionRow(icon: String, title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                settingsIcon(icon, color: color, filled: false)

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
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                settingsIcon("key.fill", color: MerkenTheme.accentBlue)

                VStack(alignment: .leading, spacing: 3) {
                    Text("サインイン")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("ログインも新規登録も、この画面にまとめています。")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            HStack(spacing: 8) {
                featureChip("クラウド同期")
                featureChip("進捗を保持")
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("メールアドレス")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)

                TextField("name@example.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .solidTextField()
                    .accessibilityIdentifier("emailField")
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("パスワード")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)

                SecureField("パスワード", text: $password)
                    .solidTextField()
                    .accessibilityIdentifier("passwordField")
            }

            Button {
                Task {
                    await appState.signIn(email: email, password: password)
                }
            } label: {
                HStack(spacing: 8) {
                    if appState.isSigningIn {
                        ProgressView()
                            .tint(.white)
                    }
                    Image(systemName: "arrow.right.circle.fill")
                    Text(appState.isSigningIn ? "サインイン中..." : "サインイン")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.accentBlue, in: .capsule)
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

                VStack(alignment: .leading, spacing: 3) {
                    Text("新規登録")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("アカウントを作成してクラウド同期を開始")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()

                HStack(spacing: 6) {
                    Text("登録へ")
                        .font(.system(size: 12, weight: .bold))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundStyle(MerkenTheme.success)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(MerkenTheme.success.opacity(0.10), in: Capsule())
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
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
        .background(MerkenTheme.warning.opacity(0.08), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.warning.opacity(0.3), lineWidth: 1.5)
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
        .background(MerkenTheme.warning.opacity(0.08), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.warning.opacity(0.3), lineWidth: 1.5)
        )
    }

    // MARK: - Small Components

    private func settingsIcon(_ name: String, color: Color, filled: Bool = false) -> some View {
        Image(systemName: name)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(filled ? Color.white : color)
            .frame(width: 32, height: 32)
            .background(
                (filled ? color : color.opacity(0.12)),
                in: .circle
            )
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
        .background(MerkenTheme.primaryText, in: .capsule)
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
