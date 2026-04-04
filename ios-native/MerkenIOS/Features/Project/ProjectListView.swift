import SwiftUI

enum ProjectSortOrder: String, CaseIterable {
    case wordCount = "単語数"
    case recentlyUsed = "最近"
    case unmastered = "未習得"
}

struct GeneratingProjectCard: View {
    let context: PendingScanImportContext

    var body: some View {
        HStack(spacing: 16) {
            thumbnail

            VStack(alignment: .leading, spacing: 8) {
                Text(context.requestedProjectTitle)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text("生成中...")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.accentBlue)

                HStack(spacing: 8) {
                    placeholderChip(width: 56)
                    placeholderChip(width: 56)
                    placeholderChip(width: 56)
                }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(16)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.accentBlue.opacity(0.3), lineWidth: 1)
        )
    }

    private var thumbnail: some View {
        ZStack {
            if let iconBase64 = context.requestedProjectIconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconBase64) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 10)
            } else {
                LinearGradient(
                    colors: [
                        MerkenTheme.accentBlue.opacity(0.2),
                        MerkenTheme.accentBlue.opacity(0.05)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            Color.black.opacity(0.35)
            GeneratingProgressRing()
        }
        .frame(width: 56, height: 56)
        .clipShape(.rect(cornerRadius: 12))
    }

    private func placeholderChip(width: CGFloat) -> some View {
        Capsule()
            .fill(MerkenTheme.borderLight)
            .frame(width: width, height: 30)
    }
}

struct GeneratingProgressRing: View {
    private let duration: TimeInterval = 1.2

    var body: some View {
        TimelineView(.animation) { context in
            let elapsed = context.date.timeIntervalSinceReferenceDate
            let progress = elapsed.truncatingRemainder(dividingBy: duration) / duration
            let rotation = progress * 360

            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.2), lineWidth: 3)
                    .frame(width: 32, height: 32)

                Circle()
                    .trim(from: 0, to: 0.3)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: 32, height: 32)
                    .rotationEffect(.degrees(rotation))
            }
        }
    }
}

struct ProjectListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ProjectListViewModel()

    @State private var showingCreateSheet = false
    @State private var newProjectTitle = ""
    @State private var selectedProject: Project?
    @State private var searchText = ""
    @State private var sortOrder: ProjectSortOrder = .recentlyUsed
    @State private var projectToDelete: Project?
    @State private var projectToRename: Project?
    @State private var renameProjectTitle = ""
    @State private var projectForActions: Project?
    @State private var scrollOffset: CGFloat = 0

    private var filteredProjects: [Project] {
        let filtered = searchText.isEmpty
            ? viewModel.projects
            : viewModel.projects.filter {
                $0.title.localizedCaseInsensitiveContains(searchText)
            }

        return filtered.sorted { a, b in
            // Pinned projects always come first
            if a.isFavorite && !b.isFavorite { return true }
            if !a.isFavorite && b.isFavorite { return false }

            switch sortOrder {
            case .wordCount:
                return (viewModel.wordCounts[a.id] ?? 0) > (viewModel.wordCounts[b.id] ?? 0)
            case .recentlyUsed:
                return a.createdAt > b.createdAt
            case .unmastered:
                let aUnmastered = (viewModel.reviewCounts[a.id] ?? 0) + (viewModel.newCounts[a.id] ?? 0)
                let bUnmastered = (viewModel.reviewCounts[b.id] ?? 0) + (viewModel.newCounts[b.id] ?? 0)
                if aUnmastered == bUnmastered {
                    return a.createdAt > b.createdAt
                }
                return aUnmastered > bUnmastered
            }
        }
    }

    var body: some View {
        Group {
            if !appState.isLoggedIn {
                LoginGateView(
                    icon: "text.book.closed.fill",
                    title: "単語帳を管理しよう",
                    message: "ログインすると、単語帳の作成・管理ができるようになります。"
                ) {
                    appState.selectedTab = 4
                }
            } else {
                projectListContent
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var projectListContent: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Color.clear
                        .frame(height: 0)
                        .background(
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: TopSafeAreaScrollOffsetKey.self,
                                    value: proxy.frame(in: .named("projectListScroll")).minY
                                )
                            }
                        )

                    // Header
                    headerSection

                    // Search
                    searchBar

                    // Sort chips
                    sortChips

                    // All projects (pinned sorted to top)
                    allProjectsSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 100)
            }
            .coordinateSpace(name: "projectListScroll")
            .scrollIndicators(.hidden)
            .disableTopScrollEdgeEffectIfAvailable()
            .refreshable {
                await viewModel.load(using: appState)
            }

        }
        .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
        .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
            scrollOffset = value
        }
        .navigationDestination(item: $selectedProject) { project in
            ProjectDetailView(project: project)
        }
        .sheet(isPresented: $showingCreateSheet) {
            createProjectSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
        .alert("この単語帳を削除しますか？", isPresented: Binding(
            get: { projectToDelete != nil },
            set: { if !$0 { projectToDelete = nil } }
        )) {
            Button("削除", role: .destructive) {
                if let project = projectToDelete {
                    Task {
                        await viewModel.deleteProject(id: project.id, using: appState)
                    }
                    projectToDelete = nil
                }
            }
            Button("キャンセル", role: .cancel) {
                projectToDelete = nil
            }
        } message: {
            if let project = projectToDelete {
                Text("「\(project.title)」とすべての単語が削除されます。この操作は取り消せません。")
            }
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
        .onChange(of: appState.scrollToTopTrigger) { _ in
            if appState.selectedTab == 0 {
                dismiss()
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("マイ単語帳")
                .font(.system(size: 31.2, weight: .black))
                .foregroundStyle(MerkenTheme.primaryText)
                .tracking(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.mutedText)
            TextField("マイ単語帳を検索", text: $searchText)
                .font(.system(size: 15))
                .textFieldStyle(.plain)
        }
        .solidTextField(cornerRadius: 14)
    }

    // MARK: - Sort Chips

    private var sortChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(ProjectSortOrder.allCases, id: \.self) { order in
                    let isActive = sortOrder == order
                    Button {
                        sortOrder = order
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: chipIcon(for: order))
                                .font(.system(size: 13, weight: .semibold))

                            Text(sortChipTitle(for: order))
                                .font(.system(size: 14, weight: .bold))
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .frame(minWidth: 108, alignment: .leading)
                        .foregroundStyle(isActive ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(MerkenTheme.surface)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(
                                    isActive
                                        ? MerkenTheme.accentBlue.opacity(0.22)
                                        : MerkenTheme.borderLight,
                                    lineWidth: 1
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func chipIcon(for order: ProjectSortOrder) -> String {
        switch order {
        case .wordCount: return "line.3.horizontal.decrease"
        case .recentlyUsed: return "clock.arrow.circlepath"
        case .unmastered: return "sparkles"
        }
    }

    private func sortChipTitle(for order: ProjectSortOrder) -> String {
        switch order {
        case .wordCount: return "単語数順"
        case .recentlyUsed: return "新しい順"
        case .unmastered: return "未習得順"
        }
    }

    // MARK: - All Projects Section

    private var allProjectsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if viewModel.projects.isEmpty && !viewModel.loading {
                SolidCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("単語帳がありません")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("「+ 新規スキャン」から単語帳を追加してください。")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
            } else {
                HStack {
                    Text("すべてのマイ単語帳")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                    Text("\(filteredProjects.count)件")
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                projectGrid(filteredProjects)
            }
        }
    }

    // MARK: - Pending scan contexts (generating cards)

    private var pendingScans: [PendingScanImportContext] {
        appState.pendingScanImportContexts.values
            .filter { $0.source == .homeOrProjectList && $0.localTargetProjectId == nil }
            .sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Project List (horizontal card style)

    private func projectGrid(_ projects: [Project]) -> some View {
        LazyVStack(spacing: 10) {
            // Show generating cards for pending scans
            ForEach(pendingScans, id: \.jobId) { context in
                generatingCard(context)
            }

            ForEach(projects) { project in
                projectCard(project)
                    .onTapGesture {
                        selectedProject = project
                    }
                    .onLongPressGesture(minimumDuration: 0.35) {
                        projectForActions = project
                    }
            }
        }
    }

    private func projectCard(_ project: Project) -> some View {
        let wordCount = viewModel.wordCounts[project.id] ?? 0
        let masteredCount = viewModel.masteredCounts[project.id] ?? 0
        let reviewCount = viewModel.reviewCounts[project.id] ?? 0
        let newCount = viewModel.newCounts[project.id] ?? 0
        let thumbSize: CGFloat = 56

        return HStack(spacing: 16) {
            ZStack {
                if let iconImage = project.iconImage,
                   let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                } else {
                    let bgColor = MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
                    bgColor
                    Text(String(project.title.prefix(1)))
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: thumbSize, height: thumbSize)
            .clipShape(.rect(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 6) {
                Text(project.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(wordCount)")
                        .font(.system(size: 22, weight: .black))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("語")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                HStack(spacing: 12) {
                    projectListMetric(color: MerkenTheme.success, text: "習得 \(masteredCount)")
                    projectListMetric(color: MerkenTheme.accentBlue, text: "学習 \(reviewCount)")
                    projectListMetric(color: MerkenTheme.borderLight, text: "未学習 \(newCount)")
                }
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
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

    private func projectListMetric(color: Color, text: String) -> some View {
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

    // MARK: - Generating Card (horizontal)

    private func generatingCard(_ context: PendingScanImportContext) -> some View {
        GeneratingProjectCard(context: context)
    }

    // MARK: - Create Sheet

    private var createProjectSheet: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(alignment: .leading, spacing: 14) {
                    Text("新しい単語帳")
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                    TextField("例: TOEFL Essential", text: $newProjectTitle)
                        .textFieldStyle(.plain)
                        .solidTextField(cornerRadius: 16)
                        .accessibilityIdentifier("projectTitleField")

                    Button("作成") {
                        Task {
                            await viewModel.createProject(title: newProjectTitle, using: appState)
                            if viewModel.errorMessage == nil {
                                newProjectTitle = ""
                                showingCreateSheet = false
                            }
                        }
                    }
                    .buttonStyle(PrimaryGlassButton())
                    .accessibilityIdentifier("submitCreateProjectButton")

                    Spacer()
                }
                .padding(16)
            }
        }
    }
}
