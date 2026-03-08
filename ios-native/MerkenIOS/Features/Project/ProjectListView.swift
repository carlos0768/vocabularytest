import SwiftUI

enum ProjectSortOrder: String, CaseIterable {
    case wordCount = "単語数"
    case recentlyUsed = "最近"
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
    @State private var showingScan = false
    @State private var projectToDelete: Project?
    @State private var projectToRename: Project?
    @State private var renameProjectTitle = ""
    @State private var projectForActions: Project?

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
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var projectListContent: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
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
            .refreshable {
                await viewModel.load(using: appState)
            }

            // Floating scan button (liquid glass)
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button {
                        showingScan = true
                    } label: {
                        let baseLabel = Image(systemName: "doc.viewfinder")
                            .font(.system(size: 24, weight: .medium))
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .frame(width: 56, height: 56)
                        if #available(iOS 26.0, *) {
                            baseLabel
                                .glassEffect(.regular.interactive())
                                .clipShape(.circle)
                        } else {
                            baseLabel
                                .background(.ultraThinMaterial, in: .circle)
                                .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1))
                        }
                    }
                    .padding(.trailing, 20)
                    .padding(.bottom, 20)
                }
            }
        }
        .navigationDestination(item: $selectedProject) { project in
            ProjectDetailView(project: project)
        }
        .sheet(isPresented: $showingCreateSheet) {
            createProjectSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingScan) {
            ScanCoordinatorView()
                .environmentObject(appState)
                .presentationDetents([.medium, .large])
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
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                dismiss()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .bold))
                    Text("ホームに戻る")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(MerkenTheme.accentBlue)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(MerkenTheme.accentBlue.opacity(0.08), in: Capsule())
            }
            .buttonStyle(.plain)

            Text("単語帳")
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
            TextField("単語帳を検索", text: $searchText)
                .font(.system(size: 15))
                .textFieldStyle(.plain)
        }
        .solidTextField(cornerRadius: 14)
    }

    // MARK: - Sort Chips

    private var sortChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ProjectSortOrder.allCases, id: \.self) { order in
                    let isActive = sortOrder == order
                    Button {
                        sortOrder = order
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: chipIcon(for: order))
                                .font(.system(size: 13, weight: .semibold))
                            Text(order.rawValue)
                                .font(.system(size: 13, weight: .semibold))
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .foregroundStyle(isActive ? .white : MerkenTheme.secondaryText)
                        .background(
                            isActive ? MerkenTheme.accentBlue : MerkenTheme.surface,
                            in: .capsule
                        )
                        .overlay(
                            Capsule().stroke(
                                isActive ? Color.clear : MerkenTheme.borderLight,
                                lineWidth: 1
                            )
                        )
                    }
                }
            }
        }
    }

    private func chipIcon(for order: ProjectSortOrder) -> String {
        switch order {
        case .wordCount: return "line.3.horizontal.decrease"
        case .recentlyUsed: return "clock.arrow.circlepath"
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
                    Text("すべての単語帳")
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
        LazyVStack(spacing: 12) {
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
        let mastered = viewModel.masteredCounts[project.id] ?? 0
        let reviewing = viewModel.reviewCounts[project.id] ?? 0
        let newWords = viewModel.newCounts[project.id] ?? 0
        let thumbSize: CGFloat = 86

        return HStack(spacing: 0) {
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
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: thumbSize, height: thumbSize)
            .clipShape(.rect(cornerRadius: 18))

            VStack(alignment: .leading, spacing: 8) {
                Text(project.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(wordCount)")
                        .font(.system(size: 24, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("語")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                HStack(spacing: 8) {
                    compactMetric(icon: "checkmark.circle.fill", text: "習得 \(mastered)", tint: MerkenTheme.success)
                    compactMetric(icon: "bolt.circle.fill", text: "学習 \(reviewing)", tint: MerkenTheme.accentBlue)
                    compactMetric(icon: "sparkles", text: "未学習 \(newWords)", tint: MerkenTheme.mutedText)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .topLeading)
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

    private func compactMetric(icon: String, text: String, tint: Color) -> some View {
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

    // MARK: - Generating Card (horizontal)

    private func generatingCard(_ context: PendingScanImportContext) -> some View {
        HStack(spacing: 0) {
            ZStack {
                if let iconBase64 = context.requestedProjectIconImage,
                   let data = Data(base64Encoded: iconBase64),
                   let uiImage = UIImage(data: data) {
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
            .frame(width: 86, height: 86)
            .clipShape(.rect(cornerRadius: 18))

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
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(10)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(MerkenTheme.accentBlue.opacity(0.3), lineWidth: 1)
        )
    }

    private func placeholderChip(width: CGFloat) -> some View {
        Capsule()
            .fill(MerkenTheme.borderLight)
            .frame(width: width, height: 30)
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

// MARK: - Generating Progress Ring

private struct GeneratingProgressRing: View {
    @State private var rotation: Double = 0

    var body: some View {
        ZStack {
            // Track
            Circle()
                .stroke(Color.white.opacity(0.2), lineWidth: 4)
                .frame(width: 44, height: 44)

            // Spinning arc
            Circle()
                .trim(from: 0, to: 0.3)
                .stroke(Color.white, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 44, height: 44)
                .rotationEffect(.degrees(rotation))
        }
        .onAppear {
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                rotation = 360
            }
        }
    }
}
