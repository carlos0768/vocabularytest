import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @State private var email = ""
    @State private var password = ""
    @State private var showingBookshelf = false

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("設定")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Account card
                        accountCard

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

                        // Login or logged-in section
                        if appState.isLoggedIn && !appState.isSessionExpired {
                            // Bookshelf link
                            if appState.isPro {
                                Button {
                                    showingBookshelf = true
                                } label: {
                                    SolidPane {
                                        HStack(spacing: 12) {
                                            IconBadge(systemName: "books.vertical.fill", color: MerkenTheme.warning, size: 40)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text("本棚")
                                                    .font(.headline)
                                                    .foregroundStyle(MerkenTheme.primaryText)
                                                Text("単語帳をまとめて管理")
                                                    .font(.caption)
                                                    .foregroundStyle(MerkenTheme.mutedText)
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.caption)
                                                .foregroundStyle(MerkenTheme.mutedText)
                                        }
                                    }
                                }
                            }

                            // Display section
                            displaySection

                            // Plan section
                            planSection

                            // Sign out
                            Button("サインアウト", role: .destructive) {
                                Task {
                                    await appState.signOut()
                                }
                            }
                            .buttonStyle(GhostGlassButton())
                        } else {
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
    }

    // MARK: - Account Card

    private var accountCard: some View {
        SolidCard {
            HStack(spacing: 14) {
                // Avatar icon
                Image(systemName: "envelope.fill")
                    .font(.title2)
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 56, height: 56)
                    .background(MerkenTheme.accentBlueLight, in: .circle)

                VStack(alignment: .leading, spacing: 4) {
                    Text(appState.session?.email ?? "未ログイン")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)

                    if appState.isPro {
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
                }

                Spacer()
            }
        }
    }

    // MARK: - Display Section

    private var displaySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("表示")
                .font(.subheadline.bold())
                .foregroundStyle(MerkenTheme.mutedText)

            SolidCard {
                HStack {
                    Text("テーマ")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)

                    Spacer()

                    // Segmented control
                    HStack(spacing: 0) {
                        themeOption("ライト", isSelected: true)
                        themeOption("ダーク", isSelected: false)
                        themeOption("システム", isSelected: false)
                    }
                    .background(MerkenTheme.surfaceAlt, in: .capsule)
                }
            }
        }
    }

    private func themeOption(_ label: String, isSelected: Bool) -> some View {
        Text(label)
            .font(.subheadline.bold())
            .foregroundStyle(isSelected ? .white : MerkenTheme.secondaryText)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                isSelected ? MerkenTheme.accentBlue : Color.clear,
                in: .capsule
            )
            .shadow(color: isSelected ? MerkenTheme.accentBlue.opacity(0.3) : .clear, radius: 4, x: 0, y: 2)
    }

    // MARK: - Plan Section

    private var planSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("プラン")
                .font(.subheadline.bold())
                .foregroundStyle(MerkenTheme.mutedText)

            SolidCard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
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

                        Spacer()

                        Text("¥500/月")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                    }

                    Divider()

                    planRow(label: "スキャン", value: "無制限", valueColor: MerkenTheme.success, checkmark: true)
                    Divider()
                    planRow(label: "単語数", value: "1000語（無制限）", valueColor: MerkenTheme.primaryText, checkmark: false)
                    Divider()
                    planRow(label: "保存", value: "クラウド同期中", valueColor: MerkenTheme.accentBlue, checkmark: false, icon: "cloud")
                    Divider()
                    Text("次回更新: 2026/2/24")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)

                    Text("現在のProは課金サブスクリプションではないため、解約操作は不要です。")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .padding(12)
                        .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 16))
                }
            }
        }
    }

    private func planRow(label: String, value: String, valueColor: Color, checkmark: Bool, icon: String? = nil) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
            Spacer()
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.caption)
                        .foregroundStyle(valueColor)
                }
                Text(value)
                    .font(.subheadline.bold())
                    .foregroundStyle(valueColor)
                if checkmark {
                    Image(systemName: "checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(valueColor)
                }
            }
        }
    }

    // MARK: - Login Section

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
}
