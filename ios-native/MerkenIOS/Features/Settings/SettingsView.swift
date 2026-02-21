import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                GlassEffectContainer(spacing: 12) {
                VStack(alignment: .leading, spacing: 14) {
                    modeCard

                    if appState.isSessionExpired {
                        GlassCard {
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
                        GlassCard {
                            Text(message)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    if appState.isLoggedIn && !appState.isSessionExpired {
                        loggedInSection
                    } else {
                        loginSection
                    }
                }
                .padding(16)
                } // GlassEffectContainer
            }
        }
        .navigationTitle("設定")
    }

    private var modeCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("現在の保存モード")
                    .font(.headline)
                Text(appState.canUseCloud ? "Pro Cloud (Supabase)" : "Guest Local (SwiftData)")
                    .font(.title3.bold())
                    .foregroundStyle(appState.canUseCloud ? MerkenTheme.success : MerkenTheme.accentBlue)

                Text(appState.isLoggedIn ? "認証状態: ログイン済み" : "認証状態: 未ログイン")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)

                Text("Active User ID: \(appState.activeUserId)")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .lineLimit(1)
            }
        }
    }

    private var loginSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("ログイン")
                    .font(.headline)

                TextField("メールアドレス", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .rect(cornerRadius: 12))
                    .accessibilityIdentifier("emailField")

                SecureField("パスワード", text: $password)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .rect(cornerRadius: 12))
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

    private var loggedInSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("アカウント")
                    .font(.headline)

                Text(appState.session?.email ?? "メールアドレス未設定")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)

                Button("サインアウト", role: .destructive) {
                    Task {
                        await appState.signOut()
                    }
                }
                .buttonStyle(GhostGlassButton())
            }
        }
    }
}
