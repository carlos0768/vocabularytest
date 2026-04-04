import SwiftUI

struct PrivacyView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SolidCard {
                            VStack(alignment: .leading, spacing: 24) {
                                Text("最終更新日: 2026年2月24日")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.mutedText)

                                privacySection("1. はじめに",
                                    "MERKEN（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本ポリシーは、本サービスにおける個人情報の取り扱いについて定めます。")

                                privacySectionWithBullets("2. 収集する情報",
                                    preamble: "本サービスでは以下の情報を収集します。",
                                    items: [
                                        ("アカウント情報", "メールアドレス、パスワード（暗号化済み）"),
                                        ("学習データ", "作成した単語帳、クイズの回答履歴、学習進捗"),
                                        ("アップロード画像", "単語抽出のために送信された画像（処理後、サーバーには保存しません）"),
                                        ("決済情報", "有料プラン利用時の決済情報（Stripeが処理し、本サービスではカード情報等を保持しません）")
                                    ])

                                privacySectionWithSimpleBullets("3. 情報の利用目的",
                                    preamble: "収集した情報は以下の目的で利用します。",
                                    items: [
                                        "サービスの提供・運営",
                                        "ユーザーの学習データの保存・同期",
                                        "サービスの改善・新機能の開発",
                                        "お問い合わせへの対応",
                                        "利用規約違反への対応"
                                    ])

                                privacySectionWithLabeledBullets("4. 第三者サービス",
                                    preamble: "本サービスでは以下の第三者サービスを利用しています。",
                                    items: [
                                        ("Supabase", "認証・データベース"),
                                        ("OpenAI", "画像解析・単語抽出"),
                                        ("Stripe", "決済処理"),
                                        ("Vercel", "ホスティング")
                                    ],
                                    footer: "各サービスのプライバシーポリシーについては、各社のサイトをご確認ください。")

                                privacySection("5. 画像データの取り扱い",
                                    "ユーザーがアップロードした画像は、単語抽出処理のためにOpenAI APIに送信されます。処理完了後、画像データは本サービスのサーバーには保存されません。OpenAIのデータ取り扱いについてはOpenAIのプライバシーポリシーをご確認ください。")

                                privacySectionWithBullets("6. データの保存",
                                    preamble: nil,
                                    items: [
                                        ("無料プラン", "データはユーザーのブラウザ（IndexedDB）にローカル保存されます。サーバーには送信されません。"),
                                        ("Proプラン", "データはSupabase（クラウド）に保存され、デバイス間で同期されます。")
                                    ])

                                privacySection("7. データの削除",
                                    "ユーザーはいつでも自身のデータを削除できます。アカウント削除をご希望の場合は、お問い合わせください。アカウント削除時にはすべての関連データを削除します。")

                                privacySection("8. セキュリティ",
                                    "本サービスは、個人情報の漏洩・紛失を防ぐために適切なセキュリティ対策を講じています。通信はすべてSSL/TLSにより暗号化されています。")

                                privacySection("9. ポリシーの変更",
                                    "本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は、サービス内で通知します。")

                                privacySection("10. お問い合わせ",
                                    "プライバシーに関するお問い合わせは、support@merken.jp までご連絡ください。")
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 16)
                }
        }
        .navigationTitle("プライバシーポリシー")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func privacySection(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineSpacing(4)
        }
    }

    private func privacySectionWithBullets(_ title: String, preamble: String?, items: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
            if let preamble {
                Text(preamble)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(items, id: \.0) { label, detail in
                    HStack(alignment: .top, spacing: 8) {
                        Text("・")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(label)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(MerkenTheme.primaryText)
                            Text(detail)
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .lineSpacing(4)
                        }
                    }
                }
            }
        }
    }

    private func privacySectionWithSimpleBullets(_ title: String, preamble: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
            Text(preamble)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("・")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text(item)
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
            }
        }
    }

    private func privacySectionWithLabeledBullets(_ title: String, preamble: String, items: [(String, String)], footer: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
            Text(preamble)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(items, id: \.0) { label, detail in
                    HStack(alignment: .top, spacing: 8) {
                        Text("・")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                        HStack(spacing: 4) {
                            Text(label)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(MerkenTheme.primaryText)
                            Text("— \(detail)")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                    }
                }
            }
            Text(footer)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineSpacing(4)
        }
    }
}
