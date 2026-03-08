import SwiftUI

struct ContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SolidCard {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("MERKENに関するご質問、不具合のご報告、ご要望などがございましたら、以下のメールアドレスまでお気軽にご連絡ください。")
                                    .font(.body)
                                    .foregroundStyle(MerkenTheme.primaryText)
                                    .lineSpacing(4)

                                Button {
                                    openURL(URL(string: "mailto:support@merken.jp")!)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "envelope.fill")
                                            .font(.body)
                                            .foregroundStyle(MerkenTheme.accentBlue)
                                            .frame(width: 40, height: 40)
                                            .background(MerkenTheme.accentBlueLight, in: .circle)

                                        Text("support@merken.jp")
                                            .font(.headline)
                                            .foregroundStyle(MerkenTheme.primaryText)

                                        Spacer()
                                    }
                                    .padding(14)
                                    .background(MerkenTheme.accentBlue.opacity(0.06), in: .rect(cornerRadius: 16))
                                }

                                Text("通常2営業日以内にご返信いたします。")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 16)
            }
        }
        .navigationTitle("お問い合わせ")
        .navigationBarTitleDisplayMode(.inline)
    }
}
