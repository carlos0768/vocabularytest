import SwiftUI

struct TermsView: View {
    var body: some View {
        SupportPageShell(
            title: "利用規約",
            meta: "MERKEN TERMS OF SERVICE · 全 10 条",
            footer: "最終更新 2026年2月24日 · MERKEN"
        ) {
            SupportIntroCard("本規約は、MERKEN（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。")

            SupportNumberedSection(number: "1", label: "適用") {
                SupportParagraph("本規約は、本サービスの利用に関わる一切の関係に適用されます。運営者はサービス内において本規約のほか個別の規定を定めることがあり、両者が異なる場合は個別規定が優先します。")
            }

            SupportNumberedSection(number: "2", label: "サービス内容") {
                SupportParagraph("本サービスは、画像から英単語を抽出し、日本語訳とクイズを自動生成する学習支援サービスです。AI技術を利用しているため、抽出結果や翻訳の正確性を完全に保証するものではありません。")
            }

            SupportNumberedSection(number: "3", label: "アカウント登録") {
                VStack(alignment: .leading, spacing: 8) {
                    SupportParagraph("本サービスの一部機能はアカウント登録が必要です。利用者は、登録時に正確な情報を提供するものとします。")
                    SupportOrderedList(items: [
                        "ユーザーは正確な情報を登録するものとします。",
                        "アカウントの管理はユーザーの責任とします。",
                        "アカウントの第三者への譲渡・貸与は禁止します。"
                    ])
                }
            }

            SupportNumberedSection(number: "4", label: "禁止事項") {
                VStack(alignment: .leading, spacing: 8) {
                    SupportParagraph("利用者は、本サービスの利用にあたり以下の行為をしてはなりません。")
                    SupportOrderedList(items: [
                        "法令または公序良俗に違反する行為",
                        "サービスの運営を妨害する行為（リバースエンジニアリング、過度なリクエストを含む）",
                        "不正アクセスまたはそれを試みる行為",
                        "本サービスを商業目的で無断利用する行為",
                        "虚偽の情報を登録する行為"
                    ])
                }
            }

            SupportNumberedSection(number: "5", label: "有料プラン (Pro)") {
                SupportParagraph("Proプランは月額課金制です。支払いはStripeを通じて処理されます。解約はいつでも可能で、解約後も契約期間終了日まではご利用いただけます。返金は原則として行いません。")
            }

            SupportNumberedSection(number: "6", label: "知的財産権") {
                SupportParagraph("本サービスに関する知的財産権は運営者に帰属します。ユーザーが登録した単語・例文等のコンテンツの権利はユーザーに帰属しますが、本サービスの提供・改善のため必要な範囲で利用する権利を許諾するものとします。")
            }

            SupportNumberedSection(number: "7", label: "免責事項") {
                SupportOrderedList(items: [
                    "AIによる抽出・翻訳結果の正確性は保証しません。",
                    "サービスの中断・停止による損害について責任を負いません。",
                    "ユーザー間または第三者とのトラブルについて責任を負いません。"
                ])
            }

            SupportNumberedSection(number: "8", label: "サービスの変更・終了") {
                SupportParagraph("運営者は、事前の通知なくサービス内容の変更または終了を行うことがあります。これにより利用者に生じた損害について、運営者は責任を負いません。")
            }

            SupportNumberedSection(number: "9", label: "準拠法・管轄") {
                SupportParagraph("本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、福岡地方裁判所を第一審の専属的合意管轄裁判所とします。")
            }

            SupportNumberedSection(number: "10", label: "お問い合わせ") {
                SupportContactMiniCard()
            }
        }
    }
}
