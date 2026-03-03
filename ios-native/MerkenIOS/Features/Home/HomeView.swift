import SwiftUI

/// Wrapper to distinguish quiz navigation from project detail navigation
private struct QuizDestination: Hashable {
    let project: Project
    var preloadedWords: [Word]? = nil
    var skipSetup: Bool = false

    // Hashable conformance — only hash project to allow navigation dedup
    func hash(into hasher: inout Hasher) {
        hasher.combine(project)
        hasher.combine(skipSetup)
    }

    static func == (lhs: QuizDestination, rhs: QuizDestination) -> Bool {
        lhs.project == rhs.project && lhs.skipSetup == rhs.skipSetup
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

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var sentenceQuizDestination: SentenceQuizDestination?
    @State private var detailProject: Project?
    @State private var showingProjectList = false
    @State private var showingFavorites = false
    @State private var showingScan = false
    @State private var showingSignUp = false
    @State private var projectToDelete: Project?
    @State private var projectToRename: Project?
    @State private var renameProjectTitle = ""
    @State private var projectForActions: Project?

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                    .stickyHeaderStyle()

                if viewModel.projects.isEmpty && viewModel.todayAnswered == 0 {
                    emptyStateSection
                        .padding(.top, 5)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Spacer().frame(height: 5)

                            // MARK: - Hero
                            heroSection

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
                                            }
                                        }
                                        .buttonStyle(PrimaryGlassButton())
                                    }
                                }
                            }

                            // MARK: - Quick Links
                            quickLinksSection

                            // MARK: - Recent Projects
                            if !viewModel.projects.isEmpty {
                                recentProjectsSection
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 18)
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
        .navigationDestination(isPresented: $showingFavorites) {
            FavoritesView()
        }
        .navigationDestination(isPresented: $showingProjectList) {
            ProjectListView()
        }
        .alert(
            "単語帳名を変更",
            isPresented: Binding(
                get: { projectToRename != nil },
                set: { isPresented in
                    if !isPresented {
                        projectToRename = nil
                        renameProjectTitle = ""
                    }
                }
            )
        ) {
            TextField("単語帳名", text: $renameProjectTitle)
            Button("保存") {
                guard let project = projectToRename else { return }
                let nextTitle = renameProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                Task {
                    await viewModel.renameProject(id: project.id, title: nextTitle, using: appState)
                }
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
                set: { isPresented in
                    if !isPresented {
                        projectForActions = nil
                    }
                }
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
                    Task {
                        await viewModel.toggleFavorite(projectId: project.id, using: appState)
                    }
                }

                Button("削除", role: .destructive) {
                    projectForActions = nil
                    projectToDelete = project
                }
            }

            Button("キャンセル", role: .cancel) {
                projectForActions = nil
            }
        } message: {
            if let project = projectForActions {
                Text("「\(project.title)」")
            }
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    // MARK: - Header (MERKEN + sync + Pro)

    private var headerSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("MERKEN")
                    .font(.system(size: 26, weight: .bold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .tracking(2)
                Text("手入力ゼロで単語帳を作成")
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            Spacer()
            HStack(spacing: 8) {
                if appState.canUseCloud {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.caption.bold())
                            .foregroundStyle(MerkenTheme.success)
                        Text("同期済み")
                            .font(.caption.bold())
                            .foregroundStyle(MerkenTheme.success)
                    }
                }
                if appState.isPro {
                    HStack(spacing: 4) {
                        Image(systemName: "leaf.fill")
                            .font(.caption2)
                        Text("Pro")
                            .font(.system(size: 12, weight: .semibold, design: .serif))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(MerkenTheme.accentBlue, in: .capsule)
                }
            }
        }
    }

    // MARK: - Hero Section

    private var isDark: Bool { colorScheme == .dark }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Streak + motivation
            HStack(spacing: 12) {
                Image(systemName: "flame.fill")
                    .font(.title2)
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 44, height: 44)
                    .background(MerkenTheme.accentBlueLight, in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text(heroHeading)
                        .font(.system(size: 20, weight: .bold, design: .serif))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(heroSubheading)
                        .font(.system(size: 14, design: .serif))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            // Stat pills
            if viewModel.todayAnswered > 0 {
                HStack(spacing: 8) {
                    statPill(icon: "checkmark.circle", text: "\(viewModel.accuracyPercent)% 正答率")
                    statPill(icon: "graduationcap", text: "\(viewModel.totalWordCount) 習得")
                    if viewModel.dueWordCount > 0 {
                        statPill(icon: "clock", text: "\(viewModel.dueWordCount) 復習待ち")
                    }
                }
            }

            // CTA
            if let firstProject = viewModel.projects.first {
                if appState.isAIEnabled, viewModel.dueWordCount > 0 {
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        quizDestination = QuizDestination(
                            project: firstProject,
                            preloadedWords: viewModel.dueWords,
                            skipSetup: true
                        )
                    } label: {
                        Label("復習を始める", systemImage: "arrow.trianglehead.2.clockwise")
                    }
                    .buttonStyle(HeroCTAButton(isDark: isDark))
                } else if appState.isAIEnabled {
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        quizDestination = QuizDestination(project: firstProject)
                    } label: {
                        Label("クイズに挑戦", systemImage: "play.fill")
                    }
                    .buttonStyle(HeroCTAButton(isDark: isDark))
                } else {
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        flashcardDestination = FlashcardDestination(
                            project: firstProject,
                            preloadedWords: viewModel.preloadedWords(for: firstProject.id)
                        )
                    } label: {
                        Label("フラッシュカードで学習", systemImage: "rectangle.on.rectangle.angled")
                    }
                    .buttonStyle(HeroCTAButton(isDark: isDark))
                }
            } else {
                Text("まず単語帳を作成してください。")
                    .font(.system(size: 14, design: .serif))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
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
                .font(.system(size: 22, weight: .bold, design: .serif))
                .foregroundStyle(MerkenTheme.primaryText)

            Text("ノートやプリントを撮影して\n最初の単語帳を作りましょう。")
                .font(.system(size: 14, design: .serif))
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
                .onTapGesture {
                    showingSignUp = true
                }
                .sheet(isPresented: $showingSignUp) {
                    SignUpView()
                        .environmentObject(appState)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
    }

    // MARK: - Quick Links (4 icons)

    private var quickLinksSection: some View {
        HStack(spacing: 10) {
            quickLink(icon: "camera.fill", label: "スキャン", color: MerkenTheme.accentBlue) {
                showingScan = true
            }
            quickLink(icon: "magnifyingglass", label: "検索", color: MerkenTheme.secondaryText) {
                appState.selectedTab = 2
            }
            quickLink(icon: "flag.fill", label: "苦手単語", color: MerkenTheme.warning) {
                showingFavorites = true
            }
            quickLink(icon: "text.book.closed.fill", label: "単語帳", color: MerkenTheme.success) {
                showingProjectList = true
            }
        }
        .sheet(isPresented: $showingScan) {
            ScanCoordinatorView()
                .environmentObject(appState)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
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
                    Task {
                        await viewModel.deleteProject(id: project.id, using: appState)
                    }
                }
                projectToDelete = nil
            }
            Button("キャンセル", role: .cancel) {
                projectToDelete = nil
            }
        }
    }

    private func quickLink(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(color)
                    .frame(width: 48, height: 48)
                    .background(color.opacity(0.10), in: .circle)
                Text(label)
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(MerkenTheme.border)
                    .offset(y: 2)
            )
        }
    }

    // MARK: - Recent Projects (3-column grid)

    private var recentProjectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("最近の単語帳")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Text("すべて見る")
                    .font(.system(size: 14, design: .serif))
                    .foregroundStyle(MerkenTheme.accentBlue)
            }

            let columns = [
                GridItem(.flexible(), spacing: 18),
                GridItem(.flexible(), spacing: 18),
                GridItem(.flexible(), spacing: 18)
            ]
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(viewModel.projects.prefix(6)) { project in
                    projectThumbnail(project)
                        .onTapGesture {
                            detailProject = project
                        }
                }
            }
        }
    }

    private func projectThumbnail(_ project: Project) -> some View {
        VStack(spacing: 0) {
            // Image area with padding
            Color.clear
                .aspectRatio(1.0, contentMode: .fit)
                .overlay {
                    ZStack {
                        if let iconImage = project.iconImage,
                           let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .scaledToFill()
                        } else {
                            let bgColor = MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
                            bgColor
                            VStack(spacing: 2) {
                                Text(String(project.title.prefix(1)))
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundStyle(.white)
                                Text("\(project.title.count)語")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.white.opacity(0.8))
                            }
                        }

                    }
                }
                .clipShape(.rect(cornerRadius: 14))
                .overlay {
                    // Flag overlay — outside clipShape so it won't be clipped
                    if project.isFavorite {
                        VStack {
                            HStack {
                                Image(systemName: "flag.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.white)
                                    .padding(4)
                                    .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 5))
                                Spacer()
                            }
                            Spacer()
                        }
                        .padding(6)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 8)

            // Title inside card — fixed height so tiles align regardless of title length
            Text(project.title)
                .font(.caption)
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 32, alignment: .top)
                .padding(.horizontal, 6)
                .padding(.top, 6)
                .padding(.bottom, 8)
        }
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(
                    project.isFavorite ? MerkenTheme.success : MerkenTheme.border,
                    lineWidth: project.isFavorite ? 2.5 : 1.5
                )
        )
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(MerkenTheme.border)
                .offset(y: 2)
        )
        .onLongPressGesture(minimumDuration: 0.35) {
            projectForActions = project
        }
    }

    // MARK: - Helpers

    private var heroHeading: String {
        if viewModel.streakDays > 0 {
            return "\(viewModel.streakDays)日連続学習中"
        } else if viewModel.todayAnswered > 0 {
            return "今日も頑張っています"
        } else {
            return "今日の学習を始めよう"
        }
    }

    private var heroSubheading: String {
        if viewModel.todayAnswered > 0 {
            return "今日 \(viewModel.todayAnswered)問回答"
        } else {
            return "クイズに挑戦して単語を覚えよう"
        }
    }

    private func statPill(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.system(size: 11, weight: .semibold, design: .serif))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(MerkenTheme.accentBlueLight, in: .capsule)
        .foregroundStyle(MerkenTheme.accentBlue)
    }
}

// CTA button for hero card — teal accent, paper feel
private struct HeroCTAButton: ButtonStyle {
    var isDark: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold, design: .serif))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 14))
            .overlay(alignment: .bottom) {
                UnevenRoundedRectangle(bottomLeadingRadius: 14, bottomTrailingRadius: 14)
                    .fill(MerkenTheme.accentBlueStrong)
                    .frame(height: 3)
            }
            .clipShape(.rect(cornerRadius: 14))
            .offset(y: configuration.isPressed ? 2 : 0)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}
