import SwiftUI

struct PrivacyView: View {
    var body: some View {
        SupportPageShell(
            title: "プライバシーポリシー",
            meta: "PRIVACY POLICY · 個人情報の取扱い",
            footer: "最終更新 2026年2月24日 · MERKEN"
        ) {
            SupportIntroCard("MERKEN（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本ポリシーは、本サービスにおける個人情報の取り扱いについて定めます。")

            SupportNumberedSection(number: "1", label: "収集する情報") {
                SupportOrderedList(items: [
                    "アカウント情報（メールアドレス、パスワード〈暗号化済み〉）",
                    "学習データ（作成した単語帳、クイズの回答履歴、学習進捗）",
                    "アップロード画像（単語抽出のために送信された画像。処理後、サーバーには保存しません）",
                    "決済情報（有料プラン利用時。Stripeが処理し、本サービスではカード情報等を保持しません）"
                ])
            }

            SupportNumberedSection(number: "2", label: "利用目的") {
                VStack(alignment: .leading, spacing: 8) {
                    SupportParagraph("取得した情報は、以下の目的のために利用します。")
                    SupportOrderedList(items: [
                        "サービスの提供・運営・改善",
                        "ユーザーの学習データの保存・同期",
                        "お問い合わせへの対応",
                        "利用規約違反への対応",
                        "統計データの作成（個人を特定できない形に加工）"
                    ])
                }
            }

            SupportNumberedSection(number: "3", label: "第三者サービス") {
                VStack(alignment: .leading, spacing: 8) {
                    SupportParagraph("本サービスでは以下の第三者サービスを利用しています。各サービスのプライバシーポリシーについては、各社のサイトをご確認ください。")
                    SupportOrderedList(items: [
                        "Supabase — 認証・データベース",
                        "Google (Gemini 2.5 Flash) — 画像OCR・単語抽出",
                        "OpenAI — クイズ生成・例文生成",
                        "Stripe — 決済処理",
                        "Vercel — ホスティング"
                    ])
                }
            }

            SupportNumberedSection(number: "4", label: "画像データの取り扱い") {
                SupportParagraph("ユーザーがアップロードした画像は、単語抽出処理のためにGoogle Gemini APIに送信されます。処理完了後、画像データは本サービスのサーバーには保存されません。")
            }

            SupportNumberedSection(number: "5", label: "データの保存") {
                SupportOrderedList(items: [
                    "無料プラン: データはユーザーのブラウザ（IndexedDB）にローカル保存されます。サーバーには送信されません。",
                    "Proプラン: データはSupabase（クラウド）に保存され、デバイス間で同期されます。"
                ])
            }

            SupportNumberedSection(number: "6", label: "Cookie・類似技術") {
                SupportParagraph("本サービスでは、ログイン状態の維持や利用状況の分析のためCookieおよびローカルストレージを使用します。ブラウザの設定によりこれらを無効化できますが、一部機能が利用できなくなる場合があります。")
            }

            SupportNumberedSection(number: "7", label: "データの削除") {
                SupportParagraph("ユーザーはいつでも自身のデータを削除できます。アカウント削除をご希望の場合は、お問い合わせください。アカウント削除時にはすべての関連データを削除します。")
            }

            SupportNumberedSection(number: "8", label: "セキュリティ") {
                SupportParagraph("本サービスは、個人情報の漏洩・紛失を防ぐために適切なセキュリティ対策を講じています。通信はすべてSSL/TLSにより暗号化されています。")
            }

            SupportNumberedSection(number: "9", label: "ポリシーの変更") {
                SupportParagraph("本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は、サービス内で通知します。")
            }

            SupportNumberedSection(number: "10", label: "お問い合わせ") {
                SupportContactMiniCard()
            }
        }
    }
}
