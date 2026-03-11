import SwiftUI

struct SignUpView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showOTPView = false
    @State private var validationError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()
                authBackgroundAccent

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        closeButton
                            .padding(.top, 6)

                        VStack(alignment: .leading, spacing: 18) {
                            authEyebrow(icon: "person.badge.plus", text: "Create Account")

                            Text("アカウント登録")
                                .font(.system(size: 38, weight: .black))
                                .foregroundStyle(MerkenTheme.primaryText)

                            Text("メールアドレスで新規登録して、同期と復習データをそのまま引き継ぎます。")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .lineSpacing(3)

                            HStack(spacing: 10) {
                                authInfoChip(icon: "icloud.fill", text: "クラウド同期")
                                authInfoChip(icon: "sparkles", text: "進捗を保持")
                            }
                        }

                        authCard(title: "新規登録", subtitle: "最初に認証コードを送信します。") {
                            VStack(alignment: .leading, spacing: 14) {
                                authField(label: "メールアドレス", systemImage: "envelope") {
                                    TextField("name@example.com", text: $email)
                                        .keyboardType(.emailAddress)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                }

                                authField(label: "パスワード", systemImage: "lock") {
                                    SecureField("8文字以上で入力", text: $password)
                                }

                                authField(label: "パスワード確認", systemImage: "checkmark.shield") {
                                    SecureField("もう一度入力", text: $confirmPassword)
                                }

                                if let error = validationError {
                                    authErrorBanner(error)
                                }

                                if let error = appState.signUpErrorMessage {
                                    authErrorBanner(error)
                                }

                                Button {
                                    submitForm()
                                } label: {
                                    HStack(spacing: 10) {
                                        if appState.isSigningUp {
                                            ProgressView()
                                                .tint(.white)
                                        }
                                        Image(systemName: "paperplane.fill")
                                        Text(appState.isSigningUp ? "送信中..." : "認証コードを送信")
                                            .font(.system(size: 16, weight: .bold))
                                    }
                                }
                                .disabled(appState.isSigningUp)
                                .opacity(appState.isSigningUp ? 0.7 : 1)
                                .buttonStyle(PrimaryGlassButton())
                            }
                        }

                        authCard(title: "すでにアカウントをお持ちですか？", subtitle: "設定画面のサインインに移動します。") {
                            Button {
                                dismiss()
                                appState.selectedTab = 4
                            } label: {
                                HStack {
                                    Text("ログインへ進む")
                                        .font(.system(size: 15, weight: .bold))
                                    Spacer()
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 14, weight: .bold))
                                }
                                .foregroundStyle(MerkenTheme.accentBlue)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(MerkenTheme.accentBlue.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 28)
                }
                .scrollIndicators(.hidden)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $showOTPView) {
                SignUpOTPView(
                    email: email,
                    password: password,
                    onComplete: {
                        dismiss()
                    }
                )
                .environmentObject(appState)
            }
        }
    }

    private var authBackgroundAccent: some View {
        ZStack {
            LinearGradient(
                colors: [
                    MerkenTheme.accentBlue.opacity(0.10),
                    .clear,
                    MerkenTheme.warning.opacity(0.06)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(MerkenTheme.accentBlue.opacity(0.08))
                .frame(width: 260, height: 260)
                .blur(radius: 10)
                .offset(x: 130, y: -280)
        }
    }

    private var closeButton: some View {
        Button {
            dismiss()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                Text("閉じる")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(MerkenTheme.mutedText)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(MerkenTheme.surface.opacity(0.9), in: Capsule())
            .overlay(
                Capsule()
                    .stroke(MerkenTheme.borderLight, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func authEyebrow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
            Text(text)
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(MerkenTheme.accentBlue)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(MerkenTheme.accentBlue.opacity(0.10), in: Capsule())
    }

    private func authInfoChip(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(text)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(MerkenTheme.primaryText)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(MerkenTheme.surface, in: Capsule())
        .overlay(
            Capsule()
                .stroke(MerkenTheme.borderLight, lineWidth: 1)
        )
    }

    private func authCard<Content: View>(title: String, subtitle: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            content()
        }
        .padding(20)
        .background(MerkenTheme.surface.opacity(0.96), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(MerkenTheme.border.opacity(0.8), lineWidth: 1.2)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 16, y: 10)
    }

    private func authField<Content: View>(label: String, systemImage: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.accentBlue)
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            content()
                .solidTextField()
        }
    }

    private func authErrorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(MerkenTheme.warning)
            Text(message)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(MerkenTheme.warning.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(MerkenTheme.warning.opacity(0.24), lineWidth: 1)
        )
    }

    private func submitForm() {
        validationError = nil
        appState.signUpErrorMessage = nil

        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedConfirm = confirmPassword.trimmingCharacters(in: .whitespacesAndNewlines)

        // Email validation
        guard !trimmedEmail.isEmpty else {
            validationError = "メールアドレスを入力してください。"
            return
        }
        guard trimmedEmail.contains("@") && trimmedEmail.contains(".") else {
            validationError = "有効なメールアドレスを入力してください。"
            return
        }

        // Password validation
        guard trimmedPassword.count >= 8 else {
            validationError = "パスワードは8文字以上で入力してください。"
            return
        }
        guard trimmedPassword == trimmedConfirm else {
            validationError = "パスワードが一致しません。"
            return
        }

        Task {
            let success = await appState.sendSignUpOTP(email: trimmedEmail)
            if success {
                showOTPView = true
            }
        }
    }
}
