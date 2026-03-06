import SwiftUI

enum ProjectSortOrder: String, CaseIterable {
    case wordCount = "単語数"
    case recentlyUsed = "最近"
}

struct ProjectListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
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
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            VStack(spacing: 0) {
                // Fixed header
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                    .background(.ultraThinMaterial)
                    .overlay(alignment: .bottom) {
                        MerkenTheme.borderLight
                            .frame(height: 1)
                    }

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Spacer().frame(height: 4)

                        // Search
                        searchBar

                        // Sort chips
                        sortChips

                        // All projects (pinned sorted to top)
                        allProjectsSection
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 80)
                }
                .refreshable {
                    await viewModel.load(using: appState)
                }
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
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("単語帳")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("学習を続ける単語帳を選択")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            Spacer()
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(MerkenTheme.mutedText)
            TextField("単語帳を検索", text: $searchText)
                .textFieldStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.borderLight.opacity(0.8), lineWidth: 1.5)
        )
    }

    // MARK: - Sort Chips

    private var sortChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(ProjectSortOrder.allCases, id: \.self) { order in
                    let isActive = sortOrder == order
                    Button {
                        sortOrder = order
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: chipIcon(for: order))
                                .font(.subheadline)
                            Text(order.rawValue)
                                .font(.subheadline)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .foregroundStyle(isActive ? .white : MerkenTheme.secondaryText)
                        .background {
                            if isActive {
                                Capsule().fill(MerkenTheme.accentBlue)
                            } else {
                                Capsule().fill(.ultraThinMaterial)
                            }
                        }
                        .overlay(
                            Capsule().stroke(
                                isActive ? Color.clear : MerkenTheme.borderLight,
                                lineWidth: isActive ? 1.5 : 1
                            )
                        )
                        .background(
                            Capsule()
                                .fill(isActive ? MerkenTheme.accentBlueStrong : MerkenTheme.border)
                                .offset(y: 2)
                        )
                    }
                }
            }
            .padding(.bottom, 2)
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
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                    Text("\(filteredProjects.count)件")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                projectGrid(filteredProjects)
            }
        }
    }

    // MARK: - Project Grid

    private func projectGrid(_ projects: [Project]) -> some View {
        let columns = [
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12)
        ]
        return LazyVGrid(columns: columns, spacing: 12) {
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
        let masteryPercent = wordCount > 0 ? Double(mastered) / Double(wordCount) : 0

        return VStack(alignment: .leading, spacing: 0) {
            // Thumbnail
            Color.clear
                .aspectRatio(1.4, contentMode: .fit)
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
                            Text(String(project.title.prefix(1)))
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                }
                .clipShape(.rect(cornerRadius: 10))
                .overlay {
                    if project.isFavorite {
                        VStack {
                            HStack {
                                Image(systemName: "flag.fill")
                                    .font(.system(size: 8))
                                    .foregroundStyle(.white)
                                    .padding(3)
                                    .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 4))
                                Spacer()
                            }
                            Spacer()
                        }
                        .padding(4)
                    }
                }
            .padding(.horizontal, 8)
            .padding(.top, 8)

            // Info section
            VStack(alignment: .leading, spacing: 4) {
                Text(project.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)

                Text("\(wordCount)語")
                    .font(.system(size: 10))
                    .foregroundStyle(MerkenTheme.secondaryText)

                // Mini progress bar
                if wordCount > 0 {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(MerkenTheme.borderLight)
                                .frame(height: 4)
                            RoundedRectangle(cornerRadius: 2)
                                .fill(MerkenTheme.accentBlue)
                                .frame(width: geo.size.width * masteryPercent, height: 4)
                        }
                    }
                    .frame(height: 4)
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)
            .padding(.bottom, 10)
        }
        .background(.ultraThinMaterial, in: .rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(
                    project.isFavorite ? MerkenTheme.success : MerkenTheme.border.opacity(0.8),
                    lineWidth: project.isFavorite ? 2.5 : 1.5
                )
        )
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(MerkenTheme.border.opacity(0.7))
                .offset(y: 4)
        )
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
