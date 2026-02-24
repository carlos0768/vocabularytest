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

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 6) {
                        Text("認証コード入力")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("\(email) に6桁のコードを送信しました")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .padding(.top, 8)

                    // OTP Input
                    SolidCard {
                        VStack(alignment: .leading, spacing: 12) {
                            TextField("6桁の認証コード", text: $otpCode)
                                .keyboardType(.numberPad)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .solidTextField()
                                .onChange(of: otpCode) { _, newValue in
                                    // Limit to 6 digits
                                    let filtered = newValue.filter(\.isNumber)
                                    if filtered.count > 6 {
                                        otpCode = String(filtered.prefix(6))
                                    } else if filtered != newValue {
                                        otpCode = filtered
                                    }
                                }

                            if let error = appState.signUpErrorMessage {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.warning)
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

                    // Resend / Change email
                    VStack(spacing: 12) {
                        if resendCooldown > 0 {
                            Text("再送信まで \(resendCooldown)秒")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.mutedText)
                                .frame(maxWidth: .infinity, alignment: .center)
                        } else {
                            Button("認証コードを再送信") {
                                resendOTP()
                            }
                            .font(.subheadline.bold())
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .disabled(appState.isSigningUp)
                            .frame(maxWidth: .infinity, alignment: .center)
                        }

                        Button("メールアドレスを変更") {
                            dismiss()
                        }
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
                .padding(16)
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
