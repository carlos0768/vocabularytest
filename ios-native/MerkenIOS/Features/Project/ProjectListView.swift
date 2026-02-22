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
            return filtered.sorted { $0.createdAt > $1.createdAt }
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
                    .padding(.top, 16)
                    .padding(.bottom, 10)

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
        HStack(spacing: 8) {
            ForEach(ProjectSortOrder.allCases, id: \.self) { order in
                let isActive = sortOrder == order
                Button {
                    sortOrder = order
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: chipIcon(for: order))
                            .font(.caption2)
                        Text(order.rawValue)
                            .font(.subheadline)
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
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12)
        ]
        return LazyVGrid(columns: columns, spacing: 12) {
            ForEach(projects) { project in
                projectThumbnail(project)
                    .onTapGesture {
                        selectedProject = project
                    }
            }
        }
    }

    private func projectThumbnail(_ project: Project) -> some View {
        VStack(spacing: 6) {
            Color.clear
                .aspectRatio(0.8, contentMode: .fit)
                .overlay {
                    ZStack {
                        MerkenTheme.surface

                        if let iconImage = project.iconImage,
                           let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .scaledToFill()
                        } else {
                            Text(String(project.title.prefix(1)))
                                .font(.title.bold())
                                .foregroundStyle(MerkenTheme.mutedText)
                        }

                        // Flag
                        if project.isFavorite {
                            VStack {
                                HStack {
                                    Image(systemName: "flag.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.white)
                                        .padding(5)
                                        .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 6))
                                    Spacer()
                                }
                                Spacer()
                            }
                            .padding(6)
                        }

                        // Menu
                        VStack {
                            HStack {
                                Spacer()
                                Image(systemName: "ellipsis")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.8))
                                    .padding(4)
                                    .background(.black.opacity(0.3), in: .rect(cornerRadius: 6))
                                    .padding(6)
                            }
                            Spacer()
                        }
                    }
                }
                .clipShape(.rect(cornerRadius: 20))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(
                            project.isFavorite ? MerkenTheme.success : MerkenTheme.border,
                            lineWidth: project.isFavorite ? 2.5 : 1.5
                        )
                )
                .shadow(color: MerkenTheme.border.opacity(0.4), radius: 0, x: 0, y: 2)

            Text(project.title)
                .font(.caption)
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(2)
                .multilineTextAlignment(.center)
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
