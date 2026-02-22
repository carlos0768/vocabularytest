import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var themeManager: ThemeManager

    @State private var email = ""
    @State private var password = ""
    @State private var showingBookshelf = false
    @State private var supportURL: URL?

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                HStack(alignment: .top) {
                    Text("設定")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // 1. Account card
                        accountCard

                        // Error / session expired messages
                        if appState.isSessionExpired {
                            SolidCard {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label("セッション期限切れ", systemImage: "exclamationmark.triangle.fill")
                                        .foregroundStyle(MerkenTheme.warning)
                                        .font(.headline)
                                    Text("再ログインしてください。")
                                        .font(.subheadline)
                                        .foregroundStyle(MerkenTheme.secondaryText)
                                }
                            }
                        }

                        if let message = appState.authErrorMessage, !appState.isSessionExpired {
                            SolidCard {
                                Text(message)
                                    .foregroundStyle(MerkenTheme.warning)
                            }
                        }

                        if appState.isLoggedIn && !appState.isSessionExpired {
                            // 2. Display section
                            displaySection

                            // 3. Plan section
                            planSection

                            // 4. Support section
                            supportSection

                            // 5. Sign out
                            signOutButton

                            // 6. Version
                            versionLabel
                        } else {
                            // Login form
                            loginSection
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $showingBookshelf) {
            BookshelfTabView()
        }
        .sheet(item: $supportURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
        }
    }

    // MARK: - 1. Account Card

    private var accountCard: some View {
        SolidCard {
            if appState.isLoggedIn {
                HStack(spacing: 14) {
                    // Mail icon
                    Image(systemName: "envelope.fill")
                        .font(.title2)
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .frame(width: 48, height: 48)
                        .background(MerkenTheme.accentBlueLight, in: .circle)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(appState.session?.email ?? "")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                            .lineLimit(1)
                            .truncationMode(.tail)

                        if appState.isPro {
                            proChip
                        } else {
                            Text("Free")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                    }

                    Spacer()
                }
            } else {
                HStack(spacing: 14) {
                    // Guest icon
                    Image(systemName: "person.fill")
                        .font(.title2)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(width: 48, height: 48)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1))

                    VStack(alignment: .leading, spacing: 2) {
                        Text("ゲスト")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("ログインでクラウド同期")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }

                    Spacer()
                }
            }
        }
    }

    // MARK: - 2. Display Section

    private var displaySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("表示")

            SolidCard {
                HStack {
                    Text("テーマ")
                        .font(.body.weight(.medium))
                        .foregroundStyle(MerkenTheme.primaryText)

                    Spacer()

                    if #available(iOS 26.0, *) {
                        Picker("テーマ", selection: Binding(
                            get: { themeManager.mode },
                            set: { themeManager.mode = $0 }
                        )) {
                            ForEach(ThemeMode.allCases, id: \.rawValue) { mode in
                                Text(mode.label).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .glassEffect(.regular.interactive())
                        .frame(maxWidth: 220)
                    } else {
                        HStack(spacing: 0) {
                            ForEach(ThemeMode.allCases, id: \.rawValue) { mode in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        themeManager.mode = mode
                                    }
                                } label: {
                                    themeOption(mode.label, isSelected: themeManager.mode == mode)
                                }
                            }
                        }
                        .padding(3)
                        .background(MerkenTheme.background, in: .capsule)
                        .overlay(Capsule().stroke(MerkenTheme.borderLight, lineWidth: 1))
                    }
                }
            }
        }
    }

    private func themeOption(_ label: String, isSelected: Bool) -> some View {
        Text(label)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(isSelected ? .white : MerkenTheme.mutedText)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                isSelected ? MerkenTheme.accentBlue : Color.clear,
                in: .capsule
            )
    }

    // MARK: - 3. Plan Section

    private var planSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("プラン")

            if appState.isPro {
                proPlanCard
            } else {
                freePlanCard
            }
        }
    }

    private var proPlanCard: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 14) {
                // Header: Pro badge + price
                HStack {
                    proChip
                    Spacer()
                    Text("¥500/月")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                }

                Divider()

                // Scan
                planRow(
                    label: "スキャン",
                    valueText: "無制限",
                    valueColor: MerkenTheme.success,
                    icon: nil,
                    showCheckmark: true
                )
                Divider()

                // Word count
                planRow(
                    label: "単語数",
                    valueText: "無制限",
                    valueColor: MerkenTheme.primaryText,
                    icon: nil,
                    showCheckmark: false
                )
                Divider()

                // Storage
                planRow(
                    label: "保存",
                    valueText: "クラウド同期中",
                    valueColor: MerkenTheme.accentBlue,
                    icon: "cloud.fill",
                    showCheckmark: false
                )
                Divider()

                // Renewal date
                if let periodEnd = appState.subscription?.currentPeriodEnd {
                    let formatted = periodEnd.formatted(.dateTime.year().month().day())
                    Text("次回更新: \(formatted)")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                // Non-billing note
                Text("現在のProは課金サブスクリプションではないため、解約操作は不要です。")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 16))
            }
        }
    }

    private var freePlanCard: some View {
        VStack(spacing: 14) {
            // Current plan
            SolidCard {
                VStack(alignment: .leading, spacing: 14) {
                    // Header
                    Text("Free")
                        .font(.headline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)

                    Divider()

                    // Scan
                    planRow(
                        label: "スキャン",
                        valueText: "3回/日",
                        valueColor: MerkenTheme.primaryText,
                        icon: nil,
                        showCheckmark: false
                    )
                    Divider()

                    // Word count
                    planRow(
                        label: "単語数",
                        valueText: "50語まで",
                        valueColor: MerkenTheme.primaryText,
                        icon: nil,
                        showCheckmark: false
                    )
                    Divider()

                    // Storage
                    planRow(
                        label: "保存",
                        valueText: "このデバイスのみ",
                        valueColor: MerkenTheme.mutedText,
                        icon: "iphone",
                        showCheckmark: false
                    )
                }
            }

            // Upgrade card
            upgradeCard
        }
    }

    private var upgradeCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                proChip
                Text("にアップグレード")
                    .font(.headline.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
            }

            VStack(alignment: .leading, spacing: 8) {
                upgradeRow("スキャン無制限")
                upgradeRow("単語数無制限")
                upgradeRow("クラウド同期")
            }

            Button {
                // TODO: Navigate to subscription
            } label: {
                Text("¥500/月で始める")
            }
            .buttonStyle(PrimaryGlassButton())
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [MerkenTheme.accentBlueLight, MerkenTheme.accentBlue.opacity(0.1)],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: .rect(cornerRadius: 20)
        )
    }

    private func upgradeRow(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark")
                .font(.caption.bold())
                .foregroundStyle(MerkenTheme.success)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }

    private func planRow(label: String, valueText: String, valueColor: Color, icon: String?, showCheckmark: Bool) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.mutedText)
            Spacer()
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.caption)
                        .foregroundStyle(valueColor)
                }
                Text(valueText)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(valueColor)
                if showCheckmark {
                    Image(systemName: "checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(valueColor)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - 4. Support Section

    private var supportSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("サポート")

            SolidCard {
                VStack(spacing: 0) {
                    supportRow("お問い合わせ") {
                        supportURL = URL(string: "https://merken.app/contact")
                    }
                    Divider().padding(.horizontal, 4)
                    supportRow("利用規約") {
                        supportURL = URL(string: "https://merken.app/terms")
                    }
                    Divider().padding(.horizontal, 4)
                    supportRow("プライバシーポリシー") {
                        supportURL = URL(string: "https://merken.app/privacy")
                    }
                }
            }
        }
    }

    private func supportRow(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label)
                    .font(.body.weight(.medium))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 14)
        }
    }

    // MARK: - 5. Sign Out

    private var signOutButton: some View {
        Button {
            Task {
                await appState.signOut()
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.body)
                Text("ログアウト")
                    .font(.body.weight(.medium))
            }
            .foregroundStyle(MerkenTheme.mutedText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }

    // MARK: - 6. Version

    private var versionLabel: some View {
        Text("v1.0.0")
            .font(.subheadline)
            .foregroundStyle(MerkenTheme.mutedText)
            .frame(maxWidth: .infinity)
    }

    // MARK: - Login Section (Guest)

    private var loginSection: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("ログイン")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)

                TextField("メールアドレス", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .solidTextField()
                    .accessibilityIdentifier("emailField")

                SecureField("パスワード", text: $password)
                    .solidTextField()
                    .accessibilityIdentifier("passwordField")

                Button {
                    Task {
                        await appState.signIn(email: email, password: password)
                    }
                } label: {
                    Text(appState.isSigningIn ? "サインイン中..." : "サインイン")
                }
                .overlay {
                    if appState.isSigningIn {
                        ProgressView()
                            .tint(.white)
                    }
                }
                .disabled(appState.isSigningIn)
                .opacity(appState.isSigningIn ? 0.7 : 1)
                .buttonStyle(PrimaryGlassButton())
                .accessibilityIdentifier("signInButton")
            }
        }
    }

    // MARK: - Shared Components

    private var proChip: some View {
        HStack(spacing: 4) {
            Image(systemName: "sparkles")
                .font(.caption2)
            Text("Pro")
                .font(.caption.bold())
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(MerkenTheme.accentBlue, in: .capsule)
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(MerkenTheme.mutedText)
            .textCase(.uppercase)
            .tracking(1)
            .padding(.horizontal, 4)
    }
}
