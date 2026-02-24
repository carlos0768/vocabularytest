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

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Header
                        VStack(alignment: .leading, spacing: 6) {
                            Text("アカウント登録")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                            Text("メールアドレスで新規登録")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                        .padding(.top, 8)

                        // Form
                        SolidCard {
                            VStack(alignment: .leading, spacing: 12) {
                                TextField("メールアドレス", text: $email)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .solidTextField()

                                SecureField("パスワード（8文字以上）", text: $password)
                                    .solidTextField()

                                SecureField("パスワード（確認）", text: $confirmPassword)
                                    .solidTextField()

                                if let error = validationError {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundStyle(MerkenTheme.warning)
                                }

                                if let error = appState.signUpErrorMessage {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundStyle(MerkenTheme.warning)
                                }

                                Button {
                                    submitForm()
                                } label: {
                                    HStack(spacing: 8) {
                                        if appState.isSigningUp {
                                            ProgressView()
                                                .tint(.white)
                                        }
                                        Text(appState.isSigningUp ? "送信中..." : "認証コードを送信")
                                    }
                                }
                                .disabled(appState.isSigningUp)
                                .opacity(appState.isSigningUp ? 0.7 : 1)
                                .buttonStyle(PrimaryGlassButton())
                            }
                        }

                        // Login link
                        HStack(spacing: 4) {
                            Text("アカウントをお持ちの方は")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.mutedText)
                            Button("ログイン") {
                                dismiss()
                            }
                            .font(.subheadline.bold())
                            .foregroundStyle(MerkenTheme.accentBlue)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                    .padding(16)
                }
                .scrollIndicators(.hidden)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") {
                        dismiss()
                    }
                    .foregroundStyle(MerkenTheme.mutedText)
                }
            }
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
