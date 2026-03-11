import SwiftUI

/// Wrapper to distinguish quiz navigation from project detail navigation
private struct QuizDestination: Hashable {
    let project: Project
    var preloadedWords: [Word]? = nil
    var skipSetup: Bool = false

    func hash(into hasher: inout Hasher) {
        hasher.combine(project)
        hasher.combine(skipSetup)
    }

    static func == (lhs: QuizDestination, rhs: QuizDestination) -> Bool {
        lhs.project == rhs.project && lhs.skipSetup == rhs.skipSetup
    }
}

struct DayMasteryStory: Identifiable, Equatable {
    let id: String
    let date: Date
    let words: [Word]

    var title: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "M月d日(E)"
        return formatter.string(from: date)
    }
}

private struct HomeMasteryStoryView: View {
    let story: DayMasteryStory

    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex = 0

    private let storyBackgroundColor = MerkenTheme.background
    private let storyChromeColor = MerkenTheme.accentBlue
    private let ticketSurfaceColor = MerkenTheme.surface
    private let ticketPrimaryTextColor = MerkenTheme.primaryText
    private let ticketSecondaryTextColor = MerkenTheme.secondaryText
    private let ticketTertiaryTextColor = MerkenTheme.mutedText
    private let ticketHorizontalPadding: CGFloat = 28

    private var pageCount: Int {
        max(story.words.count, 1)
    }

    private var currentWord: Word? {
        guard !story.words.isEmpty, story.words.indices.contains(currentIndex) else { return nil }
        return story.words[currentIndex]
    }

    private var ticketHeight: CGFloat {
        min(UIScreen.main.bounds.height * 0.58, 580)
    }

    var body: some View {
        ZStack {
            AppBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                header

                VStack {
                    Spacer(minLength: 24)

                    Group {
                        if story.words.isEmpty {
                            emptyTicket
                        } else if let word = currentWord {
                            ticketCard(for: word, at: currentIndex)
                                .contentShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
                                .highPriorityGesture(storySwipeGesture)
                                .id(word.id)
                                .transition(.opacity)
                        } else {
                            emptyTicket
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: ticketHeight)

                    Spacer(minLength: 24)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .onChange(of: story.id) { _ in
            currentIndex = 0
        }
    }

    private var header: some View {
        VStack(spacing: 16) {
            HStack(spacing: 8) {
                ForEach(0..<pageCount, id: \.self) { index in
                    Capsule()
                        .fill(index <= currentIndex ? MerkenTheme.accentBlue : MerkenTheme.borderLight)
                        .frame(height: 5)
                }
            }

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ストーリーライン")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(ticketTertiaryTextColor)

                    Text(story.title)
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(ticketPrimaryTextColor)
                }

                Spacer()

                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(ticketPrimaryTextColor)
                        .frame(width: 48, height: 48)
                        .background(MerkenTheme.surfaceAlt, in: Circle())
                        .overlay(
                            Circle()
                                .stroke(MerkenTheme.borderLight, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func ticketCard(for word: Word, at index: Int) -> some View {
        ticketShell {
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 10) {
                    storyMetricTile(
                        icon: "checkmark.circle.fill",
                        label: "習得時刻",
                        value: masteryTime(for: word),
                        tint: MerkenTheme.success
                    )
                    storyMetricTile(
                        icon: "sparkles",
                        label: "達成枚数",
                        value: "\(index + 1) / \(story.words.count)",
                        tint: MerkenTheme.warning
                    )
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("習得した単語")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(ticketTertiaryTextColor)

                    Text(word.english)
                        .font(.system(size: 34, weight: .black))
                        .foregroundStyle(ticketPrimaryTextColor)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)

                    Text(word.japanese)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(ticketSecondaryTextColor)
                        .lineLimit(2)
                    
                    if let partOfSpeech = word.partOfSpeechTags?.first, !partOfSpeech.isEmpty {
                        Text(partOfSpeech)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(MerkenTheme.accentBlueLight, in: Capsule())
                    }
                }

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, ticketHorizontalPadding)
            .padding(.top, 34)
            .padding(.bottom, 28)
        } footer: {
            HStack {
                Label("左右にスワイプ", systemImage: "arrow.left.and.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ticketSecondaryTextColor)
                Spacer()
                Text("\(index + 1) / \(story.words.count)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(ticketSecondaryTextColor)
                    .monospacedDigit()
            }
        }
    }

    private var emptyTicket: some View {
        ticketShell {
            VStack(alignment: .leading, spacing: 24) {
                Image(systemName: "sparkles")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 72, height: 72)
                    .background(MerkenTheme.accentBlueLight, in: Circle())

                Text("まだ習得なし")
                    .font(.system(size: 32, weight: .black))
                    .foregroundStyle(ticketPrimaryTextColor)

                Text("この日に習得した単語はまだありません。")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(ticketPrimaryTextColor)

                Text("次の復習で習得した単語が出ると、ここにストーリーとして残ります。")
                    .font(.system(size: 17))
                    .foregroundStyle(ticketSecondaryTextColor)
                    .lineSpacing(4)

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, ticketHorizontalPadding)
            .padding(.top, 34)
            .padding(.bottom, 28)
        } footer: {
            ticketActionButton(title: "閉じる") {
                dismiss()
            }
        }
    }

    private func ticketShell<Content: View, Footer: View>(
        showsFooter: Bool = true,
        @ViewBuilder content: () -> Content,
        @ViewBuilder footer: () -> Footer
    ) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(ticketSurfaceColor)

            VStack(spacing: 0) {
                content()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                if showsFooter {
                    VStack(spacing: 0) {
                        ticketCutLine

                        footer()
                            .padding(.horizontal, ticketHorizontalPadding)
                            .padding(.top, 18)
                            .padding(.bottom, 26)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: ticketHeight)
        .overlay(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    private func ticketActionButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(PrimaryGlassButton())
    }

    private var ticketCutLine: some View {
        ZStack {
            Rectangle()
                .fill(Color.clear)
                .frame(height: 34)

            Rectangle()
                .stroke(MerkenTheme.border, style: StrokeStyle(lineWidth: 1.5, dash: [8, 8]))
                .frame(height: 1)

            HStack {
                Circle()
                    .fill(MerkenTheme.background)
                    .frame(width: 30, height: 30)
                    .offset(x: -15)

                Spacer()

                Circle()
                    .fill(MerkenTheme.background)
                    .frame(width: 30, height: 30)
                    .offset(x: 15)
            }
        }
        .padding(.top, 8)
    }

    private var storySwipeGesture: some Gesture {
        DragGesture(minimumDistance: 20)
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                guard abs(value.translation.width) > 40 else { return }

                if value.translation.width < 0 {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                        currentIndex = min(currentIndex + 1, max(story.words.count - 1, 0))
                    }
                } else {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                        currentIndex = max(currentIndex - 1, 0)
                    }
                }
            }
    }

    private func ticketInfoSection(
        title: String,
        rows: [(icon: String, label: String, value: String, color: Color)]
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(ticketSecondaryTextColor)

            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(rows.enumerated()), id: \.offset) { entry in
                    let row = entry.element
                    HStack(spacing: 14) {
                        Image(systemName: row.icon)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(row.color)
                            .frame(width: 28)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.label)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(ticketTertiaryTextColor)
                            Text(row.value)
                                .font(.system(size: 21, weight: .bold))
                                .foregroundStyle(ticketPrimaryTextColor)
                        }
                    }
                }
            }
        }
    }

    private func masteryTime(for word: Word) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "H:mm"
        return formatter.string(from: word.lastReviewedAt ?? word.createdAt)
    }

    private func storyMetricTile(
        icon: String,
        label: String,
        value: String,
        tint: Color
    ) -> some View {
        SolidPane {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(ticketTertiaryTextColor)

                    Text(value)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(ticketPrimaryTextColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
        }
    }

}

private struct FlashcardDestination: Hashable {
    let project: Project
    let preloadedWords: [Word]?

    func hash(into hasher: inout Hasher) {
        hasher.combine(project)
    }

    static func == (lhs: FlashcardDestination, rhs: FlashcardDestination) -> Bool {
        lhs.project == rhs.project
    }
}

private struct SentenceQuizDestination: Hashable {
    let project: Project
}

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = HomeViewModel()
    @StateObject private var bookshelfVM = BookshelfListViewModel()

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var sentenceQuizDestination: SentenceQuizDestination?
    @State private var detailProject: Project?
    @State private var showingProjectList = false
    @State private var showingScan = false
    @State private var projectToDelete: Project?
    @State private var projectToRename: Project?
    @State private var renameProjectTitle = ""
    @State private var projectForActions: Project?
    @State private var selectedCollection: Collection?
    @State private var showingBookshelfList = false
    @State private var selectedDayStory: DayMasteryStory?
    @State private var homeScrollOffset: CGFloat = 0
    @State private var heroRingAnimationProgress: Double = 0
    @State private var partOfSpeechAnimationProgress: Double = 0
    @State private var homeAnimationGeneration = 0
    @State private var lastHomeAnimationTriggerAt: Date = .distantPast
    @State private var didAnimateForCurrentHomeVisit = false

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        homeBodyContent
    }

    private var homeBodyContent: some View {
        homeGeometryLayer
            .modifier(HomeNavigationModifier(
                selectedDayStory: $selectedDayStory,
                quizDestination: $quizDestination,
                flashcardDestination: $flashcardDestination,
                sentenceQuizDestination: $sentenceQuizDestination,
                detailProject: $detailProject,
                selectedCollection: $selectedCollection,
                showingBookshelfList: $showingBookshelfList,
                showingScan: $showingScan,
                showingProjectList: $showingProjectList
            ))
            .modifier(HomeAlertModifier(
                projectToRename: $projectToRename,
                renameProjectTitle: $renameProjectTitle,
                projectForActions: $projectForActions,
                projectToDelete: $projectToDelete,
                viewModel: viewModel,
                appState: appState
            ))
            .modifier(HomeLifecycleModifier(
                appState: appState,
                viewModel: viewModel,
                bookshelfVM: bookshelfVM,
                quizDestination: $quizDestination,
                flashcardDestination: $flashcardDestination,
                sentenceQuizDestination: $sentenceQuizDestination,
                detailProject: $detailProject,
                onLoaded: triggerHomeAnimationsIfNeededForCurrentVisit
            ))
    }

    private var homeGeometryLayer: some View {
        GeometryReader { _ in
            homeContentLayer
                .navigationBarTitleDisplayMode(.inline)
                .toolbar(.hidden, for: .navigationBar)
                .cameraAreaGlassOverlay(scrollOffset: homeScrollOffset)
                .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
                    homeScrollOffset = value
                }
                .onChange(of: appState.selectedTab) { previousTab, selectedTab in
                    if previousTab == 0, selectedTab != 0 {
                        didAnimateForCurrentHomeVisit = false
                    }
                    if previousTab != 0, selectedTab == 0 {
                        triggerHomeAnimationsIfNeededForCurrentVisit()
                    }
                }
        }
    }

    private var homeContentLayer: some View {
        ZStack {
            AppBackground()
            LinearGradient(
                colors: [
                    MerkenTheme.accentBlue.opacity(0.06),
                    Color.clear,
                    MerkenTheme.accentBlue.opacity(0.03)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                if viewModel.projects.isEmpty && pendingHomeScans.isEmpty && viewModel.todayAnswered == 0 {
                    VStack(alignment: .leading, spacing: 18) {
                        homeLogoTitle
                        emptyStateSection
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 6)
                } else {
                    homeScrollContent
                }
            }
        }
    }

    private var homeScrollContent: some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Color.clear
                        .frame(height: 0)
                        .id("homeTop")
                        .background(
                                GeometryReader { proxy in
                                    Color.clear.preference(
                                        key: TopSafeAreaScrollOffsetKey.self,
                                        value: proxy.frame(in: .named("homeScroll")).minY
                                    )
                                }
                        )

                    homeLogoTitle

                    storylineBlock

                    heroBlock

                    if !viewModel.homePartOfSpeechWidgets.isEmpty {
                        partOfSpeechWidgetsSection
                    }

                    errorSection

                    if !viewModel.projects.isEmpty || !pendingHomeScans.isEmpty {
                        projectsSection
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    if appState.isPro {
                        bookshelfSection
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 2)
                .padding(.bottom, 100)
            }
            .coordinateSpace(name: "homeScroll")
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(using: appState)
                triggerHomeAnimations()
            }
            .onChange(of: appState.scrollToTopTrigger) { _ in
                withAnimation {
                    scrollProxy.scrollTo("homeTop", anchor: .top)
                }
                if appState.selectedTab == 0 {
                    triggerHomeAnimations()
                }
            }
        }
    }

    @ViewBuilder
    private var errorSection: some View {
        if let errorMessage = viewModel.errorMessage {
            SolidCard {
                VStack(alignment: .leading, spacing: 8) {
                    Label("データの取得に失敗しました", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(MerkenTheme.warning)
                        .font(.headline)
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                    Button("再試行") {
                        Task {
                            await viewModel.load(using: appState)
                            triggerHomeAnimations()
                        }
                    }
                    .buttonStyle(PrimaryGlassButton())
                }
            }
        }
    }

    private var homeLogoTitle: some View {
        Text("MERKEN")
            .font(.system(size: 31.2, weight: .black))
            .foregroundStyle(MerkenTheme.primaryText)
            .tracking(2)
    }

    // MARK: - Hero Block (Review CTA)

    private var reviewTargetCount: Int {
        guard viewModel.reviewMetricsLoaded else { return 0 }
        return max(viewModel.todayAnswered + viewModel.dueWordCount, 0)
    }

    private var reviewCompletedCount: Int {
        guard viewModel.reviewMetricsLoaded else { return 0 }
        return min(viewModel.todayAnswered, reviewTargetCount)
    }

    private var reviewCompletionProgress: Double {
        guard viewModel.reviewMetricsLoaded, reviewTargetCount > 0 else { return 0 }
        return Double(reviewCompletedCount) / Double(reviewTargetCount)
    }

    private func triggerHomeAnimations() {
        let now = Date()
        guard now.timeIntervalSince(lastHomeAnimationTriggerAt) > 0.22 else { return }
        lastHomeAnimationTriggerAt = now

        homeAnimationGeneration += 1
        let generation = homeAnimationGeneration
        let shouldAnimateHero = viewModel.reviewMetricsLoaded
        let shouldAnimatePartOfSpeech = !viewModel.homePartOfSpeechWidgets.isEmpty

        var resetTransaction = Transaction()
        resetTransaction.animation = nil
        withTransaction(resetTransaction) {
            heroRingAnimationProgress = 0
            partOfSpeechAnimationProgress = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            guard generation == homeAnimationGeneration else { return }

            if shouldAnimateHero {
                withAnimation(.easeOut(duration: 0.85)) {
                    heroRingAnimationProgress = 1
                }
            }

            if shouldAnimatePartOfSpeech {
                withAnimation(.easeOut(duration: 0.9).delay(0.08)) {
                    partOfSpeechAnimationProgress = 1
                }
            }
        }
    }

    private func triggerHomeAnimationsIfNeededForCurrentVisit() {
        guard appState.selectedTab == 0 else { return }
        guard !didAnimateForCurrentHomeVisit else { return }
        didAnimateForCurrentHomeVisit = true
        triggerHomeAnimations()
    }

    private func animatedProgress(
        _ progress: Double,
        animationProgress: Double,
        minimumVisibleProgress: Double = 0
    ) -> Double {
        let clamped = max(0, min(progress, 1))
        let animated = clamped * animationProgress
        guard animated > 0 else { return 0 }
        return minimumVisibleProgress > 0 ? max(minimumVisibleProgress, animated) : animated
    }

    private var isHeroLoading: Bool {
        !viewModel.reviewMetricsLoaded
    }

    private var hasReviewCTA: Bool {
        viewModel.reviewMetricsLoaded && viewModel.dueWordCount > 0 && viewModel.projects.first != nil
    }

    private var heroSecondaryText: String {
        if isHeroLoading {
            return "データを更新中"
        }
        if reviewTargetCount > 0 {
            return "\(reviewCompletedCount)/\(reviewTargetCount) 完了"
        }
        if viewModel.projectsLoaded && viewModel.projects.isEmpty {
            return "単語帳を作成して学習を始めよう"
        }
        return "今日の復習はありません"
    }

    private var heroBlock: some View {
        VStack(spacing: 10) {
            HStack(spacing: 14) {
                reviewProgressRing

                VStack(alignment: .leading, spacing: 4) {
                    Text("今日の目標")
                        .font(.system(size: 13))
                        .foregroundStyle(MerkenTheme.secondaryText)

                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(animatedHeroDueWordCount)")
                            .font(.system(size: 32, weight: .bold))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.55)
                            .allowsTightening(true)
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .contentTransition(.numericText(countsDown: false))

                        Text("語を復習")
                            .font(.system(size: 16, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .foregroundStyle(MerkenTheme.primaryText)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Text(heroSecondaryText)
                        .font(.system(size: 13, weight: .medium))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()

                Group {
                    if hasReviewCTA, let firstProject = viewModel.projects.first {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if appState.isAIEnabled, viewModel.dueWordCount > 0 {
                                quizDestination = QuizDestination(
                                    project: firstProject,
                                    preloadedWords: viewModel.dueWords,
                                    skipSetup: true
                                )
                            } else if appState.isAIEnabled {
                                quizDestination = QuizDestination(project: firstProject)
                            } else {
                                flashcardDestination = FlashcardDestination(
                                    project: firstProject,
                                    preloadedWords: viewModel.preloadedWords(for: firstProject.id)
                                )
                            }
                        } label: {
                            Image(systemName: "arrow.right")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 56, height: 56)
                                .background(MerkenTheme.accentBlue, in: .circle)
                                .opacity(heroRingAnimationProgress)
                                .scaleEffect(0.84 + (0.16 * heroRingAnimationProgress))
                                .offset(x: (1 - heroRingAnimationProgress) * 8)
                        }
                        .accessibilityLabel("復習")
                    } else {
                        Circle()
                            .fill(Color.clear)
                            .frame(width: 56, height: 56)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 22)
        .frame(minHeight: 140)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    @State private var posPage = 0

    private var animatedHeroDueWordCount: Int {
        max(0, Int((Double(viewModel.dueWordCount) * heroRingAnimationProgress).rounded()))
    }

    private var partOfSpeechWidgetsSection: some View {
        let widgets = viewModel.homePartOfSpeechWidgets
        let pages = stride(from: 0, to: widgets.count, by: 3).map { start in
            Array(widgets[start..<min(start + 3, widgets.count)])
        }
        let pageCount = pages.count

        return VStack(spacing: 8) {
            TabView(selection: $posPage) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(page) { widget in
                            partOfSpeechWidgetCard(widget)
                        }
                        // Fill empty slots so cards stay same width
                        if page.count < 3 {
                            ForEach(0..<(3 - page.count), id: \.self) { _ in
                                Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                    }
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 130)

            if pageCount > 1 {
                HStack(spacing: 6) {
                    ForEach(0..<pageCount, id: \.self) { page in
                        Circle()
                            .fill(posPage == page ? MerkenTheme.accentBlue : MerkenTheme.borderLight)
                            .frame(width: 6, height: 6)
                    }
                }
            }
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func partOfSpeechWidgetCard(_ widget: HomePartOfSpeechWidget) -> some View {
        let accentColor = partOfSpeechAccentColor(for: widget.key)
        let iconName = partOfSpeechIcon(for: widget.key)

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(widget.masteredCount)")
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("/\(widget.totalCount)語")
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .font(.system(size: 21, weight: .bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)

            Text(widget.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 2)

            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 5)

                Circle()
                    .trim(from: 0, to: animatedProgress(widget.progress, animationProgress: partOfSpeechAnimationProgress))
                    .stroke(
                        accentColor,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Image(systemName: iconName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(accentColor)
            }
            .frame(width: 54, height: 54)
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 120)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    private func partOfSpeechAccentColor(for key: String) -> Color {
        switch key {
        case "noun":
            return MerkenTheme.chartBlue
        case "verb":
            return MerkenTheme.danger
        case "adjective":
            return MerkenTheme.warning
        case "idiom":
            return MerkenTheme.success
        case "phrasal_verb":
            return Color(red: 0.18, green: 0.68, blue: 0.62)
        case "adverb":
            return Color(red: 0.37, green: 0.45, blue: 0.83)
        case "preposition":
            return Color(red: 0.32, green: 0.52, blue: 0.74)
        case "conjunction":
            return Color(red: 0.84, green: 0.52, blue: 0.20)
        case "pronoun":
            return Color(red: 0.24, green: 0.63, blue: 0.72)
        case "determiner":
            return Color(red: 0.58, green: 0.49, blue: 0.84)
        case "interjection":
            return Color(red: 0.94, green: 0.43, blue: 0.43)
        case "auxiliary":
            return Color(red: 0.46, green: 0.58, blue: 0.71)
        default:
            return MerkenTheme.secondaryText
        }
    }

    private func partOfSpeechIcon(for key: String) -> String {
        switch key {
        case "noun":
            return "tag.fill"
        case "verb":
            return "bolt.fill"
        case "adjective":
            return "sparkles"
        case "adverb":
            return "gauge.with.dots.needle.50percent"
        case "idiom":
            return "quote.opening"
        case "phrasal_verb":
            return "link"
        case "preposition":
            return "arrow.right"
        case "conjunction":
            return "point.3.connected.trianglepath.dotted"
        case "pronoun":
            return "person.fill"
        case "determiner":
            return "text.book.closed.fill"
        case "interjection":
            return "exclamationmark.bubble.fill"
        case "auxiliary":
            return "gearshape.2.fill"
        default:
            return "square.grid.2x2.fill"
        }
    }

    private var reviewProgressRing: some View {
        ZStack {
            Circle()
                .stroke(MerkenTheme.borderLight, lineWidth: 6)
            Circle()
                .trim(from: 0, to: animatedProgress(reviewCompletionProgress, animationProgress: heroRingAnimationProgress))
                .stroke(
                    MerkenTheme.accentBlue,
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 1) {
                Text("\(Int(reviewCompletionProgress * 100))%")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("完了")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
        .frame(width: 68, height: 68)
    }

    private var storylineBlock: some View {
        weeklyTracker
    }

    // MARK: - Storyline Block

    private var weeklyTracker: some View {
        let calendar = Calendar(identifier: .gregorian)
        let today = calendar.startOfDay(for: Date())
        let startDate = calendar.date(byAdding: .day, value: -5, to: today) ?? today
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let weekdayFormatter = DateFormatter()
        weekdayFormatter.locale = Locale(identifier: "ja_JP")
        weekdayFormatter.dateFormat = "E"

        return HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { offset in
                let date = calendar.date(byAdding: .day, value: offset, to: startDate) ?? today
                let dateKey = formatter.string(from: date)
                let dayNum = calendar.component(.day, from: date)
                let isToday = calendar.isDate(date, inSameDayAs: today)
                let isFutureDay = date > today
                let masteredWords = masteredWords(on: date)
                let hasMastery = !masteredWords.isEmpty

                Button {
                    guard !isFutureDay else { return }
                    selectedDayStory = DayMasteryStory(
                        id: dateKey,
                        date: date,
                        words: masteredWords
                    )
                } label: {
                    VStack(spacing: 6) {
                        Text(weekdayFormatter.string(from: date))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(
                                isToday
                                    ? MerkenTheme.accentBlue
                                    : isFutureDay
                                        ? MerkenTheme.mutedText.opacity(0.5)
                                        : MerkenTheme.mutedText
                            )

                        ZStack {
                            if isToday {
                                Circle()
                                    .fill(MerkenTheme.accentBlue)
                                    .frame(width: 36, height: 36)
                                Text("\(dayNum)")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(.white)
                            } else if isFutureDay {
                                Circle()
                                    .stroke(MerkenTheme.border.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                                    .frame(width: 36, height: 36)
                                Text("\(dayNum)")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(MerkenTheme.mutedText.opacity(0.45))
                            } else if hasMastery {
                                Circle()
                                    .fill(MerkenTheme.accentBlue.opacity(0.15))
                                    .frame(width: 36, height: 36)
                                Circle()
                                    .stroke(MerkenTheme.accentBlue, lineWidth: 2)
                                    .frame(width: 36, height: 36)
                                Text("\(dayNum)")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(MerkenTheme.primaryText)
                            } else {
                                Circle()
                                    .stroke(MerkenTheme.border, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                                    .frame(width: 36, height: 36)
                                Text("\(dayNum)")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .disabled(isFutureDay)
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 4)
    }

    private func masteredWords(on date: Date) -> [Word] {
        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: date)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart

        return viewModel.allWordsFlat
            .filter { word in
                guard word.status == .mastered else { return false }
                let masteryDate = word.lastReviewedAt ?? word.createdAt
                return masteryDate >= dayStart && masteryDate < dayEnd
            }
            .sorted {
                ($0.lastReviewedAt ?? $0.createdAt) < ($1.lastReviewedAt ?? $1.createdAt)
            }
    }

    // MARK: - Today's Focus Widget (quiz card style)

    private var todayFocusBanner: some View {
        Group {
            if let previewWord = viewModel.previewWord, viewModel.dueWordCount > 0 {
                quizCardWidget(word: previewWord)
            } else {
                fallbackBanner
            }
        }
    }

    /// Quiz-style card widget (Quizlet-inspired)
    private func quizCardWidget(word: Word) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            // Top: word + japanese + menu
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(word.english.prefix(1).uppercased() + word.english.dropFirst())
                        .font(.system(size: 29, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(1)
                    Text(word.japanese)
                        .font(.system(size: 15))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .lineLimit(1)
                }
                Spacer()
                if let firstProject = viewModel.projects.first {
                    Menu {
                        Button {
                            flashcardDestination = FlashcardDestination(
                                project: firstProject,
                                preloadedWords: viewModel.dueWords.isEmpty ? viewModel.preloadedWords(for: firstProject.id) : viewModel.dueWords
                            )
                        } label: {
                            Label("フラッシュカードで勉強", systemImage: "rectangle.portrait.on.rectangle.portrait")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .frame(width: 32, height: 32)
                    }
                } else {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }

            Text("\(viewModel.dueWordCount)語の英単語を復習しましょう")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.secondaryText)

            // CTA button
            if let firstProject = viewModel.projects.first {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if appState.isAIEnabled, viewModel.dueWordCount > 0 {
                        quizDestination = QuizDestination(
                            project: firstProject,
                            preloadedWords: viewModel.dueWords,
                            skipSetup: true
                        )
                    } else if appState.isAIEnabled {
                        quizDestination = QuizDestination(project: firstProject)
                    } else {
                        flashcardDestination = FlashcardDestination(
                            project: firstProject,
                            preloadedWords: viewModel.preloadedWords(for: firstProject.id)
                        )
                    }
                } label: {
                    Text("復習する")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 14))
                        .overlay(alignment: .bottom) {
                            UnevenRoundedRectangle(bottomLeadingRadius: 14, bottomTrailingRadius: 14)
                                .fill(MerkenTheme.accentBlueStrong)
                                .frame(height: 3)
                        }
                        .clipShape(.rect(cornerRadius: 14))
                }
            }
        }
        .padding(16)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(MerkenTheme.border)
                .offset(y: 2)
        )
    }

    /// Fallback banner when no due words
    private var fallbackBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: focusBannerIcon)
                .font(.title3)
                .foregroundStyle(MerkenTheme.accentBlue)
                .frame(width: 40, height: 40)
                .background(MerkenTheme.accentBlueLight, in: .circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(focusBannerHeading)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(focusBannerSubheading)
                    .font(.system(size: 13))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer()

            if let firstProject = viewModel.projects.first {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if appState.isAIEnabled {
                        quizDestination = QuizDestination(project: firstProject)
                    } else {
                        flashcardDestination = FlashcardDestination(
                            project: firstProject,
                            preloadedWords: viewModel.preloadedWords(for: firstProject.id)
                        )
                    }
                } label: {
                    Text("復習")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 12))
                        .overlay(alignment: .bottom) {
                            UnevenRoundedRectangle(bottomLeadingRadius: 12, bottomTrailingRadius: 12)
                                .fill(MerkenTheme.accentBlueStrong)
                                .frame(height: 3)
                        }
                        .clipShape(.rect(cornerRadius: 12))
                }
            }
        }
        .padding(14)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(MerkenTheme.border)
                .offset(y: 2)
        )
    }

    // MARK: - Mini Stats Row

    private var miniStatsRow: some View {
        HStack(spacing: 0) {
            if viewModel.streakDays > 0 {
                miniStat(icon: "flame.fill", value: "\(viewModel.streakDays)日", label: "連続")
            }
            if viewModel.todayAnswered > 0 {
                if viewModel.streakDays > 0 { miniStatDivider }
                miniStat(icon: "checkmark.circle", value: "\(viewModel.accuracyPercent)%", label: "正答率")
                miniStatDivider
                miniStat(icon: "graduationcap", value: "\(viewModel.totalWordCount)", label: "習得")
            }
            if viewModel.dueWordCount > 0 {
                miniStatDivider
                miniStat(icon: "clock", value: "\(viewModel.dueWordCount)", label: "復習待ち")
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    private func miniStat(icon: String, value: String, label: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11))
                .foregroundStyle(MerkenTheme.accentBlue)
            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(label)
                    .font(.system(size: 10))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var miniStatDivider: some View {
        Rectangle()
            .fill(MerkenTheme.borderLight)
            .frame(width: 1, height: 28)
    }

    // MARK: - Empty State

    private var emptyStateSection: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "text.book.closed.fill")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.accentBlue)
                .frame(width: 96, height: 96)
                .background(MerkenTheme.accentBlueLight, in: .circle)

            Text("単語帳がありません")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            Text("右下のスキャンボタンから\nノートやプリントを撮影しましょう。")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)

            if !appState.isLoggedIn {
                Button {
                    appState.selectedTab = 4
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .font(.system(size: 14, weight: .semibold))
                        Text("設定でログイン・登録")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(MerkenTheme.accentBlue.opacity(0.08), in: Capsule())
                }
                .buttonStyle(.plain)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
    }

    // MARK: - Projects Section (単語帳)

    private var pendingHomeScans: [PendingScanImportContext] {
        appState.pendingScanImportContexts.values
            .filter { $0.source == .homeOrProjectList && $0.localTargetProjectId == nil }
            .sorted { $0.createdAt > $1.createdAt }
    }

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Section header
            HStack {
                Text("単語帳")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                if viewModel.projects.count > 3 {
                    Button { showingProjectList = true } label: {
                        Text("すべて見る")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }
            }

            VStack(spacing: 12) {
                ForEach(pendingHomeScans, id: \.jobId) { context in
                    GeneratingProjectCard(context: context)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                ForEach(Array(viewModel.projects.prefix(3))) { project in
                    featuredProjectCard(project)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .onTapGesture { detailProject = project }
                        .onLongPressGesture(minimumDuration: 0.35) { projectForActions = project }
                }
            }
        }
        .animation(
            MerkenSpring.gentle,
            value: pendingHomeScans.map(\.jobId) + Array(viewModel.projects.prefix(3).map(\.id))
        )
    }

    // MARK: Featured Project Card (full-width, with circular progress)

    private func featuredProjectCard(_ project: Project) -> some View {
        let words = viewModel.preloadedWords(for: project.id) ?? []
        let wordCount = words.count
        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = max(wordCount - masteredCount - reviewCount, 0)
        let thumbSize: CGFloat = 86

        return HStack(spacing: 0) {
            featuredProjectThumbnail(project, thumbSize: thumbSize)
            featuredProjectInfoBlock(
                title: project.title,
                wordCount: wordCount,
                masteredCount: masteredCount,
                reviewCount: reviewCount,
                newCount: newCount
            )
        }
        .padding(10)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(
                    project.isFavorite ? MerkenTheme.accentBlue.opacity(0.55) : MerkenTheme.border,
                    lineWidth: project.isFavorite ? 1.5 : 1
                )
        )
    }

    @ViewBuilder
    private func featuredProjectThumbnail(_ project: Project, thumbSize: CGFloat) -> some View {
        ZStack {
            if let iconImage = project.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                let bgColor = MerkenTheme.placeholderColor(for: project.id, isDark: isDark)
                bgColor
                Text(String(project.title.prefix(1)))
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: thumbSize, height: thumbSize)
        .clipShape(.rect(cornerRadius: 18))
    }

    private func featuredProjectInfoBlock(
        title: String,
        wordCount: Int,
        masteredCount: Int,
        reviewCount: Int,
        newCount: Int
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)

            featuredProjectWordCount(wordCount)

            HStack(spacing: 8) {
                compactProjectMetric(icon: "checkmark.circle.fill", text: "習得 \(masteredCount)", tint: MerkenTheme.success)
                compactProjectMetric(icon: "bolt.circle.fill", text: "学習 \(reviewCount)", tint: MerkenTheme.accentBlue)
                compactProjectMetric(icon: "sparkles", text: "未学習 \(newCount)", tint: MerkenTheme.mutedText)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func featuredProjectWordCount(_ wordCount: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(wordCount)")
                .font(.system(size: 24, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(MerkenTheme.primaryText)
            Text("語")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }

    private func compactProjectMetric(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(tint)
            Text(text)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(MerkenTheme.background, in: Capsule())
    }

    // MARK: - Bookshelf Section

    @State private var showingCreateBookshelf = false

    private var bookshelfSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("本棚")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                if !bookshelfVM.collections.isEmpty {
                    Button { showingBookshelfList = true } label: {
                        Text("すべて見る")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }
            }

            if bookshelfVM.collections.isEmpty {
                // Empty state with create CTA
                SolidCard {
                    VStack(spacing: 12) {
                        Image(systemName: "books.vertical.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(MerkenTheme.accentBlue)
                        Text("本棚を作ろう")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("複数の単語帳をまとめて管理・学習できます")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)
                            .multilineTextAlignment(.center)
                        Button {
                            showingCreateBookshelf = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plus")
                                    .font(.subheadline.bold())
                                Text("本棚を作成")
                                    .font(.subheadline.bold())
                            }
                        }
                        .buttonStyle(PrimaryGlassButton())
                    }
                    .frame(maxWidth: .infinity)
                }
                .sheet(isPresented: $showingCreateBookshelf) {
                    CreateBookshelfSheet {
                        await bookshelfVM.load(using: appState)
                    }
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationContentInteraction(.resizes)
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(bookshelfVM.collections.prefix(2)) { collection in
                        homeCollectionCard(collection)
                            .onTapGesture { selectedCollection = collection }
                    }
                }
            }
        }
    }

    private func homeCollectionCard(_ collection: Collection) -> some View {
        let stat = bookshelfVM.stats[collection.id]
        let projectCount = stat?.projectCount ?? 0
        let previews = stat?.previews ?? []

        return VStack(spacing: 20) {
            homeCollectionPreviewStack(previews: previews, projectCount: projectCount)

            VStack(spacing: 6) {
                Text(collection.name)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                Text(projectCount > 0 ? "\(projectCount)冊の単語帳" : "単語帳を追加して使い始める")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 220)
        .padding(.horizontal, 18)
        .padding(.vertical, 24)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(MerkenTheme.border)
                .offset(y: 2)
        )
    }

    private func homeCollectionPreviewStack(
        previews: [CollectionProjectPreview],
        projectCount: Int
    ) -> some View {
        let frontPreview = previews.first

        return ZStack {
            RoundedRectangle(cornerRadius: 28)
                .fill(MerkenTheme.surface.opacity(0.82))
                .frame(width: 250, height: 88)
                .overlay(
                    RoundedRectangle(cornerRadius: 28)
                        .stroke(MerkenTheme.border.opacity(0.4), lineWidth: 1)
                )
                .offset(y: 26)

            RoundedRectangle(cornerRadius: 30)
                .fill(MerkenTheme.surface.opacity(0.92))
                .frame(width: 272, height: 96)
                .overlay(
                    RoundedRectangle(cornerRadius: 30)
                        .stroke(MerkenTheme.border.opacity(0.65), lineWidth: 1)
                )
                .offset(y: 12)

            HStack(spacing: 16) {
                homeCollectionCover(preview: frontPreview)

                VStack(alignment: .leading, spacing: 14) {
                    RoundedRectangle(cornerRadius: 5)
                        .fill(MerkenTheme.border.opacity(0.9))
                        .frame(width: 146, height: 11)

                    RoundedRectangle(cornerRadius: 5)
                        .fill(MerkenTheme.border.opacity(0.65))
                        .frame(width: 102, height: 11)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .frame(width: 292, height: 104)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 32))
            .overlay(
                RoundedRectangle(cornerRadius: 32)
                    .stroke(MerkenTheme.border.opacity(0.5), lineWidth: 1)
            )
            .shadow(color: .black.opacity(isDark ? 0.16 : 0.06), radius: 18, x: 0, y: 10)

            if projectCount > 3 {
                Text("+\(projectCount - 3)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(MerkenTheme.surfaceAlt, in: Capsule())
                    .overlay(
                        Capsule()
                            .stroke(MerkenTheme.border, lineWidth: 1)
                    )
                    .offset(x: 112, y: 44)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 126)
    }

    private func homeCollectionCover(preview: CollectionProjectPreview?) -> some View {
        let placeholderId = preview?.id ?? "home-bookshelf-placeholder"
        let color = MerkenTheme.placeholderColor(for: placeholderId, isDark: isDark)

        return ZStack {
            Circle()
                .fill(Color.white)
                .frame(width: 64, height: 64)
                .shadow(color: .black.opacity(isDark ? 0.12 : 0.08), radius: 8, x: 0, y: 3)

            if let preview,
               let iconImage = preview.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage, cacheKey: preview.iconImageCacheKey) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 58, height: 58)
                    .clipShape(Circle())
            } else {
                LinearGradient(
                    colors: [color, color.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Image(systemName: "books.vertical.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.95))
            }
        }
        .frame(width: 58, height: 58)
        .clipShape(Circle())
    }

    // MARK: - Focus Banner Helpers

    private var focusBannerIcon: String {
        if viewModel.dueWordCount > 0 { return "arrow.trianglehead.2.clockwise" }
        if viewModel.todayAnswered > 0 { return "checkmark.seal.fill" }
        return "book.fill"
    }

    private var focusBannerHeading: String {
        if viewModel.dueWordCount > 0 {
            return "\(viewModel.dueWordCount)語の復習待ち"
        } else if viewModel.todayAnswered > 0 {
            return "今日 \(viewModel.todayAnswered)問クリア"
        } else {
            return "今日の学習を始めよう"
        }
    }

    private var focusBannerSubheading: String {
        if viewModel.dueWordCount > 0 {
            return "タップして復習を開始"
        } else if viewModel.todayAnswered > 0 {
            return "調子いいね！続けよう"
        } else {
            return "クイズに挑戦して単語を覚えよう"
        }
    }
}

// MARK: - Navigation Modifier

private struct HomeNavigationModifier: ViewModifier {
    @Binding var selectedDayStory: DayMasteryStory?
    @Binding var quizDestination: QuizDestination?
    @Binding var flashcardDestination: FlashcardDestination?
    @Binding var sentenceQuizDestination: SentenceQuizDestination?
    @Binding var detailProject: Project?
    @Binding var selectedCollection: Collection?
    @Binding var showingBookshelfList: Bool
    @Binding var showingScan: Bool
    @Binding var showingProjectList: Bool

    @EnvironmentObject private var appState: AppState

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: $selectedDayStory) { story in
                HomeMasteryStoryView(story: story)
            }
            .navigationDestination(item: $quizDestination) { dest in
                QuizView(
                    project: dest.project,
                    preloadedWords: dest.preloadedWords,
                    skipSetup: dest.skipSetup
                )
            }
            .navigationDestination(item: $flashcardDestination) { dest in
                FlashcardView(project: dest.project, preloadedWords: dest.preloadedWords, showDismissButton: false)
            }
            .navigationDestination(item: $sentenceQuizDestination) { dest in
                SentenceQuizView(project: dest.project)
            }
            .navigationDestination(item: $detailProject) { project in
                ProjectDetailView(project: project)
            }
            .navigationDestination(item: $selectedCollection) { collection in
                BookshelfDetailView(collection: collection)
            }
            .navigationDestination(isPresented: $showingBookshelfList) {
                BookshelfListView()
            }
            .sheet(isPresented: $showingScan) {
                ScanCoordinatorView()
                    .environmentObject(appState)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .navigationDestination(isPresented: $showingProjectList) {
                ProjectListView()
            }
    }
}

// MARK: - Alert Modifier

private struct HomeAlertModifier: ViewModifier {
    @Binding var projectToRename: Project?
    @Binding var renameProjectTitle: String
    @Binding var projectForActions: Project?
    @Binding var projectToDelete: Project?

    let viewModel: HomeViewModel
    let appState: AppState

    func body(content: Content) -> some View {
        content
            .alert(
                "単語帳名を変更",
                isPresented: Binding(
                    get: { projectToRename != nil },
                    set: { if !$0 { projectToRename = nil; renameProjectTitle = "" } }
                )
            ) {
                TextField("単語帳名", text: $renameProjectTitle)
                Button("保存") {
                    guard let project = projectToRename else { return }
                    let nextTitle = renameProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task { await viewModel.renameProject(id: project.id, title: nextTitle, using: appState) }
                    projectToRename = nil
                    renameProjectTitle = ""
                }
                .disabled(renameProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("キャンセル", role: .cancel) {
                    projectToRename = nil
                    renameProjectTitle = ""
                }
            } message: {
                if let project = projectToRename {
                    Text("「\(project.title)」の名前を変更します。")
                }
            }
            .confirmationDialog(
                "操作を選択",
                isPresented: Binding(
                    get: { projectForActions != nil },
                    set: { if !$0 { projectForActions = nil } }
                ),
                titleVisibility: .visible
            ) {
                if let project = projectForActions {
                    Button("名前を変更") {
                        let target = project
                        projectForActions = nil
                        DispatchQueue.main.async {
                            projectToRename = target
                            renameProjectTitle = target.title
                        }
                    }
                    Button(project.isFavorite ? "お気に入り解除" : "お気に入り") {
                        let target = project
                        projectForActions = nil
                        Task { await viewModel.toggleFavorite(projectId: target.id, using: appState) }
                    }
                    Button("削除", role: .destructive) {
                        projectForActions = nil
                        projectToDelete = project
                    }
                }
                Button("キャンセル", role: .cancel) { projectForActions = nil }
            } message: {
                if let project = projectForActions {
                    Text("「\(project.title)」")
                }
            }
            .confirmationDialog(
                "「\(projectToDelete?.title ?? "")」を削除しますか？",
                isPresented: Binding(
                    get: { projectToDelete != nil },
                    set: { if !$0 { projectToDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("削除", role: .destructive) {
                    if let project = projectToDelete {
                        Task { await viewModel.deleteProject(id: project.id, using: appState) }
                    }
                    projectToDelete = nil
                }
                Button("キャンセル", role: .cancel) { projectToDelete = nil }
            }
    }
}

// MARK: - Lifecycle Modifier

private struct HomeLifecycleModifier: ViewModifier {
    let appState: AppState
    let viewModel: HomeViewModel
    let bookshelfVM: BookshelfListViewModel
    @Binding var quizDestination: QuizDestination?
    @Binding var flashcardDestination: FlashcardDestination?
    @Binding var sentenceQuizDestination: SentenceQuizDestination?
    @Binding var detailProject: Project?
    let onLoaded: () -> Void

    private var isShowingNestedDestination: Bool {
        quizDestination != nil ||
        flashcardDestination != nil ||
        sentenceQuizDestination != nil ||
        detailProject != nil
    }

    func body(content: Content) -> some View {
        content
            .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
                await viewModel.load(using: appState)
                await bookshelfVM.load(using: appState)
                await MainActor.run {
                    onLoaded()
                }
            }
            .onAppear {
                appState.tabBarVisible = !isShowingNestedDestination
            }
            .onChange(of: isShowingNestedDestination) { _, isShowing in
                appState.tabBarVisible = !isShowing
            }
    }
}
