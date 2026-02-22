import SwiftUI

enum ProjectSortOrder: String, CaseIterable {
    case newest = "新しい順"
    case wordCount = "単語が多い順"
    case recentlyUsed = "最近使った順"
}

struct ProjectListView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectListViewModel()

    @State private var showingCreateSheet = false
    @State private var newProjectTitle = ""
    @State private var selectedProject: Project?
    @State private var searchText = ""
    @State private var sortOrder: ProjectSortOrder = .newest
    @State private var showingScan = false
    @State private var projectToDelete: Project?

    private var filteredProjects: [Project] {
        let filtered = searchText.isEmpty
            ? viewModel.projects
            : viewModel.projects.filter {
                $0.title.localizedCaseInsensitiveContains(searchText)
            }

        switch sortOrder {
        case .newest:
            return filtered.sorted { $0.createdAt > $1.createdAt }
        case .wordCount:
            return filtered.sorted {
                (viewModel.wordCounts[$0.id] ?? 0) > (viewModel.wordCounts[$1.id] ?? 0)
            }
        case .recentlyUsed:
            return filtered.sorted { $0.createdAt > $1.createdAt }
        }
    }

    private var pinnedProjects: [Project] {
        filteredProjects.filter { $0.isFavorite }
    }

    private var allProjects: [Project] {
        filteredProjects
    }

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

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Search
                        searchBar

                        // Sort chips
                        sortChips

                        // Pinned
                        if !pinnedProjects.isEmpty {
                            pinnedSection
                        }

                        // All
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
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(item: $selectedProject) { project in
            ProjectDetailView(project: project)
        }
        .sheet(isPresented: $showingCreateSheet) {
            createProjectSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showingScan) {
            ScanCoordinatorView()
                .environmentObject(appState)
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
                .foregroundStyle(MerkenTheme.success)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(MerkenTheme.successLight, in: .capsule)
                .overlay(Capsule().stroke(MerkenTheme.success.opacity(0.3), lineWidth: 1))
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
                        HStack(spacing: 3) {
                            Image(systemName: chipIcon(for: order))
                                .font(.caption2)
                            Text(order.rawValue)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
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
        case .newest: return "clock"
        case .wordCount: return "line.3.horizontal.decrease"
        case .recentlyUsed: return "clock.arrow.circlepath"
        }
    }

    // MARK: - Pinned Section

    private var pinnedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("📌 ピン留め")
                    .font(.subheadline.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Text("\(pinnedProjects.count)件")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            projectGrid(pinnedProjects)
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
                    Text("\(allProjects.count)件")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                projectGrid(allProjects)
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
                    .aspectRatio(0.9, contentMode: .fit)
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
                                    Text("\(viewModel.wordCounts[project.id] ?? 0)語")
                                        .font(.caption2.bold())
                                        .foregroundStyle(.white.opacity(0.8))
                                }
                            }

                            // Flag overlay
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
                                .padding(4)
                            }
                        }
                    }
                    .clipShape(.rect(cornerRadius: 14))
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

            // Menu dot — context menu at top-right, slightly outside
            Menu {
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
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption2)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .frame(width: 24, height: 24)
                    .background(MerkenTheme.surface, in: .circle)
                    .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1))
            }
            .offset(x: 4, y: -4)
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
