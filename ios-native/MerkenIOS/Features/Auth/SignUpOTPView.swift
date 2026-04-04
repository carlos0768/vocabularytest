import SwiftUI

struct SignUpOTPView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let email: String
    let password: String
    let onComplete: () -> Void

    @State private var otpCode = ""
    @State private var resendCooldown = 60
    @State private var cooldownTimer: Timer?

    var body: some View {
        ZStack {
            AppBackground()
            authBackgroundAccent

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 18) {
                        authEyebrow(icon: "number.circle.fill", text: "Verify Email")

                        Text("認証コード入力")
                            .font(.system(size: 36, weight: .black))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("\(email) に6桁のコードを送信しました")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineSpacing(3)
                    }
                    .padding(.top, 8)

                    authCard(title: "コードを確認", subtitle: "届いた6桁の数字を入力してください。") {
                        VStack(alignment: .leading, spacing: 14) {
                            authField(label: "認証コード", systemImage: "number") {
                                MerkenPlaceholderTextField(
                                    placeholder: "6桁の認証コード",
                                    text: $otpCode,
                                    keyboardType: .numberPad,
                                    textInputAutocapitalization: .never,
                                    disableAutocorrection: true
                                )
                                .onChange(of: otpCode) { _, newValue in
                                    let filtered = newValue.filter(\.isNumber)
                                    if filtered.count > 6 {
                                        otpCode = String(filtered.prefix(6))
                                    } else if filtered != newValue {
                                        otpCode = filtered
                                    }
                                }
                                .solidTextField()
                            }

                            if let error = appState.signUpErrorMessage {
                                authErrorBanner(error)
                            }

                            Button {
                                verifyOTP()
                            } label: {
                                HStack(spacing: 8) {
                                    if appState.isSigningUp {
                                        ProgressView()
                                            .tint(.white)
                                    }
                                    Text(appState.isSigningUp ? "作成中..." : "アカウントを作成")
                                }
                            }
                            .disabled(appState.isSigningUp || otpCode.count != 6)
                            .opacity((appState.isSigningUp || otpCode.count != 6) ? 0.7 : 1)
                            .buttonStyle(PrimaryGlassButton())
                        }
                    }

                    authCard(title: "メールが届かない場合", subtitle: "再送信かメールアドレス変更を選べます。") {
                        VStack(spacing: 12) {
                        if resendCooldown > 0 {
                            Text("再送信まで \(resendCooldown)秒")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.vertical, 12)
                                .background(MerkenTheme.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        } else {
                            Button("認証コードを再送信") {
                                resendOTP()
                            }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .disabled(appState.isSigningUp)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 12)
                            .background(MerkenTheme.accentBlue.opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }

                        Button("メールアドレスを変更") {
                            dismiss()
                        }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    dismiss()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                        Text("戻る")
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
        .onAppear {
            startCooldownTimer()
        }
        .onDisappear {
            cooldownTimer?.invalidate()
            cooldownTimer = nil
        }
    }

    private var authBackgroundAccent: some View {
        LinearGradient(
            colors: [
                MerkenTheme.success.opacity(0.08),
                .clear,
                MerkenTheme.accentBlue.opacity(0.06)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
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

    private func verifyOTP() {
        appState.signUpErrorMessage = nil

        Task {
            let success = await appState.verifySignUpOTP(
                email: email,
                code: otpCode,
                password: password
            )
            if success {
                onComplete()
            }
        }
    }

    private func resendOTP() {
        appState.signUpErrorMessage = nil

        Task {
            let success = await appState.sendSignUpOTP(email: email)
            if success {
                resendCooldown = 60
                startCooldownTimer()
            }
        }
    }

    private func startCooldownTimer() {
        cooldownTimer?.invalidate()
        cooldownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                if resendCooldown > 0 {
                    resendCooldown -= 1
                } else {
                    cooldownTimer?.invalidate()
                    cooldownTimer = nil
                }
            }
        }
    }
}
