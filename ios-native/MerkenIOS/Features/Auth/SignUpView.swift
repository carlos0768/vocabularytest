import SwiftUI

struct SignUpView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showOTPView = false
    @State private var validationError: String?

    private var isSubmitDisabled: Bool {
        appState.isSigningUp
            || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || password.isEmpty
            || confirmPassword.isEmpty
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack {
                        closeButton

                        Spacer()

                        Text("1/2")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    .padding(.top, 6)

                    VStack(spacing: 8) {
                        HStack(alignment: .firstTextBaseline, spacing: 7) {
                            Text("MERKEN")
                                .font(.system(size: 34, weight: .black))
                                .tracking(5)
                            Rectangle()
                                .fill(MerkenTheme.accentGreen)
                                .frame(width: 5, height: 5)
                        }
                        .foregroundStyle(MerkenTheme.solidInk)

                        Text("単語を覚えるためのノート")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("新規登録")
                            .font(.system(size: 27, weight: .black))
                            .foregroundStyle(MerkenTheme.solidInk)

                        Text("メールアドレスとパスワードでアカウントを作成します。")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineSpacing(2)
                    }

                    VStack(alignment: .leading, spacing: 13) {
                        authField(label: "メールアドレス") {
                            MerkenPlaceholderTextField(
                                placeholder: "kenta@example.com",
                                text: $email,
                                keyboardType: .emailAddress,
                                textInputAutocapitalization: .never,
                                disableAutocorrection: true
                            )
                        }

                        authField(label: "パスワード") {
                            MerkenPlaceholderSecureField(placeholder: "8文字以上", text: $password)
                        }

                        authField(label: "パスワード（確認）") {
                            MerkenPlaceholderSecureField(placeholder: "もう一度入力", text: $confirmPassword)
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
                                Text(appState.isSigningUp ? "送信中..." : "認証コードを送信")
                                    .font(.system(size: 16, weight: .black))
                            }
                        }
                        .disabled(isSubmitDisabled)
                        .opacity(isSubmitDisabled ? 0.45 : 1)
                        .buttonStyle(PrimaryGlassButton())
                    }

                    HStack(spacing: 12) {
                        Rectangle().fill(MerkenTheme.border).frame(height: 1)
                        Text("または")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Rectangle().fill(MerkenTheme.border).frame(height: 1)
                    }

                    Button {
                        dismiss()
                    } label: {
                        Label("ログインする", systemImage: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                    }
                    .buttonStyle(GhostGlassButton())

                    HStack(spacing: 6) {
                        Text("登録後に認証コードをメールで送信します。")
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .font(.system(size: 12, weight: .medium))
                    .frame(maxWidth: .infinity, alignment: .center)
                }
                .padding(.horizontal, 22)
                .padding(.top, 12)
                .padding(.bottom, 36)
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
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(MerkenTheme.solidInk)
                .frame(width: 40, height: 40)
                .background(MerkenTheme.surface, in: Circle())
                .overlay(Circle().stroke(MerkenTheme.solidInk, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private func authField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(MerkenTheme.secondaryText)

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
