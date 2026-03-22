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

    private let storyBackgroundColor = Color.white
    private let storyChromeColor = Color.black.opacity(0.92)
    private let ticketSurfaceColor = Color.white
    private let ticketPrimaryTextColor = Color.black
    private let ticketSecondaryTextColor = Color.black.opacity(0.7)
    private let ticketTertiaryTextColor = Color.black.opacity(0.55)
    private let ticketHorizontalPadding: CGFloat = 28

    private var pageCount: Int {
        max(story.words.count, 1)
    }

    private var ticketHeight: CGFloat {
        min(UIScreen.main.bounds.height * 0.62, 620)
    }

    var body: some View {
        ZStack {
            storyBackgroundColor
                .ignoresSafeArea()

            VStack(spacing: 0) {
                header

                VStack {
                    Spacer(minLength: 24)

                    Group {
                        if story.words.isEmpty {
                            emptyTicket
                        } else {
                            TabView(selection: $currentIndex) {
                                ForEach(Array(story.words.enumerated()), id: \.element.id) { index, word in
                                    ticketCard(for: word, at: index)
                                        .tag(index)
                                }
                            }
                            .tabViewStyle(.page(indexDisplayMode: .never))
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
    }

    private var header: some View {
        VStack(spacing: 18) {
            HStack(spacing: 8) {
                ForEach(0..<pageCount, id: \.self) { index in
                    Capsule()
                        .fill(index <= currentIndex ? storyChromeColor : Color.black.opacity(0.12))
                        .frame(height: 4)
                }
            }

            HStack {
                Text(story.title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(storyChromeColor, in: Capsule())

                Spacer()

                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(width: 64, height: 64)
                        .background(storyChromeColor, in: Circle())
                }
            }
        }
    }

    private func ticketCard(for word: Word, at index: Int) -> some View {
        ticketShell {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    Text("Mastered!")
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(ticketPrimaryTextColor)

                    ticketInfoSection(
                        title: "今回の記録",
                        rows: [
                            ("checkmark.circle.fill", "習得時刻", masteryTime(for: word), Color.green),
                            ("sparkles", "達成枚数", "\(index + 1) / \(story.words.count)", MerkenTheme.warning)
                        ]
                    )

                    VStack(alignment: .leading, spacing: 12) {
                        Text("習得した単語")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(ticketSecondaryTextColor)

                        Text(word.english)
                            .font(.system(size: 36, weight: .black, design: .rounded))
                            .foregroundStyle(ticketPrimaryTextColor)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)

                        Text(word.japanese)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(ticketSecondaryTextColor)
                            .lineLimit(2)
                    }

                    if let partOfSpeech = word.partOfSpeechTags?.first, !partOfSpeech.isEmpty {
                        ticketInfoSection(
                            title: "補足",
                            rows: [
                                ("tag.fill", "品詞", partOfSpeech, MerkenTheme.accentBlue)
                            ]
                        )
                    }

                    if let example = word.exampleSentence, !example.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("例文")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(ticketSecondaryTextColor)

                            Text(example)
                                .font(.system(size: 17, weight: .medium))
                                .foregroundStyle(ticketPrimaryTextColor)
                                .lineLimit(3)

                            if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                                Text(exampleJa)
                                    .font(.system(size: 14))
                                    .foregroundStyle(ticketTertiaryTextColor)
                                    .lineLimit(2)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, ticketHorizontalPadding)
                .padding(.top, 34)
                .padding(.bottom, 28)
            }
        } footer: {
            ticketActionButton(title: index == story.words.count - 1 ? "閉じる" : "次の単語") {
                advance(from: index)
            }
        }
    }

    private var emptyTicket: some View {
        ticketShell {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    Text("No Mastery Yet")
                        .font(.system(size: 32, weight: .black, design: .rounded))
                        .foregroundStyle(ticketPrimaryTextColor)

                    Text("この日に習得した単語はまだありません。")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(ticketPrimaryTextColor)

                    Text("次の復習で習得した単語が出ると、ここにストーリーとして残ります。")
                        .font(.system(size: 17))
                        .foregroundStyle(ticketSecondaryTextColor)
                        .lineSpacing(4)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.horizontal, ticketHorizontalPadding)
                .padding(.top, 34)
                .padding(.bottom, 28)
            }
        } footer: {
            ticketActionButton(title: "閉じる") {
                dismiss()
            }
        }
    }

    private func ticketShell<Content: View, Footer: View>(
        @ViewBuilder content: () -> Content,
        @ViewBuilder footer: () -> Footer
    ) -> some View {
        VStack(spacing: 0) {
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            VStack(spacing: 0) {
                ticketCutLine

                footer()
                    .padding(.horizontal, ticketHorizontalPadding)
                    .padding(.top, 18)
                    .padding(.bottom, 26)
            }
            .background(ticketSurfaceColor)
        }
        .frame(maxWidth: .infinity)
        .frame(height: ticketHeight)
        .background(ticketSurfaceColor, in: RoundedRectangle(cornerRadius: 34, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
        .shadow(color: Color.black.opacity(0.12), radius: 24, y: 14)
    }

    private func ticketActionButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
                .background(storyChromeColor, in: Capsule())
        }
    }

    private var ticketCutLine: some View {
        ZStack {
            Rectangle()
                .fill(Color.clear)
                .frame(height: 34)

            Rectangle()
                .stroke(Color.black.opacity(0.18), style: StrokeStyle(lineWidth: 1.5, dash: [8, 8]))
                .frame(height: 1)

            HStack {
                Circle()
                    .fill(storyBackgroundColor)
                    .frame(width: 30, height: 30)
                    .offset(x: -15)

                Spacer()

                Circle()
                    .fill(storyBackgroundColor)
                    .frame(width: 30, height: 30)
                    .offset(x: 15)
            }
        }
        .padding(.top, 8)
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

    private func advance(from index: Int) {
        guard index < story.words.count - 1 else {
            dismiss()
            return
        }
        withAnimation(.easeInOut(duration: 0.2)) {
            currentIndex = index + 1
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

private struct Quiz2Destination: Hashable {
    let project: Project
    let preloadedWords: [Word]?

    func hash(into hasher: inout Hasher) {
        hasher.combine(project)
    }

    static func == (lhs: Quiz2Destination, rhs: Quiz2Destination) -> Bool {
        lhs.project == rhs.project
    }
}

private struct MatchGameDestination: Hashable {
    let project: Project
    let words: [Word]

    func hash(into hasher: inout Hasher) {
        hasher.combine(project)
    }

    static func == (lhs: MatchGameDestination, rhs: MatchGameDestination) -> Bool {
        lhs.project == rhs.project
    }
}

private struct SentenceQuizDestination: Hashable {
    let project: Project
}

private struct HomeScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = HomeViewModel()
    @StateObject private var bookshelfVM = BookshelfListViewModel()

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var quiz2Destination: Quiz2Destination?
    @State private var matchGameDestination: MatchGameDestination?
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

    private var isDark: Bool { colorScheme == .dark }

    private var headerGlassProgress: CGFloat {
        let scrolledDistance = max(-homeScrollOffset, 0)
        return min(scrolledDistance / 18, 1)
    }

    var body: some View {
        homeBodyContent
    }

    private var homeBodyContent: some View {
        homeGeometryLayer
            .modifier(HomeNavigationModifier(
                selectedDayStory: $selectedDayStory,
                quizDestination: $quizDestination,
                flashcardDestination: $flashcardDestination,
                quiz2Destination: $quiz2Destination,
                matchGameDestination: $matchGameDestination,
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
                quiz2Destination: $quiz2Destination,
                matchGameDestination: $matchGameDestination,
                sentenceQuizDestination: $sentenceQuizDestination,
                detailProject: $detailProject
            ))
    }

    private var homeGeometryLayer: some View {
        GeometryReader { geometry in
            homeContentLayer
                .navigationBarTitleDisplayMode(.inline)
                .toolbar(.hidden, for: .navigationBar)
                .overlay(alignment: .top) {
                    homeHeaderGlassCover(safeAreaTop: geometry.safeAreaInsets.top)
                }
                .onPreferenceChange(HomeScrollOffsetKey.self) { value in
                    homeScrollOffset = value
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
                if viewModel.projects.isEmpty && viewModel.todayAnswered == 0 {
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
                                    key: HomeScrollOffsetKey.self,
                                    value: proxy.frame(in: .named("homeScroll")).minY
                                )
                            }
                        )

                    homeLogoTitle

                    projectsSection
                        .transition(.move(edge: .bottom).combined(with: .opacity))

                    studyModesSection

                    heroBlock

                    homeLearningStateSection

                    errorSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 2)
                .padding(.bottom, 100)
            }
            .coordinateSpace(name: "homeScroll")
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(using: appState)
            }
            .onChange(of: appState.scrollToTopTrigger) { _ in
                withAnimation {
                    scrollProxy.scrollTo("homeTop", anchor: .top)
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
                        Task { await viewModel.load(using: appState) }
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

    private func homeHeaderGlassCover(safeAreaTop: CGFloat) -> some View {
        homeHeaderGlassBackground(safeAreaTop: safeAreaTop)
            .opacity(headerGlassProgress)
            .offset(y: -safeAreaTop)
            .allowsHitTesting(false)
            .animation(.easeOut(duration: 0.18), value: headerGlassProgress)
    }

    @ViewBuilder
    private func homeHeaderGlassBackground(safeAreaTop: CGFloat) -> some View {
        let headerHeight = safeAreaTop + 56
        let glassLayer = Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: headerHeight)
            .clipShape(Rectangle())

        if #available(iOS 26.0, *) {
            glassLayer
                .glassEffect(.regular.tint(Color.white.opacity(0.20)))
        } else {
            glassLayer
                .background(.ultraThinMaterial)
        }
    }

    // MARK: - Hero Block (Review CTA)

    private var reviewTargetCount: Int {
        max(viewModel.todayAnswered + viewModel.dueWordCount, 0)
    }

    private var reviewCompletedCount: Int {
        min(viewModel.todayAnswered, reviewTargetCount)
    }

    private var reviewCompletionProgress: Double {
        guard reviewTargetCount > 0 else { return 0 }
        return Double(reviewCompletedCount) / Double(reviewTargetCount)
    }

    private var heroBlock: some View {
        VStack(spacing: 10) {
            if viewModel.dueWordCount > 0 {
                HStack(spacing: 14) {
                    reviewProgressRing

                    VStack(alignment: .leading, spacing: 4) {
                        Text("今日の目標")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(viewModel.dueWordCount)")
                                .font(.system(size: 32, weight: .bold))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.55)
                                .allowsTightening(true)
                                .foregroundStyle(MerkenTheme.accentBlue)
                            Text("語を復習")
                                .font(.system(size: 16, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .foregroundStyle(MerkenTheme.primaryText)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(reviewCompletedCount)/\(reviewTargetCount) 完了")
                            .font(.system(size: 13, weight: .medium))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    Spacer()
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
                            Image(systemName: "arrow.right")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 56, height: 56)
                                .background(MerkenTheme.accentBlue, in: .circle)
                        }
                        .accessibilityLabel("復習")
                    }
                }
            } else if reviewTargetCount > 0 {
                HStack(spacing: 14) {
                    reviewProgressRing

                    VStack(alignment: .leading, spacing: 4) {
                        Text("今日の復習")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Text("完了しました")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("\(reviewCompletedCount)/\(reviewTargetCount) 完了")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Spacer()
                }
            } else {
                // No due words — show encouragement
                HStack(spacing: 12) {
                    Image(systemName: focusBannerIcon)
                        .font(.title3)
                        .foregroundStyle(MerkenTheme.accentBlue)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(focusBannerHeading)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text(focusBannerSubheading)
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    Spacer()
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

    private var homeLearningStateSection: some View {
        let total = viewModel.allWordsFlat.count
        let masteredCount = viewModel.allWordsFlat.filter { $0.status == .mastered }.count
        let reviewCount = viewModel.allWordsFlat.filter { $0.status == .review }.count
        let newCount = viewModel.allWordsFlat.filter { $0.status == .new }.count

        return HStack(alignment: .top, spacing: 10) {
            homeLearningStateCard(
                label: "習得",
                count: masteredCount,
                total: total,
                color: MerkenTheme.success,
                icon: "checkmark.seal.fill"
            )

            homeLearningStateCard(
                label: "学習中",
                count: reviewCount,
                total: total,
                color: MerkenTheme.accentBlue,
                icon: "arrow.trianglehead.2.clockwise"
            )

            homeLearningStateCard(
                label: "未学習",
                count: newCount,
                total: total,
                color: MerkenTheme.mutedText,
                icon: "sparkle"
            )
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func homeLearningStateCard(
        label: String,
        count: Int,
        total: Int,
        color: Color,
        icon: String
    ) -> some View {
        let progress: CGFloat = total > 0 ? CGFloat(count) / CGFloat(total) : 0

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(count)")
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("/\(total)語")
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .font(.system(size: 21, weight: .bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)

            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 2)

            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 5)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        color,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(color)
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

    private var reviewProgressRing: some View {
        ZStack {
            Circle()
                .stroke(MerkenTheme.borderLight, lineWidth: 6)
            Circle()
                .trim(from: 0, to: reviewCompletionProgress)
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

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("単語帳")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()

                Button {
                    MerkenHaptic.selection()
                    showingScan = true
                } label: {
                    Label("追加", systemImage: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(MerkenTheme.surface, in: Capsule())
                        .overlay(
                            Capsule()
                                .stroke(MerkenTheme.border, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }

            if viewModel.projects.isEmpty {
                SolidCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("まだ単語帳がありません")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("右上の追加から新しい単語帳を作成してください。")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                VStack(spacing: 12) {
                    ForEach(Array(viewModel.projects.prefix(3))) { project in
                        featuredProjectCard(project)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .onTapGesture { detailProject = project }
                            .onLongPressGesture(minimumDuration: 0.35) { projectForActions = project }
                    }

                    if viewModel.projects.count > 3 {
                        Button {
                            showingProjectList = true
                        } label: {
                            Text("すべて見る")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(MerkenTheme.accentBlue)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(MerkenTheme.border, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .animation(MerkenSpring.gentle, value: Array(viewModel.projects.prefix(3).map(\.id)))
    }

    private var studyModesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("学習モード")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            if let project = viewModel.projects.first {
                let words = viewModel.preloadedWords(for: project.id) ?? []

                VStack(spacing: 10) {
                    homeStudyModeCard(
                        icon: "rectangle.portrait.on.rectangle.portrait",
                        iconColor: MerkenTheme.accentBlue,
                        title: "フラッシュカード",
                        subtitle: "カードで復習",
                        disabled: words.isEmpty
                    ) {
                        flashcardDestination = FlashcardDestination(project: project, preloadedWords: words)
                    }

                    homeStudyModeCard(
                        icon: "scope",
                        iconColor: MerkenTheme.success,
                        title: "自己評価",
                        subtitle: "思い出して評価",
                        disabled: words.isEmpty
                    ) {
                        quiz2Destination = Quiz2Destination(project: project, preloadedWords: words)
                    }

                    homeStudyModeCard(
                        icon: "square.grid.2x2",
                        iconColor: MerkenTheme.warning,
                        title: "マッチ",
                        subtitle: "ペアを見つける",
                        disabled: words.count < 4
                    ) {
                        matchGameDestination = MatchGameDestination(project: project, words: words)
                    }
                }
            } else {
                SolidCard {
                    Text("単語帳を作成すると学習モードを使えます。")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func homeStudyModeCard(
        icon: String,
        iconColor: Color,
        title: String,
        subtitle: String,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(iconColor)
                    .frame(width: 34, height: 34)
                    .background(MerkenTheme.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(subtitle)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(MerkenTheme.border, lineWidth: 1)
            )
            .opacity(disabled ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
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
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(bookshelfVM.collections.prefix(4)) { collection in
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
    @Binding var quiz2Destination: Quiz2Destination?
    @Binding var matchGameDestination: MatchGameDestination?
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
            .navigationDestination(item: $quiz2Destination) { dest in
                Quiz2View(project: dest.project, preloadedWords: dest.preloadedWords)
            }
            .navigationDestination(item: $matchGameDestination) { dest in
                MatchGameView(project: dest.project, words: dest.words)
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
    @Binding var quiz2Destination: Quiz2Destination?
    @Binding var matchGameDestination: MatchGameDestination?
    @Binding var sentenceQuizDestination: SentenceQuizDestination?
    @Binding var detailProject: Project?

    private var isShowingNestedDestination: Bool {
        quizDestination != nil ||
        flashcardDestination != nil ||
        quiz2Destination != nil ||
        matchGameDestination != nil ||
        sentenceQuizDestination != nil ||
        detailProject != nil
    }

    func body(content: Content) -> some View {
        content
            .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
                await viewModel.load(using: appState)
                await bookshelfVM.load(using: appState)
            }
            .onAppear {
                appState.tabBarVisible = !isShowingNestedDestination
            }
            .onChange(of: isShowingNestedDestination) { _, isShowing in
                appState.tabBarVisible = !isShowing
            }
    }
}
