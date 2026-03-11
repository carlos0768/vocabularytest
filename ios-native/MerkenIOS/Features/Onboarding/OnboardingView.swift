import SwiftUI

private struct OnboardingPage: Identifiable, Equatable {
    enum Kind: Equatable {
        case hero
        case featureEvidence
        case screenshotPlaceholder
        case valueBridge
        case finalCTA
    }

    let id: String
    let kind: Kind
    let eyebrow: String
    let title: String
    let description: String
    let symbol: String
    let accent: Color
    let placeholderTitle: String?
    let placeholderDescription: String?

    static let defaultPages: [OnboardingPage] = [
        .init(
            id: "hero",
            kind: .hero,
            eyebrow: "中心価値",
            title: "撮るだけで\n単語帳ができる",
            description: "紙の単語帳やノートを撮影すると、抽出・整理・復習まで一気に繋がります。",
            symbol: "camera.viewfinder",
            accent: MerkenTheme.accentBlue,
            placeholderTitle: nil,
            placeholderDescription: nil
        ),
        .init(
            id: "scan-shot",
            kind: .screenshotPlaceholder,
            eyebrow: "画面差し替え予定",
            title: "スキャン画面の証拠",
            description: "ここに実際のスキャンフローのスクリーンショットを配置します。",
            symbol: "photo.stack",
            accent: MerkenTheme.accentBlue,
            placeholderTitle: "ここにスキャン画面のスクリーンショット",
            placeholderDescription: "紙を撮る -> 単語抽出までの流れが分かる画像を差し込み"
        ),
        .init(
            id: "problem",
            kind: .featureEvidence,
            eyebrow: "課題",
            title: "覚えたつもりでも、\n人は忘れる",
            description: "単語を集めるだけでは定着しません。復習導線まで一体で設計する必要があります。",
            symbol: "brain.head.profile",
            accent: MerkenTheme.warning,
            placeholderTitle: nil,
            placeholderDescription: nil
        ),
        .init(
            id: "review-proof",
            kind: .featureEvidence,
            eyebrow: "証拠",
            title: "復習が自然に続く",
            description: "ホームの復習ウィジェットと学習モードで、次にやるべき単語にすぐ戻れます。",
            symbol: "arrow.clockwise.circle",
            accent: MerkenTheme.success,
            placeholderTitle: nil,
            placeholderDescription: nil
        ),
        .init(
            id: "review-shot",
            kind: .screenshotPlaceholder,
            eyebrow: "画面差し替え予定",
            title: "復習ウィジェットの証拠",
            description: "ここにホームの復習ウィジェットや学習モードのスクリーンショットを配置します。",
            symbol: "rectangle.stack",
            accent: MerkenTheme.success,
            placeholderTitle: "ここに復習ウィジェットのスクリーンショット",
            placeholderDescription: "復習数、リング、学習モードの流れが伝わる画像を差し込み"
        ),
        .init(
            id: "scan-proof",
            kind: .featureEvidence,
            eyebrow: "証拠",
            title: "紙の学習資産を\nそのまま資産化",
            description: "既存のノートや市販単語帳に書き込んだ内容も、撮影ベースでデジタル化できます。",
            symbol: "books.vertical",
            accent: MerkenTheme.chartBlue,
            placeholderTitle: nil,
            placeholderDescription: nil
        ),
        .init(
            id: "progress-proof",
            kind: .featureEvidence,
            eyebrow: "証拠",
            title: "継続が見えるから、\nやめにくい",
            description: "ストーリーラインと進歩ページで、習得と継続が毎日可視化されます。",
            symbol: "chart.line.uptrend.xyaxis",
            accent: MerkenTheme.chartBlue,
            placeholderTitle: nil,
            placeholderDescription: nil
        ),
        .init(
            id: "progress-shot",
            kind: .screenshotPlaceholder,
            eyebrow: "画面差し替え予定",
            title: "進歩ページの証拠",
            description: "ここに進歩ページやストーリーラインのスクリーンショットを配置します。",
            symbol: "chart.bar.xaxis",
            accent: MerkenTheme.chartBlue,
            placeholderTitle: "ここに進歩ページのスクリーンショット",
            placeholderDescription: "推移・週次・ストーリーラインが伝わる画像を差し込み"
        ),
        .init(
            id: "pro-bridge",
            kind: .valueBridge,
            eyebrow: "Proの価値",
            title: "続けるほど、\nProの差が効く",
            description: "同期、本棚、高度な学習導線を使うほど、単語帳が1回きりで終わらなくなります。",
            symbol: "sparkles",
            accent: MerkenTheme.warning,
            placeholderTitle: nil,
            placeholderDescription: nil
        ),
        .init(
            id: "share-shot",
            kind: .screenshotPlaceholder,
            eyebrow: "画面差し替え予定",
            title: "本棚 / 共有の証拠",
            description: "ここに本棚や共有シートのスクリーンショットを配置します。",
            symbol: "square.and.arrow.up",
            accent: MerkenTheme.warning,
            placeholderTitle: "ここに本棚 / 共有のスクリーンショット",
            placeholderDescription: "整理・共有の広がりを見せる画像を差し込み"
        ),
        .init(
            id: "cta",
            kind: .finalCTA,
            eyebrow: "今すぐ始める",
            title: "紙の単語学習を、\n続く仕組みに変える",
            description: "まずは1冊取り込んで、復習導線まで体験してください。",
            symbol: "arrow.right.circle.fill",
            accent: MerkenTheme.primaryText,
            placeholderTitle: nil,
            placeholderDescription: nil
        )
    ]
}

struct OnboardingView: View {
    static let currentVersion = 1

    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false
    @AppStorage("seenOnboardingVersion") private var seenOnboardingVersion = 0
    @Environment(\.dismiss) private var dismiss
    @State private var currentPage = 0

    let onGetStarted: () -> Void
    let onSignIn: () -> Void

    private let pages = OnboardingPage.defaultPages

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                topBar

                TabView(selection: $currentPage) {
                    ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                        OnboardingPageView(page: page) {
                            completeOnboardingAndContinue()
                        } onSignIn: {
                            completeOnboardingAndSignIn()
                        }
                        .tag(index)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                footerBar
            }
            .padding(.top, 10)
            .padding(.bottom, 24)
        }
    }

    private var topBar: some View {
        HStack {
            Text("\(currentPage + 1)/\(pages.count)")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)

            Spacer()

            if currentPage < pages.count - 1 {
                Button("スキップ") {
                    withAnimation(MerkenSpring.snappy) {
                        currentPage = pages.count - 1
                    }
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private var footerBar: some View {
        if currentPage < pages.count - 1 {
            VStack(spacing: 18) {
                pageDots

                Button {
                    withAnimation(MerkenSpring.snappy) {
                        currentPage = min(currentPage + 1, pages.count - 1)
                    }
                } label: {
                    Text("次へ")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.black, in: Capsule())
                }
                .padding(.horizontal, 24)
            }
        } else {
            pageDots
                .padding(.top, 10)
        }
    }

    private var pageDots: some View {
        HStack(spacing: 8) {
            ForEach(Array(pages.enumerated()), id: \.offset) { index, _ in
                Capsule(style: .continuous)
                    .fill(index == currentPage ? Color.black : MerkenTheme.borderLight)
                    .frame(width: index == currentPage ? 20 : 8, height: 8)
                    .animation(.easeInOut(duration: 0.2), value: currentPage)
            }
        }
    }

    private func markOnboardingSeen() {
        hasSeenOnboarding = true
        seenOnboardingVersion = Self.currentVersion
    }

    private func completeOnboardingAndContinue() {
        markOnboardingSeen()
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            onGetStarted()
        }
    }

    private func completeOnboardingAndSignIn() {
        markOnboardingSeen()
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            onSignIn()
        }
    }
}

private struct OnboardingPageView: View {
    let page: OnboardingPage
    let onGetStarted: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 18) {
                pageCard
            }
            .padding(.top, 8)
            .padding(.bottom, 10)
        }
    }

    @ViewBuilder
    private var pageCard: some View {
        switch page.kind {
        case .hero:
            HeroPillarCard(page: page)
        case .featureEvidence:
            FeatureEvidenceCard(page: page)
        case .screenshotPlaceholder:
            ScreenshotPlaceholderCard(page: page)
        case .valueBridge:
            ValueBridgeCard(page: page)
        case .finalCTA:
            FinalCTACard(page: page, onGetStarted: onGetStarted, onSignIn: onSignIn)
        }
    }
}

private struct OnboardingCardShell<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 16, x: 0, y: 10)
    }
}

private struct HeroPillarCard: View {
    let page: OnboardingPage

    var body: some View {
        OnboardingCardShell {
            VStack(alignment: .leading, spacing: 22) {
                pageHeader(page)

                ZStack(alignment: .bottomTrailing) {
                    RoundedRectangle(cornerRadius: 34, style: .continuous)
                        .fill(Color.black)
                        .frame(height: 310)
                        .overlay(alignment: .topLeading) {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(spacing: 8) {
                                    Image(systemName: "applelogo")
                                    Text("Merken")
                                        .font(.system(size: 18, weight: .bold))
                                }
                                .foregroundStyle(.white.opacity(0.96))
                                .padding(.top, 24)
                                .padding(.horizontal, 22)

                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .fill(Color.white.opacity(0.10))
                                    .frame(height: 122)
                                    .overlay {
                                        VStack(spacing: 12) {
                                            Image(systemName: "camera.viewfinder")
                                                .font(.system(size: 34, weight: .medium))
                                                .foregroundStyle(.white)
                                            Text("撮るだけで作成")
                                                .font(.system(size: 18, weight: .bold))
                                                .foregroundStyle(.white.opacity(0.92))
                                        }
                                    }
                                    .padding(.horizontal, 18)
                            }
                        }

                    VStack(alignment: .leading, spacing: 10) {
                        heroMiniMetric(title: "撮る", value: "紙を撮影")
                        heroMiniMetric(title: "作る", value: "単語帳化")
                        heroMiniMetric(title: "続く", value: "復習が回る")
                    }
                    .padding(18)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .offset(x: -12, y: 18)
                }

                Text(page.description)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineSpacing(4)
            }
        }
    }

    private func heroMiniMetric(title: String, value: String) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(MerkenTheme.mutedText)
            Spacer(minLength: 12)
            Text(value)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }
}

private struct FeatureEvidenceCard: View {
    let page: OnboardingPage

    var body: some View {
        OnboardingCardShell {
            VStack(alignment: .leading, spacing: 22) {
                pageHeader(page)

                HStack(alignment: .center, spacing: 18) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(page.accent.opacity(0.12))
                            .frame(width: 120, height: 120)

                        Image(systemName: page.symbol)
                            .font(.system(size: 44, weight: .medium))
                            .foregroundStyle(page.accent)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        evidenceStat(label: "効果", value: "続く学習動線")
                        evidenceStat(label: "理由", value: "抽出後すぐ復習へ")
                        evidenceStat(label: "結果", value: "紙で終わらない")
                    }
                }

                Text(page.description)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineSpacing(4)
            }
        }
    }

    private func evidenceStat(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(MerkenTheme.mutedText)
            Text(value)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }
}

private struct ScreenshotPlaceholderCard: View {
    let page: OnboardingPage

    var body: some View {
        OnboardingCardShell {
            VStack(alignment: .leading, spacing: 22) {
                pageHeader(page)

                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8, 8]))
                    .foregroundStyle(MerkenTheme.border)
                    .frame(height: 360)
                    .overlay {
                        VStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(page.accent.opacity(0.12))
                                    .frame(width: 74, height: 74)

                                Image(systemName: page.symbol)
                                    .font(.system(size: 28, weight: .semibold))
                                    .foregroundStyle(page.accent)
                            }

                            Text(page.placeholderTitle ?? "ここにスクリーンショット")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .multilineTextAlignment(.center)

                            Text(page.placeholderDescription ?? "差し替え待ち")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .multilineTextAlignment(.center)
                                .lineSpacing(4)
                        }
                        .padding(.horizontal, 24)
                    }
            }
        }
    }
}

private struct ValueBridgeCard: View {
    let page: OnboardingPage

    var body: some View {
        OnboardingCardShell {
            VStack(alignment: .leading, spacing: 22) {
                pageHeader(page)

                VStack(spacing: 12) {
                    planRow(
                        title: "無料",
                        subtitle: "まずは撮って学習導線を体験",
                        tint: MerkenTheme.borderLight,
                        tone: MerkenTheme.surfaceAlt
                    )

                    planRow(
                        title: "Pro",
                        subtitle: "同期 / 本棚 / 高度機能で継続が加速",
                        tint: page.accent,
                        tone: page.accent.opacity(0.10)
                    )
                }

                Text(page.description)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineSpacing(4)
            }
        }
    }

    private func planRow(title: String, subtitle: String, tint: Color, tone: Color) -> some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(tone)
                .frame(width: 52, height: 52)
                .overlay {
                    Image(systemName: title == "Pro" ? "sparkles" : "square.stack.3d.up")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(tint)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .background(MerkenTheme.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

private struct FinalCTACard: View {
    let page: OnboardingPage
    let onGetStarted: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        OnboardingCardShell {
            VStack(alignment: .leading, spacing: 22) {
                pageHeader(page)

                VStack(alignment: .leading, spacing: 12) {
                    Text("主な価値")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(MerkenTheme.mutedText)

                    valueLine("紙を撮るだけで単語帳化")
                    valueLine("復習導線まで一気に接続")
                    valueLine("継続が見えるからやめにくい")
                    valueLine("Proで本棚と同期まで伸ばせる")
                }

                Text(page.description)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineSpacing(4)

                Button(action: onGetStarted) {
                    Text("はじめる")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.black, in: Capsule())
                }

                HStack(spacing: 6) {
                    Text("すでにアカウントをお持ちの方は")
                        .foregroundStyle(MerkenTheme.secondaryText)
                    Button("ログイン", action: onSignIn)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                }
                .font(.system(size: 16, weight: .medium))
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func valueLine(_ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(MerkenTheme.success)
            Text(text)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(MerkenTheme.primaryText)
            Spacer(minLength: 0)
        }
    }
}

private func pageHeader(_ page: OnboardingPage) -> some View {
    VStack(alignment: .leading, spacing: 10) {
        Text(page.eyebrow.uppercased())
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(page.accent)
            .tracking(1.1)

        Text(page.title)
            .font(.system(size: 34, weight: .black))
            .foregroundStyle(MerkenTheme.primaryText)
            .lineSpacing(2)
    }
}

#Preview {
    OnboardingView(onGetStarted: {}, onSignIn: {})
}
