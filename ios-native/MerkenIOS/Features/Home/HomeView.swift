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

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header — minimal
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
                        VStack(alignment: .leading, spacing: 14) {
                            Spacer().frame(height: 2)

                            // MARK: - Today's Focus (compact banner)
                            todayFocusBanner

                            // MARK: - Mini Stats Row
                            if viewModel.todayAnswered > 0 || viewModel.streakDays > 0 {
                                miniStatsRow
                            }

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

                            // MARK: - Projects (main content, promoted)
                            if !viewModel.projects.isEmpty {
                                recentProjectsSection
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 80) // room for FAB
                    }
                    .scrollIndicators(.hidden)
                    .refreshable {
                        await viewModel.load(using: appState)
                    }
                }
            }

            // MARK: - Floating Scan Button (FAB)
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        showingScan = true
                    } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 56, height: 56)
                            .background(MerkenTheme.accentBlue, in: .circle)
                            .shadow(color: MerkenTheme.accentBlue.opacity(0.35), radius: 8, x: 0, y: 4)
                    }
                    .padding(.trailing, 20)
                    .padding(.bottom, 16)
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
        .sheet(isPresented: $showingScan) {
            ScanCoordinatorView()
                .environmentObject(appState)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
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
        }
    }

    // MARK: - Header (minimal: MERKEN + Pro badge)

    private var headerSection: some View {
        HStack(alignment: .center) {
            Text("MERKEN")
                .font(.system(size: 24, weight: .bold, design: .serif))
                .foregroundStyle(MerkenTheme.primaryText)
                .tracking(2)

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

    // MARK: - Today's Focus Banner (compact)

    private var todayFocusBanner: some View {
        HStack(spacing: 12) {
            // Icon
            Image(systemName: focusBannerIcon)
                .font(.title3)
                .foregroundStyle(MerkenTheme.accentBlue)
                .frame(width: 40, height: 40)
                .background(MerkenTheme.accentBlueLight, in: .circle)

            // Text
            VStack(alignment: .leading, spacing: 2) {
                Text(focusBannerHeading)
                    .font(.system(size: 16, weight: .semibold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(focusBannerSubheading)
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer()

            // CTA arrow
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
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(MerkenTheme.accentBlue, in: .circle)
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
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(MerkenTheme.borderLight, lineWidth: 1)
        )
    }

    private func miniStat(icon: String, value: String, label: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11))
                .foregroundStyle(MerkenTheme.accentBlue)
            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: 14, weight: .bold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(label)
                    .font(.system(size: 10, design: .serif))
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
                .font(.system(size: 22, weight: .bold, design: .serif))
                .foregroundStyle(MerkenTheme.primaryText)

            Text("右下の📷ボタンから\nノートやプリントを撮影しましょう。")
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

    // MARK: - Projects Section (promoted to main content)

    private var recentProjectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("単語帳")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                if viewModel.projects.count > 6 {
                    Button {
                        showingProjectList = true
                    } label: {
                        Text("すべて見る")
                            .font(.system(size: 14, design: .serif))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }
            }

            let columns = [
                GridItem(.flexible(), spacing: 16),
                GridItem(.flexible(), spacing: 16),
                GridItem(.flexible(), spacing: 16)
            ]
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(viewModel.projects.prefix(9)) { project in
                    projectThumbnail(project)
                        .onTapGesture { detailProject = project }
                }
            }
        }
    }

    private func projectThumbnail(_ project: Project) -> some View {
        VStack(spacing: 0) {
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
                            let bgColor = MerkenTheme.placeholderColor(for: project.id, isDark: isDark)
                            bgColor
                            VStack(spacing: 2) {
                                Text(String(project.title.prefix(1)))
                                    .font(.system(size: 28, weight: .bold, design: .serif))
                                    .foregroundStyle(.white)
                                Text("\(project.title.count)語")
                                    .font(.system(size: 10, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white.opacity(0.8))
                            }
                        }
                    }
                }
                .clipShape(.rect(cornerRadius: 14))
                .overlay {
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

            Text(project.title)
                .font(.system(size: 12, design: .serif))
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
