import SwiftUI

struct LoginGateView: View {
    let icon: String
    let title: String
    let message: String
    var buttonTitle: String = "設定でログイン・登録"
    let onLogin: () -> Void

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 24) {
                Spacer()

                // Icon
                Image(systemName: icon)
                    .font(.system(size: 48))
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 96, height: 96)
                    .background(MerkenTheme.accentBlueLight, in: .circle)

                // Text
                VStack(spacing: 8) {
                    Text(title)
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)

                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                // Login button
                Button {
                    onLogin()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .font(.body.weight(.medium))
                        Text(buttonTitle)
                    }
                }
                .buttonStyle(PrimaryGlassButton())
                .padding(.horizontal, 48)

                Text("ログインと新規登録は設定画面にまとめています。")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()
            }
        }
    }
}
