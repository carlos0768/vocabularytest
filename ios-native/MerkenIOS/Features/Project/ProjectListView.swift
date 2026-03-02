import SwiftUI

enum ProjectSortOrder: String, CaseIterable {
    case newest = "新しい"
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
    @State private var sortOrder: ProjectSortOrder = .newest
    @State private var showingScan = false
    @State private var projectToDelete: Project?
    @State private var projectToRename: Project?
    @State private var renameProjectTitle = ""

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
            case .newest:
                return a.createdAt > b.createdAt
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

            VStack(spacing: 0) {
                // Fixed header
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                    .stickyHeaderStyle()

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
                    .padding(.bottom, 16)
                }
                .refreshable {
                    await viewModel.load(using: appState)
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
            Button {
                showingScan = true
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.subheadline.bold())
                    Text("新規スキャン")
                        .font(.subheadline.bold())
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(MerkenTheme.accentBlue, in: .capsule)
                .overlay(Capsule().stroke(Color.clear, lineWidth: 1))
                .background(
                    Capsule()
                        .fill(MerkenTheme.accentBlueStrong)
                        .offset(y: 2)
                )
            }
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
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
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
                        .background(
                            isActive ? MerkenTheme.accentBlue : MerkenTheme.surface,
                            in: .capsule
                        )
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
        case .newest: return "clock"
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
            GridItem(.flexible(), spacing: 18),
            GridItem(.flexible(), spacing: 18),
            GridItem(.flexible(), spacing: 18)
        ]
        return LazyVGrid(columns: columns, spacing: 14) {
            ForEach(projects) { project in
                projectThumbnail(project)
                    .onTapGesture {
                        selectedProject = project
                    }
            }
        }
    }

    private func projectThumbnail(_ project: Project) -> some View {
        // Card with image inside + title below image, menu dot outside
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 0) {
                // Image area with padding
                Color.clear
                    .aspectRatio(0.89, contentMode: .fit)
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
                                    Text("\(viewModel.wordCounts[project.id] ?? 0)語")
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
                    .stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(MerkenTheme.border)
                    .offset(y: 2)
            )

        }
        .contextMenu {
            Button {
                projectToRename = project
                renameProjectTitle = project.title
            } label: {
                Label("名前を変更", systemImage: "pencil")
            }

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
