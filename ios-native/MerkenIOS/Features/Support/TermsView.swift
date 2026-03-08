import SwiftUI

struct TermsView: View {
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

                                termsSection("第1条（適用）",
                                    "本規約は、MERKEN（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。")

                                termsSection("第2条（サービス内容）",
                                    "本サービスは、画像から英単語を抽出し、日本語訳とクイズを自動生成する学習支援サービスです。AI技術を利用しているため、抽出結果や翻訳の正確性を完全に保証するものではありません。")

                                termsSectionWithList("第3条（アカウント）", items: [
                                    "ユーザーは正確な情報を登録するものとします。",
                                    "アカウントの管理はユーザーの責任とします。",
                                    "アカウントの第三者への譲渡・貸与は禁止します。"
                                ])

                                termsSectionWithList("第4条（有料プラン）", items: [
                                    "有料プラン（Proプラン）は月額課金制です。",
                                    "支払いはKOMOJUを通じて処理されます。",
                                    "解約はいつでも可能です。解約後も当月末まで利用できます。",
                                    "返金は原則として行いません。"
                                ])

                                termsSectionWithBullets("第5条（禁止事項）",
                                    preamble: "以下の行為を禁止します。",
                                    items: [
                                        "法令または公序良俗に違反する行為",
                                        "サービスの運営を妨害する行為",
                                        "不正アクセスまたはそれを試みる行為",
                                        "他のユーザーに迷惑をかける行為",
                                        "本サービスを商業目的で無断利用する行為"
                                    ])

                                termsSection("第6条（知的財産権）",
                                    "本サービスに関する知的財産権は運営者に帰属します。ユーザーがアップロードした画像・データの権利はユーザーに帰属します。")

                                termsSectionWithList("第7条（免責事項）", items: [
                                    "AIによる抽出・翻訳結果の正確性は保証しません。",
                                    "サービスの中断・停止による損害について責任を負いません。",
                                    "ユーザー間または第三者とのトラブルについて責任を負いません。"
                                ])

                                termsSection("第8条（サービスの変更・終了）",
                                    "運営者は、事前の通知なくサービス内容の変更または終了を行うことがあります。")

                                termsSection("第9条（準拠法・管轄）",
                                    "本規約は日本法に準拠し、紛争が生じた場合は福岡地方裁判所を第一審の専属的合意管轄裁判所とします。")

                                termsSection("第10条（お問い合わせ）",
                                    "本規約に関するお問い合わせは、support@merken.jp までご連絡ください。")
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 16)
                }
        }
        .navigationTitle("利用規約")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func termsSection(_ title: String, _ body: String) -> some View {
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

    private func termsSectionWithList(_ title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(index + 1).")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                            .frame(width: 20, alignment: .trailing)
                        Text(item)
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineSpacing(4)
                    }
                }
            }
        }
    }

    private func termsSectionWithBullets(_ title: String, preamble: String, items: [String]) -> some View {
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
                            .lineSpacing(4)
                    }
                }
            }
        }
    }
}
