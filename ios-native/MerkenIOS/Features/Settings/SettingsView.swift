import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            AppBackground()

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
        .navigationTitle("設定")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Account Card

    private var accountCard: some View {
        SolidCard {
            HStack(spacing: 14) {
                // Avatar icon
                Image(systemName: "envelope.fill")
                    .font(.title2)
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 52, height: 52)
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
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(isSelected ? MerkenTheme.accentBlue : Color.clear, in: .capsule)
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
                        .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 12))
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
