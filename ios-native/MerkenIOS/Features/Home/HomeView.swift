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
}

private struct SentenceQuizDestination: Hashable {
    let project: Project
}

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = HomeViewModel()

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var sentenceQuizDestination: SentenceQuizDestination?
    @State private var detailProject: Project?
    @State private var showingScan = false
    @State private var showingSignUp = false
    @State private var showingBookshelf = false
    @State private var projectToDelete: Project?

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
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            // MARK: - Hero
                            heroSection
                                .padding(.top, 6)

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
            FlashcardView(project: dest.project)
        }
        .navigationDestination(item: $sentenceQuizDestination) { dest in
            SentenceQuizView(project: dest.project)
        }
        .navigationDestination(item: $detailProject) { project in
            ProjectDetailView(project: project)
        }
        .navigationDestination(isPresented: $showingBookshelf) {
            BookshelfTabView()
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
                    .font(.system(size: 28, weight: .black))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("手入力ゼロで単語帳を作成")
                    .font(.subheadline)
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
                        Image(systemName: "sparkles")
                            .font(.caption2)
                        Text("Pro")
                            .font(.caption.bold())
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(MerkenTheme.accentBlue, in: .capsule)
                }
            }
        }
    }

    // MARK: - Hero Section (blue gradient card)

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Streak + motivation
            HStack(spacing: 12) {
                Image(systemName: "flame.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.white.opacity(0.2), in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text(heroHeading)
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                    Text(heroSubheading)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
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
                if viewModel.dueWordCount > 0 {
                    Button {
                        quizDestination = QuizDestination(
                            project: firstProject,
                            preloadedWords: viewModel.dueWords,
                            skipSetup: true
                        )
                    } label: {
                        Label("復習を始める (\(viewModel.dueWordCount)問)", systemImage: "arrow.trianglehead.2.clockwise")
                    }
                    .buttonStyle(HeroCTAButton())
                } else {
                    Button {
                        quizDestination = QuizDestination(project: firstProject)
                    } label: {
                        Label("クイズに挑戦", systemImage: "play.fill")
                    }
                    .buttonStyle(HeroCTAButton())
                }
            } else {
                Text("まず単語帳を作成してください。")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [MerkenTheme.accentBlue, MerkenTheme.accentBlueStrong],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: .rect(cornerRadius: 22)
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
                .background(MerkenTheme.accentBlue.opacity(0.1), in: .circle)

            Text("単語帳がありません")
                .font(.title2.bold())
                .foregroundStyle(MerkenTheme.primaryText)

            Text("ノートやプリントを撮影して\n最初の単語帳を作りましょう。")
                .font(.subheadline)
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
            quickLink(icon: "books.vertical.fill", label: "本棚", color: MerkenTheme.warning) {
                showingBookshelf = true
            }
            quickLink(icon: "text.book.closed.fill", label: "単語帳", color: MerkenTheme.success) {
                appState.selectedTab = 1
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
                    .font(.caption)
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
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Text("すべて見る")
                    .font(.subheadline)
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
                            let bgColor = MerkenTheme.placeholderColor(for: project.id)
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
        .contextMenu {
            Button {
                Task {
                    await viewModel.toggleFavorite(projectId: project.id, using: appState)
                }
            } label: {
                Label(
                    project.isFavorite ? "ピン解除" : "ピン留め",
                    systemImage: project.isFavorite ? "flag.slash" : "flag"
                )
            }

            Button(role: .destructive) {
                projectToDelete = project
            } label: {
                Label("削除", systemImage: "trash")
            }
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
                .font(.caption2.bold())
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.white.opacity(0.2), in: .capsule)
        .foregroundStyle(.white)
    }
}

// White CTA button for hero card (Web-matching border-bottom 3D style)
private struct HeroCTAButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(MerkenTheme.accentBlue)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(.white, in: .rect(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(white: 0.82), lineWidth: configuration.isPressed ? 0 : 1)
            )
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(red: 0.82, green: 0.84, blue: 0.86))
                    .offset(y: configuration.isPressed ? 0 : 3)
            )
            .offset(y: configuration.isPressed ? 3 : 0)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}
