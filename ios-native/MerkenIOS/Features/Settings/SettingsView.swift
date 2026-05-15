import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var themeManager: ThemeManager
    @Environment(\.openURL) private var openURL

    @State private var email = ""
    @State private var password = ""
    @State private var showingSignUp = false
    @State private var showingContact = false
    @State private var showingTerms = false
    @State private var showingPrivacy = false
    @State private var showingTokusho = false
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
            PaperDotBackground()

            ScrollViewReader { scrollProxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
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
                            if !appState.isPro {
                                upgradeBanner
                            } else {
                                settingsSection(title: "アカウント") {
                                    accountRows
                                }
                            }

                            settingsSection(title: "表示") {
                                displayRows
                            }

                            settingsSection(title: "サポート") {
                                supportRows
                            }

                            logoutButton
                        } else {
                            settingsSection(title: "アカウント") {
                                guestAuthSection
                            }

                            settingsSection(title: "表示") {
                                displayRows
                            }

                            settingsSection(title: "サポート") {
                                supportRows
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
        .navigationDestination(isPresented: $showingTokusho) {
            TokushoView()
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
        .solidSurface(tone: .surface, depth: .small, cornerRadius: 12)
    }

    private func settingsSection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader(title: title)
            settingsGroup(content: content)
        }
    }

    private var settingsDivider: some View {
        Divider()
            .overlay(MerkenTheme.borderLight)
            .padding(.leading, 48)
    }

    private var headerSection: some View {
        SolidPageHeader(
            kicker: "ACCOUNT",
            title: "設定"
        )
    }

    private var profileHeroCard: some View {
        SolidSurface(tone: .surface, depth: .small, cornerRadius: 14, padding: 14) {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    avatarView

                    VStack(alignment: .leading, spacing: 4) {
                        Text(profilePrimaryText)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)

                        Text(profileSecondaryText)
                            .font(.system(size: 11, weight: .medium, design: appState.isLoggedIn ? .monospaced : .default))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .lineLimit(1)
                            .truncationMode(.middle)

                        planBadge
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    if isLoggedInAndActive && !isEditingUsername {
                        Button {
                            usernameInput = appState.username ?? ""
                            isEditingUsername = true
                        } label: {
                            Label("変更", systemImage: "pencil")
                                .labelStyle(.titleAndIcon)
                        }
                        .buttonStyle(SolidButtonStyle(.surface, size: .small, cornerRadius: 8))
                        .disabled(appState.isLoadingProfile)
                    } else if !appState.isLoggedIn {
                        planLabel("ログイン")
                    }
                }

                if isLoggedInAndActive && isEditingUsername {
                    VStack(alignment: .leading, spacing: 8) {
                        Divider()
                            .overlay(MerkenTheme.borderLight)
                            .padding(.top, 12)

                        HStack {
                            Text("USERNAME")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .tracking(0.8)
                                .foregroundStyle(MerkenTheme.mutedText)
                            Spacer()
                            Text("\(usernameInput.count)/20")
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundStyle(MerkenTheme.mutedText)
                        }

                        MerkenPlaceholderTextField(placeholder: "ユーザー名を入力", text: $usernameInput)
                            .solidTextField(cornerRadius: 10)
                            .font(.system(size: 15, weight: .bold))
                            .onChange(of: usernameInput) { _, newValue in
                                if newValue.count > 20 {
                                    usernameInput = String(newValue.prefix(20))
                                }
                            }

                        if let errorMessage = appState.profileErrorMessage, !errorMessage.isEmpty {
                            Text(errorMessage)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(MerkenTheme.danger)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(MerkenTheme.danger.opacity(0.08), in: .rect(cornerRadius: 8))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(MerkenTheme.danger, lineWidth: 1)
                                )
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
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(SolidButtonStyle(.inverse, size: .small, expands: true, cornerRadius: 9))
                            .disabled(appState.isSavingProfile || usernameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                            Button {
                                isEditingUsername = false
                                usernameInput = appState.username ?? ""
                            } label: {
                                Text("キャンセル")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(SolidButtonStyle(.surface, size: .small, expands: true, cornerRadius: 9))
                            .disabled(appState.isSavingProfile)
                        }
                    }
                }
            }
        }
    }

    private var avatarView: some View {
        ZStack {
            if appState.isLoggedIn {
                LinearGradient(
                    colors: [
                        Color(red: 0.34, green: 0.76, blue: 0.72),
                        Color(red: 0.29, green: 0.43, blue: 0.86)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Text(profileInitial)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
            } else {
                MerkenTheme.surfaceAlt
                Image(systemName: "person")
                    .font(.system(size: 27, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(Circle())
        .overlay(Circle().stroke(MerkenTheme.solidInk, lineWidth: MerkenSolid.borderWidth))
    }

    private var profileInitial: String {
        let source: String
        if let username = appState.username, !username.isEmpty {
            source = username
        } else if let email = appState.session?.email, !email.isEmpty {
            source = email
        } else {
            source = "?"
        }
        return String(source.prefix(1)).uppercased()
    }

    private var profilePrimaryText: String {
        if appState.isLoggedIn {
            if let username = appState.username, !username.isEmpty {
                return username
            }
            return appState.isLoadingProfile ? "読み込み中..." : "ユーザー名未設定"
        }
        return "ゲスト"
    }

    private var profileSecondaryText: String {
        if let email = appState.session?.email, !email.isEmpty {
            return email
        }
        return appState.isLoggedIn ? "クラウド同期中" : "ログインでクラウド同期"
    }

    private var planBadge: some View {
        Group {
            planLabel(appState.isLoggedIn ? (appState.isPro ? "PRO PLAN" : "FREE PLAN") : "GUEST")
        }
    }

    private var accountRows: some View {
        Group {
            planSettingsBlock
        }
    }

    private var supportRows: some View {
        Group {
            settingsNavRow(icon: "doc.text", title: "利用規約") {
                showingTerms = true
            }
            settingsDivider
            settingsNavRow(icon: "shield", title: "プライバシーポリシー") {
                showingPrivacy = true
            }
            settingsDivider
            settingsNavRow(icon: "storefront", title: "特定商取引法に基づく表記") {
                showingTokusho = true
            }
            settingsDivider
            settingsNavRow(icon: "envelope", title: "お問い合わせ") {
                showingContact = true
            }
        }
    }

    private func sectionHeader(title: String) -> some View {
        Text(title)
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .tracking(0.8)
            .foregroundStyle(MerkenTheme.mutedText)
            .padding(.horizontal, 4)
    }

    private var upgradeBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                purchaseProSubscription()
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Text("UPGRADE")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .tracking(0.6)
                                .foregroundStyle(MerkenTheme.accentGreen)
                            Circle()
                                .fill(MerkenTheme.mutedText)
                                .frame(width: 3, height: 3)
                            Text("¥300/月")
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundStyle(MerkenTheme.mutedText)
                        }

                        Text("Pro でぜんぶ使う")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(MerkenTheme.solidInk)

                        Text("スキャン無制限・クラウド同期・デバイス無制限")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                    }

                    Spacer(minLength: 8)

                    Text(isPurchasing ? "処理中" : "見る")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(MerkenTheme.inverseText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .solidSurface(
                            tone: .inverse,
                            depth: .small,
                            cornerRadius: 8,
                            shadowColor: MerkenTheme.accentGreen
                        )
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .solidSurface(
                    tone: .surface,
                    depth: .small,
                    cornerRadius: 12,
                    shadowColor: MerkenTheme.accentGreen
                )
            }
            .buttonStyle(.plain)
            .disabled(isPurchasing || isRestoring)

            if let purchaseErrorMessage {
                Text(purchaseErrorMessage)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(MerkenTheme.danger)
            }

            if let purchaseSuccessMessage {
                Text(purchaseSuccessMessage)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(MerkenTheme.success)
            }
        }
    }

    private var displayRows: some View {
        HStack(spacing: 10) {
            settingsIcon("paintpalette", color: MerkenTheme.solidInk)

            Text("テーマ")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(MerkenTheme.solidInk)

            Spacer(minLength: 8)

            HStack(spacing: 4) {
                ForEach(ThemeMode.allCases, id: \.self) { mode in
                    Button {
                        themeManager.mode = mode
                    } label: {
                        Text(mode.label)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                    }
                    .buttonStyle(
                        SolidButtonStyle(
                            themeManager.mode == mode ? .inverse : .surface,
                            size: .small,
                            cornerRadius: 6
                        )
                    )
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }

    private var logoutButton: some View {
        Button {
            showingSignOutAlert = true
        } label: {
            Text("ログアウト")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(MerkenTheme.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(MerkenTheme.surface, in: .rect(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(MerkenTheme.danger, lineWidth: MerkenSolid.borderWidth)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Username

    private var usernameRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                settingsIcon("person.fill", color: MerkenTheme.accentBlue)

                Text("ユーザー名")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)

                Spacer(minLength: 0)

                if appState.isLoadingProfile || appState.isSavingProfile {
                    ProgressView()
                        .progressViewStyle(.circular)
                }
            }

            if isEditingUsername {
                VStack(alignment: .leading, spacing: 8) {
                    MerkenPlaceholderTextField(placeholder: "ユーザー名を入力", text: $usernameInput)
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
                        }
                        .buttonStyle(SolidButtonStyle(.inverse, size: .small, cornerRadius: 16))
                        .disabled(appState.isSavingProfile || usernameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                        Button {
                            isEditingUsername = false
                            usernameInput = appState.username ?? ""
                        } label: {
                            Text("キャンセル")
                        }
                        .buttonStyle(SolidButtonStyle(.surface, size: .small, cornerRadius: 16))
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
                    .solidSurface(tone: .surfaceAlt, depth: .flat, cornerRadius: 12)
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
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 14) {
                settingsIcon("creditcard.fill", color: MerkenTheme.solidInk)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Merken Pro")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text("¥300/月")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Spacer(minLength: 0)
            }

            if let subscription = appState.subscription,
               let label = subscription.displayDateLabel,
                let displayDate = subscription.displayDateValue {
                let formatted = displayDate.formatted(.dateTime.year().month().day())
                Text("\(label): \(formatted)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
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
                }
                .buttonStyle(SolidButtonStyle(.surface, size: .small, cornerRadius: 14))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }

    private var freePlanBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                settingsIcon("creditcard.fill", color: MerkenTheme.mutedText)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Free プラン")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text("Free - 3回/日スキャン, 50語まで")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
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
                }
                .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 14))
                .disabled(isPurchasing || isRestoring)

                Button {
                    restoreProSubscription()
                } label: {
                    Text(isRestoring ? "復元中..." : "購入を復元")
                }
                .buttonStyle(SolidButtonStyle(.surface, size: .small, expands: true, cornerRadius: 14))
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
            .solidSurface(tone: .surfaceAlt, depth: .small, cornerRadius: 14)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }

    // MARK: - Navigation Row

    private func settingsNavRow(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                settingsIcon(icon, color: MerkenTheme.solidInk)

                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func settingsInfoRow(icon: String, title: String, subtitle: String, trailingText: String) -> some View {
        HStack(spacing: 10) {
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
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }

    private func settingsActionRow(icon: String, title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                settingsIcon(icon, color: color, filled: false)

                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(color)

                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
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

                MerkenPlaceholderTextField(
                    placeholder: "name@example.com",
                    text: $email,
                    keyboardType: .emailAddress,
                    textInputAutocapitalization: .never,
                    disableAutocorrection: true
                )
                .solidTextField()
                .accessibilityIdentifier("emailField")
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("パスワード")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)

                MerkenPlaceholderSecureField(placeholder: "パスワード", text: $password)
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
                }
            }
            .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 16))
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
                .solidSurface(tone: .success, depth: .flat, cornerRadius: 14)
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
        .solidSurface(tone: .warning, depth: .small, cornerRadius: 16)
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
        .solidSurface(tone: .warning, depth: .small, cornerRadius: 16)
    }

    // MARK: - Small Components

    private func settingsIcon(_ name: String, color: Color, filled: Bool = false) -> some View {
        Image(systemName: name)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(filled ? Color.white : color)
            .frame(width: 26, height: 26)
            .solidSurface(
                tone: filled ? .inverse : .surfaceAlt,
                depth: .flat,
                cornerRadius: 7,
                borderColor: color.opacity(filled ? 1 : 0.45)
            )
    }

    private var proChip: some View {
        HStack(spacing: 3) {
            Image(systemName: "sparkles")
                .font(.system(size: 9, weight: .bold))
            Text("Pro")
                .font(.system(size: 11, weight: .bold))
        }
        .foregroundStyle(MerkenTheme.inverseText)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .solidSurface(tone: .inverse, depth: .flat, cornerRadius: 12)
    }

    private func planLabel(_ text: String) -> some View {
        HStack(spacing: 4) {
            if text != "GUEST" && text != "ログイン" {
                Image(systemName: "sparkles")
                    .font(.system(size: 9, weight: .bold))
            }
            Text(text)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .tracking(0.5)
        }
        .foregroundStyle(text == "GUEST" ? MerkenTheme.mutedText : .white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .solidSurface(tone: text == "GUEST" ? .surfaceAlt : .inverse, depth: .flat, cornerRadius: 4)
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
            .foregroundStyle(MerkenTheme.accentGreen)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .solidSurface(tone: .surfaceAlt, depth: .flat, cornerRadius: 12)
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
