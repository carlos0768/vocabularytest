import SwiftUI

struct ContactView: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        SupportPageShell(
            title: "お問い合わせ",
            meta: "CONTACT · サポートチーム直通",
            footer: "MERKEN"
        ) {
            SupportHeroCard(
                kicker: "SUPPORT",
                meta: "通常 2 営業日以内に返信",
                title: "気軽に聞いてください",
                message: "バグ報告、機能リクエスト、課金に関するお問い合わせ、すべてここから。"
            )

            SupportSection(label: "連絡先") {
                Button {
                    guard let url = URL(string: "mailto:support@merken.jp") else { return }
                    openURL(url)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "envelope")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .frame(width: 30, height: 30)
                            .background(MerkenTheme.solidInk.opacity(0.05), in: .rect(cornerRadius: 8))

                        Text("support@merken.jp")
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.74)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .supportPanel()
                }
                .buttonStyle(.plain)
            }

            SupportSection(label: "よくある質問") {
                VStack(spacing: 0) {
                    SupportFaqRow(
                        question: "Pro を解約したい",
                        answer: "設定 > アカウントの「サブスクリプション管理」から、いつでも次回更新をキャンセルできます。解約後も契約期間終了日まではご利用いただけます。"
                    )
                    SupportFaqRow(
                        question: "機種変更でデータ移行",
                        answer: "同じメールアドレスで再ログインすると、学習データが自動同期されます。"
                    )
                    SupportFaqRow(
                        question: "アカウントを削除したい",
                        answer: "お問い合わせメールにてご連絡ください。アカウント削除時にすべての関連データを削除します。",
                        isLast: true
                    )
                }
                .supportPanel()
            }
        }
    }
}

struct TokushoView: View {
    var body: some View {
        SupportPageShell(
            title: "特定商取引法\nに基づく表記",
            meta: "SPECIFIED COMMERCIAL TRANSACTIONS ACT",
            footer: "最終更新 2026年4月13日 · MERKEN"
        ) {
            SupportIntroCard("特定商取引法第11条に基づき、Pro 購読サービスの提供に関する事項を以下の通り表示します。")

            SupportSection(label: "販売事業者") {
                VStack(spacing: 0) {
                    SupportDefRow(label: "販売事業者名", value: "原田浩司")
                    SupportDefRow(label: "運営統括責任者", value: "原田浩司")
                    SupportDefRow(label: "サービス名", value: "MERKEN")
                    SupportDefRow(label: "所在地", value: "〒810-0001\n福岡県福岡市中央区天神2丁目2番12号\nT&Jビルディング7F")
                    SupportDefRow(label: "電話番号", value: "090-1077-1208\n受付時間: 9:00-20:00")
                    SupportDefRow(label: "メールアドレス", value: "support@merken.jp", isLast: true, isAccent: true)
                }
                .supportPanel()
            }

            SupportSection(label: "販売価格") {
                VStack(spacing: 0) {
                    SupportDefRow(label: "無料プラン", value: "¥0")
                    SupportDefRow(label: "Pro（月額）", value: "¥300（税込）／ 月", isLast: true)
                }
                .supportPanel()
            }

            SupportSection(label: "支払いと提供時期") {
                VStack(spacing: 0) {
                    SupportDefRow(label: "支払方法", value: "クレジットカード決済（Stripe / Visa, Mastercard 等）")
                    SupportDefRow(label: "商品代金以外の料金", value: "インターネット接続に必要な通信料等はお客様のご負担となります。")
                    SupportDefRow(label: "支払時期", value: "有料プランの申込時に初回決済が行われ、以後は毎月の更新日に自動で課金されます。")
                    SupportDefRow(label: "提供時期", value: "決済完了後、直ちにご利用いただけます。", isLast: true)
                }
                .supportPanel()
            }

            SupportSection(label: "その他") {
                VStack(spacing: 0) {
                    SupportDefRow(label: "返品・返金", value: "デジタルサービスの性質上、決済完了後の返品・返金は原則としてお受けしておりません。")
                    SupportDefRow(label: "解約方法", value: "アプリ内の設定画面から期間末解約の手続きが可能です。解約後も契約期間終了日まではご利用いただけます。")
                    SupportDefRow(label: "動作環境", value: "iOS 16.0 以降 / Android 10 以降 / 主要モダンブラウザ", isLast: true)
                }
                .supportPanel()
            }
        }
    }
}

struct SupportPageShell<Content: View>: View {
    let title: String
    let meta: String
    let footer: String
    let content: Content

    @Environment(\.dismiss) private var dismiss

    init(
        title: String,
        meta: String,
        footer: String,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.meta = meta
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    content

                    Text(footer)
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .tracking(0.4)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                        .padding(.bottom, 110)
                }
            }
            .scrollIndicators(.hidden)
            .disableTopScrollEdgeEffectIfAvailable()
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Button {
                    dismiss()
                } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .frame(width: 38, height: 38)
                            .background(MerkenTheme.surface, in: Circle())
                            .overlay(Circle().stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
                            .background(Circle().fill(MerkenTheme.solidShadow).offset(x: 2, y: 2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("戻る")

                Text("ACCOUNT / SUPPORT")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.bottom, 8)

            Text(title)
                .font(.system(size: 24, weight: .heavy))
                .foregroundStyle(MerkenTheme.solidInk)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)

            Text(meta)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .tracking(0.2)
                .foregroundStyle(MerkenTheme.mutedText)
                .padding(.top, 6)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 14)
    }
}

struct SupportHeroCard: View {
    let kicker: String
    let meta: String
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(kicker)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(MerkenTheme.accentGreen)
                Circle()
                    .fill(MerkenTheme.mutedText)
                    .frame(width: 3, height: 3)
                Text(meta)
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(MerkenTheme.solidInk)

            Text(message)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(MerkenTheme.mutedText)
                .lineSpacing(4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [MerkenTheme.accentGreenLight.opacity(0.92), MerkenTheme.surface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
        .solidSupportBorder()
        .padding(.horizontal, 18)
        .padding(.bottom, 14)
    }
}

struct SupportIntroCard: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(MerkenTheme.solidInk)
            .lineSpacing(5)
            .supportPanel(background: MerkenTheme.notebookPaper)
            .padding(.horizontal, 18)
            .padding(.bottom, 14)
    }
}

struct SupportSection<Content: View>: View {
    let label: String
    let content: Content

    init(label: String, @ViewBuilder content: () -> Content) {
        self.label = label
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(MerkenTheme.mutedText)
                .padding(.leading, 4)

            content
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 12)
    }
}

struct SupportNumberedSection<Content: View>: View {
    let number: String
    let label: String
    let content: Content

    init(number: String, label: String, @ViewBuilder content: () -> Content) {
        self.number = number
        self.label = label
        self.content = content()
    }

    var body: some View {
        SupportSection(label: "§\(number) \(label)") {
            content.supportPanel()
        }
    }
}

struct SupportParagraph: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.system(size: 11.5, weight: .medium))
            .foregroundStyle(MerkenTheme.solidInk)
            .lineSpacing(5)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SupportOrderedList: View {
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(index + 1).")
                        .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(MerkenTheme.solidInk)
                        .frame(width: 20, alignment: .trailing)
                    Text(item)
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(MerkenTheme.solidInk)
                        .lineSpacing(5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

struct SupportContactMiniCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("CONTACT")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .tracking(0.8)
                .foregroundStyle(MerkenTheme.mutedText)
            Text("support@merken.jp")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(MerkenTheme.accentGreen)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.notebookPaper, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(MerkenTheme.border, lineWidth: 1)
        )
    }
}

struct SupportFaqRow: View {
    let question: String
    let answer: String
    var isLast = false

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 8) {
                Text("Q")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(MerkenTheme.inverseText)
                    .frame(width: 16, height: 16)
                    .background(MerkenTheme.inverseSurface, in: Circle())
                    .padding(.top, 1)

                Text(question)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineSpacing(3)
            }

            Text(answer)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(MerkenTheme.mutedText)
                .lineSpacing(5)
                .padding(.leading, 24)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            if !isLast {
                Rectangle()
                    .fill(MerkenTheme.border)
                    .frame(height: 1)
            }
        }
    }
}

struct SupportDefRow: View {
    let label: String
    let value: String
    var isLast = false
    var isAccent = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .tracking(0.2)
                .foregroundStyle(MerkenTheme.mutedText)
                .frame(width: 92, alignment: .leading)

            Text(value)
                .font(.system(size: 11.5, weight: .medium, design: isAccent ? .monospaced : .default))
                .foregroundStyle(isAccent ? MerkenTheme.accentGreen : MerkenTheme.solidInk)
                .lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            if !isLast {
                Rectangle()
                    .fill(MerkenTheme.border)
                    .frame(height: 1)
            }
        }
    }
}

private extension View {
    func supportPanel(background: Color = MerkenTheme.surface) -> some View {
        self
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .solidSupportBorder()
    }

    func solidSupportBorder() -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        return self
            .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
            .background(shape.fill(MerkenTheme.solidShadow).offset(x: 2.5, y: 2.5))
    }
}
