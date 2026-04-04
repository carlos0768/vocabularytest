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
                sentenceQuizDestination: $sentenceQuizDestination,
                detailProject: $detailProject,
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
                quizDestination: $quizDestination,
                flashcardDestination: $flashcardDestination,
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
                if viewModel.projects.isEmpty && viewModel.todayAnswered == 0 && homePendingScans.isEmpty {
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

                    // 2-column: compact today's goal (left) + mastery donut (right)
                    HStack(alignment: .top, spacing: 10) {
                        compactTodayGoalCard
                        masteryDonutCard
                    }

                    errorSection

                    if !viewModel.projects.isEmpty || !homePendingScans.isEmpty {
                        projectsSection
                            .transition(.move(edge: .bottom).combined(with: .opacity))
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

    // MARK: - Compact Today Goal Card (left column)

    private var reviewTargetCount: Int {
        max(viewModel.todayAnswered + viewModel.dueWordCount, 0)
    }

    private var reviewCompletedCount: Int {
        min(viewModel.todayAnswered, reviewTargetCount)
    }

    private var compactTodayGoalCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("今日の目標")
                .font(.system(size: 12))
                .foregroundStyle(MerkenTheme.secondaryText)
                .padding(.bottom, 6)

            if viewModel.dueWordCount > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(viewModel.dueWordCount)")
                        .font(.system(size: 32, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .foregroundStyle(MerkenTheme.accentBlue)
                    Text("語")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                }
                Text("\(reviewCompletedCount) / \(reviewTargetCount) 完了")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .padding(.top, 2)
            } else if reviewTargetCount > 0 {
                Text("完了！")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(MerkenTheme.success)
                Text("\(reviewCompletedCount) / \(reviewTargetCount)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .padding(.top, 2)
            } else {
                Text("復習待ちなし")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)
            }

            if let firstProject = viewModel.projects.first, viewModel.dueWordCount > 0 {
                Spacer(minLength: 0)
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if appState.isAIEnabled {
                        quizDestination = QuizDestination(
                            project: firstProject,
                            preloadedWords: viewModel.dueWords,
                            skipSetup: true
                        )
                    } else {
                        flashcardDestination = FlashcardDestination(
                            project: firstProject,
                            preloadedWords: viewModel.preloadedWords(for: firstProject.id)
                        )
                    }
                } label: {
                    HStack(spacing: 8) {
                        Text("復習を始める")
                            .font(.system(size: 17, weight: .bold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .contentShape(Rectangle())
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
    }

    // MARK: - Mastery Donut Card (right column)

    private var masteryDonutCard: some View {
        let total = viewModel.allWordsFlat.count
        let masteredCount = viewModel.allWordsFlat.filter { $0.status == .mastered }.count
        let reviewCount = viewModel.allWordsFlat.filter { $0.status == .review }.count
        let newCount = viewModel.allWordsFlat.filter { $0.status == .new }.count
        let masteredFrac = total > 0 ? Double(masteredCount) / Double(total) : 0
        let reviewFrac = total > 0 ? Double(reviewCount) / Double(total) : 0
        let masteryPercent = total > 0 ? Int(masteredFrac * 100) : 0

        return VStack(spacing: 10) {
            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 14)
                if masteredFrac > 0 {
                    Circle()
                        .trim(from: 0, to: masteredFrac)
                        .stroke(MerkenTheme.success, style: StrokeStyle(lineWidth: 14, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                }
                if reviewFrac > 0 {
                    Circle()
                        .trim(from: masteredFrac, to: masteredFrac + reviewFrac)
                        .stroke(MerkenTheme.warning, style: StrokeStyle(lineWidth: 14, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                }
                VStack(spacing: 1) {
                    Text("\(masteryPercent)%")
                        .font(.system(size: 18, weight: .black))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("習得")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
            .frame(width: 96, height: 96)

            VStack(alignment: .leading, spacing: 5) {
                donutLegendItem(color: MerkenTheme.success, label: "習得", count: masteredCount)
                donutLegendItem(color: MerkenTheme.warning, label: "学習中", count: reviewCount)
                donutLegendItem(color: MerkenTheme.borderLight, label: "未学習", count: newCount)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
    }

    private func donutLegendItem(color: Color, label: String, count: Int) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(MerkenTheme.secondaryText)
            Spacer()
            Text("\(count)")
                .font(.system(size: 10, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(MerkenTheme.primaryText)
        }
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

    // MARK: - Pending scan (生成中カード — 管理ページと同条件)

    private var homePendingScans: [PendingScanImportContext] {
        appState.pendingScanImportContexts.values
            .filter { $0.source == .homeOrProjectList && $0.localTargetProjectId == nil }
            .sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Projects Section (マイ単語帳 / 共有単語帳)

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            if !viewModel.sharedProjects.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("共有単語帳")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Spacer()
                        Button { showingProjectList = true } label: {
                            Text("管理")
                                .font(.system(size: 14))
                                .foregroundStyle(MerkenTheme.accentBlue)
                        }
                    }

                    LazyVStack(spacing: 10) {
                        ForEach(viewModel.sharedProjects) { project in
                            featuredProjectCard(project)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                                .onTapGesture { detailProject = project }
                                .onLongPressGesture(minimumDuration: 0.35) { projectForActions = project }
                        }
                    }
                }
                .animation(MerkenSpring.gentle, value: viewModel.sharedProjects.map(\.id))
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("マイ単語帳")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                    Button { showingProjectList = true } label: {
                        Text("管理")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }

                LazyVStack(spacing: 10) {
                    ForEach(homePendingScans, id: \.jobId) { context in
                        GeneratingProjectCard(context: context)
                    }
                    ForEach(viewModel.myProjects) { project in
                        featuredProjectCard(project)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .onTapGesture { detailProject = project }
                            .onLongPressGesture(minimumDuration: 0.35) { projectForActions = project }
                    }
                }
            }
            .animation(MerkenSpring.gentle, value: viewModel.myProjects.map(\.id))
            .animation(MerkenSpring.gentle, value: homePendingScans.map(\.jobId))
        }
    }

    // MARK: Featured Project Card (full-width, with circular progress)

    private func featuredProjectCard(_ project: Project) -> some View {
        let words = viewModel.preloadedWords(for: project.id) ?? []
        let wordCount = words.count
        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = max(wordCount - masteredCount - reviewCount, 0)
        let thumbSize: CGFloat = 56

        return HStack(spacing: 16) {
            featuredProjectThumbnail(project, thumbSize: thumbSize)
            featuredProjectInfoBlock(
                title: project.title,
                wordCount: wordCount,
                masteredCount: masteredCount,
                reviewCount: reviewCount,
                newCount: newCount
            )
        }
        .padding(16)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
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
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: thumbSize, height: thumbSize)
        .clipShape(.rect(cornerRadius: 12))
    }

    private func featuredProjectInfoBlock(
        title: String,
        wordCount: Int,
        masteredCount: Int,
        reviewCount: Int,
        newCount: Int
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            featuredProjectWordCount(wordCount)

            HStack(spacing: 12) {
                compactProjectMetric(color: MerkenTheme.success, text: "習得 \(masteredCount)")
                compactProjectMetric(color: MerkenTheme.accentBlue, text: "学習 \(reviewCount)")
                compactProjectMetric(color: MerkenTheme.borderLight, text: "未学習 \(newCount)")
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func featuredProjectWordCount(_ wordCount: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(wordCount)")
                .font(.system(size: 22, weight: .black))
                .monospacedDigit()
                .foregroundStyle(MerkenTheme.primaryText)
            Text("語")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }

    private func compactProjectMetric(color: Color, text: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(text)
                .font(.system(size: 12))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
        }
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
    @Binding var quizDestination: QuizDestination?
    @Binding var flashcardDestination: FlashcardDestination?
    @Binding var sentenceQuizDestination: SentenceQuizDestination?
    @Binding var detailProject: Project?

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
            }
            .onAppear {
                appState.tabBarVisible = !isShowingNestedDestination
            }
            .onChange(of: isShowingNestedDestination) { _, isShowing in
                appState.tabBarVisible = !isShowing
            }
    }
}
