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

    private let backdropColor = Color(red: 0.18, green: 0.18, blue: 0.20)

    private var pageCount: Int {
        max(story.words.count, 1)
    }

    private var ticketHeight: CGFloat {
        UIScreen.main.bounds.height * 0.64
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [backdropColor, Color.black.opacity(0.95)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header

                Spacer(minLength: 36)

                if story.words.isEmpty {
                    emptyTicket
                } else {
                    TabView(selection: $currentIndex) {
                        ForEach(Array(story.words.enumerated()), id: \.element.id) { index, word in
                            ticketCard(for: word, at: index)
                                .tag(index)
                                .padding(.horizontal, 4)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .frame(height: ticketHeight)
                }

                Spacer(minLength: 24)
            }
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
                        .fill(index <= currentIndex ? Color.white : Color.white.opacity(0.18))
                        .frame(height: 4)
                }
            }

            HStack {
                Text(story.title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Color.black.opacity(0.45), in: Capsule())

                Spacer()

                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 64, height: 64)
                        .background(Color.black.opacity(0.45), in: Circle())
                }
            }
        }
    }

    private func ticketCard(for word: Word, at index: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 24) {
                Text("Mastered!")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundStyle(.white)

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
                        .foregroundStyle(.white.opacity(0.72))

                    Text(word.english)
                        .font(.system(size: 36, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)

                    Text(word.japanese)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white.opacity(0.86))
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
                            .foregroundStyle(.white.opacity(0.72))

                        Text(example)
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(.white)
                            .lineLimit(3)

                        if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                            Text(exampleJa)
                                .font(.system(size: 14))
                                .foregroundStyle(.white.opacity(0.6))
                                .lineLimit(2)
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 28)
            .padding(.top, 30)

            ticketCutLine

            Button {
                advance(from: index)
            } label: {
                Text(index == story.words.count - 1 ? "閉じる" : "次の単語")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
                    .background(Color.white, in: Capsule())
            }
            .padding(.horizontal, 28)
            .padding(.top, 22)
            .padding(.bottom, 26)
        }
        .frame(maxWidth: .infinity)
        .frame(height: ticketHeight)
        .background(Color.black, in: RoundedRectangle(cornerRadius: 34, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.32), radius: 26, y: 18)
    }

    private var emptyTicket: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 24) {
                Text("No Mastery Yet")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                    .foregroundStyle(.white)

                Text("この日に習得した単語はまだありません。")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)

                Text("次の復習で習得した単語が出ると、ここにストーリーとして残ります。")
                    .font(.system(size: 17))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineSpacing(4)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 28)
            .padding(.top, 30)

            ticketCutLine

            Button {
                dismiss()
            } label: {
                Text("閉じる")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
                    .background(Color.white, in: Capsule())
            }
            .padding(.horizontal, 28)
            .padding(.top, 22)
            .padding(.bottom, 26)
        }
        .frame(maxWidth: .infinity)
        .frame(height: ticketHeight)
        .background(Color.black, in: RoundedRectangle(cornerRadius: 34, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.32), radius: 26, y: 18)
    }

    private var ticketCutLine: some View {
        ZStack {
            Rectangle()
                .fill(Color.clear)
                .frame(height: 34)

            Rectangle()
                .stroke(Color.white.opacity(0.22), style: StrokeStyle(lineWidth: 1.5, dash: [8, 8]))
                .frame(height: 1)

            HStack {
                Circle()
                    .fill(backdropColor)
                    .frame(width: 30, height: 30)
                    .offset(x: -15)

                Spacer()

                Circle()
                    .fill(backdropColor)
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
                .foregroundStyle(.white.opacity(0.72))

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
                                .foregroundStyle(.white.opacity(0.55))
                            Text(row.value)
                                .font(.system(size: 21, weight: .bold))
                                .foregroundStyle(.white)
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
    @State private var showingSignUp = false
    @State private var projectToDelete: Project?
    @State private var projectToRename: Project?
    @State private var renameProjectTitle = ""
    @State private var projectForActions: Project?
    @State private var selectedCollection: Collection?
    @State private var showingBookshelfList = false
    @State private var selectedDayStory: DayMasteryStory?

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                if viewModel.projects.isEmpty && viewModel.todayAnswered == 0 {
                    emptyStateSection
                        .padding(.top, 5)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            // MARK: - Logo
                            Text("MERKEN")
                                .font(.system(size: 31.2, weight: .black))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .tracking(2)
                                .padding(.top, 12)

                            storylineBlock

                            // MARK: - Hero Block (Review)
                            heroBlock

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

                            // MARK: - Projects (単語帳セクション)
                            if !viewModel.projects.isEmpty {
                                projectsSection
                            }

                            // MARK: - Bookshelf Section
                            if appState.isPro {
                                bookshelfSection
                            }

                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                    .scrollIndicators(.hidden)
                    .refreshable {
                        await viewModel.load(using: appState)
                    }
                }
            }

        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
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
            FlashcardView(project: dest.project, preloadedWords: dest.preloadedWords)
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
        .sheet(isPresented: $showingProjectList) {
            NavigationStack {
                ProjectListView()
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationContentInteraction(.resizes)
        }
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
                Button(project.isFavorite ? "ピン解除" : "ピン留め") {
                    projectForActions = nil
                    Task { await viewModel.toggleFavorite(projectId: project.id, using: appState) }
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
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
            await bookshelfVM.load(using: appState)
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
                            Text("復習")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                                .background(MerkenTheme.accentBlue, in: .capsule)
                        }
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
        // Get start of this week (Sunday)
        let weekday = calendar.component(.weekday, from: today) // 1=Sun
        let startOfWeek = calendar.date(byAdding: .day, value: -(weekday - 1), to: today)!

        let dayLabels = ["日", "月", "火", "水", "木", "金", "土"]
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")

        return HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { offset in
                let date = calendar.date(byAdding: .day, value: offset, to: startOfWeek)!
                let dateKey = formatter.string(from: date)
                let dayNum = calendar.component(.day, from: date)
                let isToday = calendar.isDate(date, inSameDayAs: today)
                let masteredWords = masteredWords(on: date)
                let hasMastery = !masteredWords.isEmpty

                Button {
                    selectedDayStory = DayMasteryStory(
                        id: dateKey,
                        date: date,
                        words: masteredWords
                    )
                } label: {
                    VStack(spacing: 6) {
                        Text(dayLabels[offset])
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(isToday ? MerkenTheme.accentBlue : MerkenTheme.mutedText)

                        ZStack {
                            if isToday {
                                Circle()
                                    .fill(MerkenTheme.accentBlue)
                                    .frame(width: 36, height: 36)
                                Text("\(dayNum)")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(.white)
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

            Text("右下の📷ボタンから\nノートやプリントを撮影しましょう。")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)

            if !appState.isLoggedIn {
                HStack(spacing: 0) {
                    Text("アカウント登録")
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .bold()
                    Text("でクラウド保存")
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                .font(.subheadline)
                .onTapGesture { showingSignUp = true }
                .sheet(isPresented: $showingSignUp) {
                    SignUpView().environmentObject(appState)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
    }

    // MARK: - Projects Section (単語帳)

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
                ForEach(Array(viewModel.projects.prefix(3))) { project in
                    featuredProjectCard(project)
                        .onTapGesture { detailProject = project }
                        .onLongPressGesture(minimumDuration: 0.35) { projectForActions = project }
                }
            }
        }
    }

    // MARK: Featured Project Card (full-width, with circular progress)

    private func featuredProjectCard(_ project: Project) -> some View {
        let words = viewModel.preloadedWords(for: project.id) ?? []
        let wordCount = words.count
        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = words.filter { $0.status == .new }.count
        let masteryPercent = wordCount > 0 ? Double(masteredCount) / Double(wordCount) : 0

        return HStack(spacing: 14) {
            // Left: Icon
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
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(.rect(cornerRadius: 12))

            // Middle: Text info
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(project.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(1)
                    if project.isFavorite {
                        Image(systemName: "flag.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }

                Text("\(wordCount)語")
                    .font(.system(size: 13))
                    .foregroundStyle(MerkenTheme.secondaryText)

                // Status dots
                HStack(spacing: 10) {
                    statusDot(color: MerkenTheme.success, label: "習得", count: masteredCount)
                    statusDot(color: MerkenTheme.accentBlue, label: "学習", count: reviewCount)
                    statusDot(color: MerkenTheme.mutedText, label: "未学", count: newCount)
                }
            }

            Spacer()

            // Right: Circular progress ring
            ZStack {
                Circle()
                    .stroke(MerkenTheme.border, lineWidth: 4)
                    .frame(width: 52, height: 52)
                Circle()
                    .trim(from: 0, to: masteryPercent)
                    .stroke(MerkenTheme.success, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 52, height: 52)
                    .rotationEffect(.degrees(-90))
                Text("\(Int(masteryPercent * 100))%")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
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

    private func statusDot(color: Color, label: String, count: Int) -> some View {
        HStack(spacing: 3) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text("\(label) \(count)")
                .font(.system(size: 11))
                .foregroundStyle(MerkenTheme.mutedText)
        }
    }

    // MARK: - Bookshelf Section (2-column grid with mini-book thumbnails)

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

        return HStack(spacing: 0) {
            // Left ~20%: Name + stats
            VStack(spacing: 4) {
                Text(collection.name)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                Text("\(projectCount)冊")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .frame(width: 72)
            .padding(.vertical, 10)

            // Vertical divider
            Rectangle()
                .fill(MerkenTheme.border)
                .frame(width: 1)
                .padding(.vertical, 6)

            // Right: mini books
            Group {
                if previews.isEmpty {
                    HStack {
                        Spacer()
                        Image(systemName: "books.vertical")
                            .font(.system(size: 18))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Spacer()
                    }
                } else {
                    GeometryReader { geo in
                        let overlap: CGFloat = 4
                        let maxVisible = min(previews.count, max(Int(geo.size.width / 28), 3))
                        let visiblePreviews = Array(previews.prefix(maxVisible))
                        let extraCount = max(projectCount - visiblePreviews.count, 0)
                        let bookWidth: CGFloat = 30

                        HStack(spacing: 0) {
                            ForEach(Array(visiblePreviews.enumerated()), id: \.element.id) { index, preview in
                                homeMiniBook(preview, width: bookWidth)
                                    .padding(.leading, index > 0 ? -overlap : 0)
                            }
                            if extraCount > 0 {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(MerkenTheme.surfaceAlt)
                                    .frame(width: bookWidth, height: 44)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 3)
                                            .stroke(MerkenTheme.border, lineWidth: 1)
                                    )
                                    .overlay(
                                        Text("+\(extraCount)")
                                            .font(.system(size: 9, weight: .bold))
                                            .foregroundStyle(MerkenTheme.mutedText)
                                    )
                                    .padding(.leading, -overlap)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxHeight: .infinity)
                    }
                    .frame(height: 44)
                }
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)

            // Chevron
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(MerkenTheme.mutedText)
                .padding(.trailing, 12)
        }
        .frame(height: 60)
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

    private func homeMiniBook(_ preview: CollectionProjectPreview, width: CGFloat) -> some View {
        let color = MerkenTheme.placeholderColor(for: preview.id, isDark: isDark)
        let initial = String(preview.title.prefix(1)).uppercased()

        return ZStack {
            if let iconImage = preview.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage, cacheKey: preview.iconImageCacheKey) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                LinearGradient(
                    colors: [color, color.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                HStack(spacing: 0) {
                    Color.black.opacity(0.15).frame(width: 2)
                    Spacer()
                }
                Text(initial)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
        .frame(width: width, height: 44)
        .clipShape(.rect(cornerRadius: 3))
        .shadow(color: .black.opacity(0.08), radius: 1, x: 0, y: 1)
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
