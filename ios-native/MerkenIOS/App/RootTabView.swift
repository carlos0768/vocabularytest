import SwiftUI
import UIKit

private struct RootTabItem: Identifiable {
    let tab: Int
    let title: String
    let systemImage: String

    var id: Int { tab }
}

private struct LiquidBarButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .opacity(configuration.isPressed ? 0.74 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

struct RootTabView: View {
    @EnvironmentObject private var appState: AppState

    @State private var showingScanFlow = false
    @State private var showingSignInFlow = false
    @State private var showingSignUpFlow = false
    @State private var keyboardVisible = false

    private let tabItems: [RootTabItem] = [
        .init(tab: 0, title: "ホーム", systemImage: "house"),
        .init(tab: 1, title: "共有", systemImage: "point.3.connected.trianglepath.dotted"),
        .init(tab: 3, title: "進歩", systemImage: "chart.line.uptrend.xyaxis"),
        .init(tab: 4, title: "アカウント", systemImage: "person")
    ]

    init() {
        UITabBar.appearance().isHidden = true
    }

    var body: some View {
        ZStack {
            AppBackground()

            if appState.isLoggedIn {
                TabView(selection: $appState.selectedTab) {
                    NavigationStack {
                        HomeView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(0)

                    NavigationStack {
                        SharedProjectsTabView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(1)

                    NavigationStack {
                        StatsView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(3)

                    NavigationStack {
                        SettingsView()
                    }
                    .toolbar(.hidden, for: .tabBar)
                    .tag(4)
                }
                .tint(MerkenTheme.accentBlue)
                .toolbar(.hidden, for: .tabBar)
                .safeAreaPadding(.bottom, appState.tabBarVisible ? 90 : 0)
            } else {
                NavigationStack {
                    RootAuthLandingView(
                        onGetStarted: {
                            showingSignUpFlow = true
                        },
                        onSignIn: { showingSignInFlow = true }
                    )
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar(.hidden, for: .navigationBar)
                    .navigationDestination(isPresented: $showingSignUpFlow) {
                        SignUpView()
                            .environmentObject(appState)
                    }
                    .navigationDestination(isPresented: $showingSignInFlow) {
                        RootSignInView()
                            .environmentObject(appState)
                    }
                }
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .animation(MerkenSpring.snappy, value: appState.tabBarVisible)
        .animation(MerkenSpring.snappy, value: keyboardVisible)
        .overlay(alignment: .top) {
            if let banner = appState.scanBanner {
                ScanBannerView(state: banner)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay {
            if appState.isLoggedIn && showingScanFlow {
                ScanCoordinatorView(
                    onDismissRequest: closeScanFlow
                )
                .environmentObject(appState)
                .transition(.opacity)
                .zIndex(2)
            }
        }
        .overlay(alignment: .bottom) {
            if appState.isLoggedIn && appState.tabBarVisible && !keyboardVisible {
                bottomNavigationBar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .ignoresSafeArea(.container, edges: .bottom)
                    .ignoresSafeArea(.keyboard)
                    .zIndex(3)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.88), value: appState.scanBanner?.id)
        .animation(MerkenSpring.snappy, value: showingScanFlow)
    }

    private func closeScanFlow() {
        withAnimation(MerkenSpring.snappy) {
            showingScanFlow = false
        }
    }

    private var bottomNavigationBar: some View {
        let content = HStack(alignment: .center, spacing: 2) {
            tabButton(for: tabItems[0])
            tabButton(for: tabItems[1])
            centerScanButton
            tabButton(for: tabItems[2])
            tabButton(for: tabItems[3])
        }
        .frame(maxWidth: .infinity)
        .frame(height: 60)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)

        return Group {
            if #available(iOS 26.0, *) {
                GlassEffectContainer(spacing: 8) {
                    content
                        .glassEffect(
                            .regular.tint(Color.white.opacity(0.16)).interactive(),
                            in: .rect(cornerRadius: 30)
                        )
                }
            } else {
                content
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(Color.white.opacity(0.48), lineWidth: 1)
                    )
            }
        }
        .shadow(color: Color.black.opacity(0.14), radius: 16, x: 0, y: 8)
        .padding(.horizontal, 18)
        .padding(.bottom, 14)
        .allowsHitTesting(!showingScanFlow || appState.tabBarVisible)
    }

    private func tabButton(for item: RootTabItem) -> some View {
        let isSelected = appState.selectedTab == item.tab

        return Button {
            MerkenHaptic.selection()
            if appState.selectedTab == item.tab {
                appState.scrollToTopTrigger += 1
            } else {
                appState.selectedTab = item.tab
            }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: item.systemImage)
                    .font(.system(size: 18, weight: isSelected ? .semibold : .medium))
                Text(item.title)
                    .font(.system(size: 9, weight: isSelected ? .semibold : .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isSelected ? MerkenTheme.solidInk : MerkenTheme.mutedText)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background {
                if isSelected {
                    Capsule()
                        .fill(MerkenTheme.selectedGlassFill)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(LiquidBarButtonStyle())
        .accessibilityLabel(item.title)
    }

    private var centerScanButton: some View {
        Button {
            MerkenHaptic.selection()
            withAnimation(MerkenSpring.snappy) {
                showingScanFlow.toggle()
            }
        } label: {
            VStack(spacing: 3) {
                ZStack {
                    Circle()
                        .fill(MerkenTheme.inverseSurface)
                        .frame(width: 40, height: 40)
                        .overlay(
                            Circle()
                                .stroke(MerkenTheme.inverseText.opacity(0.24), lineWidth: 1)
                        )

                    Image(systemName: showingScanFlow ? "xmark" : "plus")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(MerkenTheme.inverseText)
                        .rotationEffect(.degrees(showingScanFlow ? 90 : 0))
                }

                Text("スキャン")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(MerkenTheme.solidInk)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .contentShape(.rect)
        }
        .buttonStyle(LiquidBarButtonStyle())
        .accessibilityLabel(showingScanFlow ? "閉じる" : "スキャン")
    }
}

private struct RootAuthLandingView: View {
    let onGetStarted: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        ZStack {
            PaperDotBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    landingHeader

                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 8) {
                            Rectangle()
                                .fill(MerkenTheme.accentGreen)
                                .frame(width: 20, height: 1.5)
                            Text("AI VOCABULARY NOTEBOOK")
                                .font(.system(size: 11, weight: .black, design: .monospaced))
                                .tracking(1.2)
                                .foregroundStyle(MerkenTheme.accentGreen)
                        }

                        VStack(alignment: .leading, spacing: -2) {
                            Text("手入力ゼロで、")
                                .font(.system(size: 42, weight: .black))
                            Text("単語帳。")
                                .font(.system(size: 42, weight: .black))
                                .foregroundStyle(MerkenTheme.accentGreen)
                        }
                        .foregroundStyle(MerkenTheme.solidInk)
                        .lineLimit(2)
                        .minimumScaleFactor(0.86)

                        Text("教科書・ノート・プリントを撮影するだけ。AIが英単語、和訳、例文、発音記号、クイズ素材を作り、あなた専用の単語帳として保存できます。")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineSpacing(7)
                    }

                    HStack(spacing: 14) {
                        Button(action: onGetStarted) {
                            HStack(spacing: 9) {
                                Text("無料で始める")
                                Image(systemName: "arrow.right")
                            }
                        }
                        .buttonStyle(PrimaryGlassButton())

                        Button(action: onSignIn) {
                            HStack(spacing: 7) {
                                Text("ログイン")
                                Image(systemName: "arrow.right")
                            }
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .padding(.vertical, 13)
                            .overlay(alignment: .bottom) {
                                MerkenTheme.solidInk.frame(height: 1.5)
                            }
                        }
                        .buttonStyle(.plain)
                    }

                    HStack(alignment: .top, spacing: 26) {
                        landingMetric(value: "4", label: "抽出モード")
                        landingMetric(value: "3回/日", label: "無料スキャン")
                        landingMetric(value: "100語", label: "無料保存枠")
                    }
                    .padding(.top, 6)

                    landingHeroMock

                    landingTagRow

                    howItWorksPreview
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var landingHeader: some View {
        HStack(alignment: .center) {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text("MERKEN")
                    .font(.system(size: 21, weight: .black))
                    .tracking(5)
                    .foregroundStyle(MerkenTheme.solidInk)
                Rectangle()
                    .fill(MerkenTheme.accentGreen)
                    .frame(width: 5, height: 5)
            }

            Spacer()

            Button(action: onGetStarted) {
                HStack(spacing: 8) {
                    Text("無料で始める")
                        .font(.system(size: 13, weight: .black))
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .black))
                }
                .foregroundStyle(MerkenTheme.inverseText)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(MerkenTheme.inverseSurface, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 18)
        .overlay(alignment: .bottom) {
            MerkenTheme.solidInk.frame(height: 1.5)
        }
    }

    private func landingMetric(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.system(size: 24, weight: .black))
                .foregroundStyle(MerkenTheme.solidInk)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var landingHeroMock: some View {
        ZStack(alignment: .bottom) {
            notebookMock
                .frame(width: 190, height: 220)
                .rotationEffect(.degrees(-4))
                .offset(x: -72, y: 14)

            phoneQuizMock
                .frame(width: 178, height: 286)
                .rotationEffect(.degrees(6))
                .offset(x: 66, y: 0)

            Text("AI 抽出")
                .font(.system(size: 10, weight: .black, design: .monospaced))
                .foregroundStyle(MerkenTheme.inverseText)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(MerkenTheme.inverseSurface, in: Capsule())
                .offset(x: -136, y: -22)

            Text("+ 単語帳へ")
                .font(.system(size: 10, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(MerkenTheme.accentGreen, in: Capsule())
                .offset(x: 64, y: -212)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 306)
    }

    private var notebookMock: some View {
        ZStack(alignment: .topLeading) {
            MerkenTheme.notebookPaper
                .overlay {
                    VStack(spacing: 18) {
                        ForEach(0..<7, id: \.self) { _ in
                            MerkenTheme.solidInk.opacity(0.08).frame(height: 1)
                        }
                    }
                    .padding(.top, 28)
                }
            Rectangle()
                .fill(Color(red: 232 / 255, green: 180 / 255, blue: 184 / 255))
                .frame(width: 1)
                .padding(.leading, 22)

            VStack(alignment: .leading, spacing: 11) {
                Text("Lesson 7 - Reading")
                    .font(.system(size: 12, weight: .black))
                Text("The pattern was")
                highlightedWord("ubiquitous", color: Color(red: 232 / 255, green: 199 / 255, blue: 130 / 255))
                Text("in modern")
                highlightedWord("architecture", color: MerkenTheme.accentGreenLight)
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(MerkenTheme.solidInk)
            .padding(.leading, 42)
            .padding(.top, 44)
        }
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        .shadow(color: Color.black.opacity(0.10), radius: 16, x: 0, y: 10)
        .overlay(alignment: .topLeading) {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    MerkenTheme.solidInk.frame(width: 28, height: 2)
                    Spacer()
                }
                MerkenTheme.solidInk.frame(width: 2, height: 28)
            }
            .offset(x: -8, y: -8)
        }
    }

    private func highlightedWord(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .black))
            .padding(.horizontal, 4)
            .background(color, in: RoundedRectangle(cornerRadius: 2, style: .continuous))
    }

    private var phoneQuizMock: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(MerkenTheme.inverseSurface)

            VStack(spacing: 10) {
                Capsule()
                    .fill(MerkenTheme.inverseText.opacity(0.22))
                    .frame(width: 78, height: 18)
                    .padding(.top, 10)

                Text("somewhat")
                    .font(.system(size: 18, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)

                VStack(spacing: 7) {
                    quizChoice("A", "莫大な、優しい", tone: .neutral)
                    quizChoice("B", "適度な、ほどよい", tone: .correct)
                    quizChoice("C", "鮮やかな、活発な", tone: .wrong)
                    quizChoice("D", "危険な、不安定な", tone: .neutral)
                }

                Spacer(minLength: 0)
            }
            .padding(10)
            .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .padding(8)
        }
        .shadow(color: Color.black.opacity(0.24), radius: 20, x: 0, y: 12)
    }

    private enum QuizChoiceTone {
        case neutral
        case correct
        case wrong
    }

    private func quizChoice(_ prefix: String, _ text: String, tone: QuizChoiceTone) -> some View {
        let background: Color = switch tone {
        case .neutral: MerkenTheme.surfaceAlt
        case .correct: Color(red: 84 / 255, green: 203 / 255, blue: 116 / 255)
        case .wrong: Color(red: 241 / 255, green: 103 / 255, blue: 98 / 255)
        }
        let foreground: Color = tone == .neutral ? MerkenTheme.secondaryText : .white
        let prefixBackground: Color = tone == .neutral ? MerkenTheme.surface : .white.opacity(0.22)

        return HStack(spacing: 8) {
            Text(prefix)
                .font(.system(size: 10, weight: .black))
                .frame(width: 18, height: 18)
                .background(prefixBackground, in: Circle())
            Text(text)
                .font(.system(size: 10, weight: .bold))
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .background(background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var landingTagRow: some View {
        VStack(spacing: 12) {
            MerkenTheme.solidInk.frame(height: 1.5)
            let tags = ["教科書", "プリント", "ノート", "英検対策", "熟語・イディオム", "保存済み復習", "フラッシュカード"]
            LandingFlowLayout(spacing: 14, rowSpacing: 9) {
                ForEach(tags, id: \.self) { tag in
                    HStack(spacing: 6) {
                        Text(tag)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(tag == "熟語・イディオム" || tag == "フラッシュカード" ? MerkenTheme.solidInk : MerkenTheme.secondaryText)
                        Rectangle()
                            .fill(MerkenTheme.accentGreen)
                            .frame(width: 4, height: 4)
                    }
                }
            }
        }
    }

    private var howItWorksPreview: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                Text("01 /")
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .foregroundStyle(MerkenTheme.secondaryText)
                Text("HOW IT WORKS")
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .tracking(1.1)
                    .foregroundStyle(MerkenTheme.accentGreen)
            }

            Text("撮る、確認する、\n覚える。")
                .font(.system(size: 25, weight: .black))
                .foregroundStyle(MerkenTheme.solidInk)

            VStack(spacing: 0) {
                howStep(number: "01", title: "撮る", detail: "ノート、教科書、プリントをカメラで撮影するか、写真から選びます。", icon: "camera")
                howStep(number: "02", title: "抽出する", detail: "AIが英単語、和訳、品詞、例文、発音記号の候補を作ります。", icon: "sparkles")
                howStep(number: "03", title: "確認して保存", detail: "抽出結果を確認し、必要なら編集して自分の単語帳へ追加します。", icon: "checkmark")
            }
            .overlay(
                RoundedRectangle(cornerRadius: 0)
                    .stroke(MerkenTheme.solidInk, lineWidth: 1.5)
            )
        }
        .padding(.top, 12)
    }

    private func howStep(number: String, title: String, detail: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text(number)
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .foregroundStyle(MerkenTheme.accentGreen)
                Text(title)
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                Text(detail)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineSpacing(3)
            }

            Spacer(minLength: 0)

            Image(systemName: icon)
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(MerkenTheme.solidInk)
                .frame(width: 48, height: 48)
                .background(MerkenTheme.notebookPaper, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(MerkenTheme.solidInk, lineWidth: 1.25)
                )
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.paperBackground)
        .overlay(alignment: .bottom) {
            MerkenTheme.solidInk.frame(height: number == "03" ? 0 : 1.5)
        }
    }
}

private struct LandingFlowLayout: Layout {
    var spacing: CGFloat = 8
    var rowSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        layout(subviews: subviews, containerWidth: proposal.width ?? .infinity).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(subviews: subviews, containerWidth: bounds.width)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: ProposedViewSize(result.sizes[index])
            )
        }
    }

    private struct LayoutResult {
        var positions: [CGPoint]
        var sizes: [CGSize]
        var size: CGSize
    }

    private func layout(subviews: Subviews, containerWidth: CGFloat) -> LayoutResult {
        var positions: [CGPoint] = []
        var sizes: [CGSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            sizes.append(size)

            if x + size.width > containerWidth, x > 0 {
                x = 0
                y += rowHeight + rowSpacing
                rowHeight = 0
            }

            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxWidth = max(maxWidth, x)
        }

        return LayoutResult(
            positions: positions,
            sizes: sizes,
            size: CGSize(width: maxWidth, height: y + rowHeight)
        )
    }
}

private struct RootSignInView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var showingSignUp = false

    private var isSignInDisabled: Bool {
        appState.isSigningIn
            || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || password.isEmpty
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 16, weight: .black))
                                .foregroundStyle(MerkenTheme.solidInk)
                                .frame(width: 40, height: 40)
                                .background(MerkenTheme.surface, in: Circle())
                                .overlay(Circle().stroke(MerkenTheme.solidInk, lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)

                        Spacer()

                        Text("N")
                            .font(.system(size: 16, weight: .black))
                            .foregroundStyle(MerkenTheme.inverseText)
                            .frame(width: 40, height: 40)
                            .background(MerkenTheme.inverseSurface, in: Circle())
                    }

                    VStack(spacing: 8) {
                        HStack(alignment: .firstTextBaseline, spacing: 7) {
                            Text("MERKEN")
                                .font(.system(size: 34, weight: .black))
                                .tracking(5)
                            Rectangle()
                                .fill(MerkenTheme.accentGreen)
                                .frame(width: 5, height: 5)
                        }
                        .foregroundStyle(MerkenTheme.solidInk)

                        Text("単語を覚えるためのノート")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 5) {
                        Text("ログイン")
                            .font(.system(size: 27, weight: .black))
                            .foregroundStyle(MerkenTheme.solidInk)

                        Text("アカウントに接続して、続きから始める。")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    VStack(alignment: .leading, spacing: 13) {
                        signInField(label: "メールアドレス") {
                            MerkenPlaceholderTextField(
                                placeholder: "kenta@example.com",
                                text: $email,
                                keyboardType: .emailAddress,
                                textInputAutocapitalization: .never,
                                disableAutocorrection: true
                            )
                        }

                        signInField(label: "パスワード") {
                            MerkenPlaceholderSecureField(placeholder: "パスワード", text: $password)
                        }

                        Button("パスワードをお忘れですか？") {}
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(MerkenTheme.accentGreen)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .buttonStyle(.plain)
                            .padding(.top, 2)
                    }

                    if let message = appState.authErrorMessage, !message.isEmpty {
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

                    Button {
                        Task {
                            await appState.signIn(email: email, password: password)
                            if appState.isLoggedIn {
                                dismiss()
                            }
                        }
                    } label: {
                        HStack(spacing: 10) {
                            if appState.isSigningIn {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(appState.isSigningIn ? "ログイン中..." : "ログイン")
                                .font(.system(size: 16, weight: .black))
                        }
                    }
                    .disabled(isSignInDisabled)
                    .opacity(isSignInDisabled ? 0.45 : 1)
                    .buttonStyle(PrimaryGlassButton())

                    HStack(spacing: 12) {
                        Rectangle().fill(MerkenTheme.border).frame(height: 1)
                        Text("または")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Rectangle().fill(MerkenTheme.border).frame(height: 1)
                    }

                    Button {
                        showingSignUp = true
                    } label: {
                        Label("新規登録する", systemImage: "person.badge.plus")
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                    }
                    .buttonStyle(GhostGlassButton())
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.hidden)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(isPresented: $showingSignUp) {
            SignUpView()
                .environmentObject(appState)
        }
    }

    private func signInField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(MerkenTheme.secondaryText)

            content()
                .solidTextField()
        }
    }
}

private struct ScanBannerView: View {
    let state: ScanBannerState

    private var iconName: String {
        switch state.level {
        case .success:
            return "checkmark.circle.fill"
        case .warning:
            return "arrow.triangle.2.circlepath.circle.fill"
        case .error:
            return "exclamationmark.triangle.fill"
        }
    }

    private var accentColor: Color {
        switch state.level {
        case .success:
            return MerkenTheme.success
        case .warning:
            return MerkenTheme.accentBlue
        case .error:
            return MerkenTheme.warning
        }
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
        let baseContent = HStack(alignment: .top, spacing: 12) {
            Image(systemName: iconName)
                .font(.headline.weight(.semibold))
                .foregroundStyle(accentColor)
                .padding(.top, 1)

            VStack(alignment: .leading, spacing: 4) {
                Text(state.title)
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)

                Text(state.message)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        Group {
            if #available(iOS 26.0, *) {
                baseContent.glassEffect(.regular.tint(accentColor.opacity(0.20)))
            } else {
                baseContent.background(.ultraThinMaterial, in: shape)
            }
        }
        .overlay(
            shape.stroke(accentColor.opacity(0.35), lineWidth: 1)
        )
        .clipShape(shape)
        .shadow(color: Color.black.opacity(0.20), radius: 12, x: 0, y: 6)
    }
}
