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
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    closeButton
                        .padding(.top, 6)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("アカウント登録")
                            .font(.system(size: 34, weight: .black))
                            .foregroundStyle(MerkenTheme.primaryText)

                        Text("メールアドレスで登録して、単語帳と学習データを同期します。")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineSpacing(2)
                    }

                    VStack(alignment: .leading, spacing: 18) {
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

                        Text("登録後に認証コードをメールで送信します。")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)

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
                                Text(appState.isSigningUp ? "送信中..." : "認証コードを送信")
                                    .font(.system(size: 16, weight: .bold))
                            }
                        }
                        .disabled(appState.isSigningUp)
                        .opacity(appState.isSigningUp ? 0.7 : 1)
                        .buttonStyle(PrimaryGlassButton())
                    }
                    .padding(22)
                    .background(MerkenTheme.surface.opacity(0.98), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(MerkenTheme.border.opacity(0.7), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.04), radius: 12, y: 8)

                    HStack(spacing: 6) {
                        Text("すでにアカウントをお持ちですか？")
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Button("ログイン") {
                            dismiss()
                        }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                    }
                    .font(.system(size: 15, weight: .medium))
                    .frame(maxWidth: .infinity, alignment: .center)
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
