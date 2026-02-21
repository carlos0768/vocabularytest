import SwiftUI

struct ProjectListView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectListViewModel()

    @State private var showingCreateSheet = false
    @State private var newProjectTitle = ""
    @State private var selectedProject: Project?

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                GlassEffectContainer(spacing: 10) {
                LazyVStack(alignment: .leading, spacing: 14) {
                    topActions

                    if let errorMessage = viewModel.errorMessage {
                        GlassCard {
                            Text(errorMessage)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    if viewModel.projects.isEmpty, !viewModel.loading {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("単語帳がありません")
                                    .font(.headline)
                                Text("右上の「新規作成」から単語帳を追加してください。")
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.projects) { project in
                                GlassPane {
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(project.title)
                                                .font(.headline)
                                                .foregroundStyle(.white)
                                            Text("作成: \(Formatters.shortDate.string(from: project.createdAt))")
                                                .font(.caption)
                                                .foregroundStyle(MerkenTheme.mutedText)
                                        }
                                        Spacer()
                                        Image(systemName: "trash")
                                            .foregroundStyle(MerkenTheme.danger)
                                            .onTapGesture {
                                                Task {
                                                    await viewModel.deleteProject(id: project.id, using: appState)
                                                }
                                            }
                                    }
                                }
                                .contentShape(.rect)
                                .onTapGesture {
                                    selectedProject = project
                                }
                            }
                        }
                    }
                }
                .padding(16)
                } // GlassEffectContainer
            }
            .refreshable {
                await viewModel.load(using: appState)
            }
        }
        .navigationTitle("単語帳")
        .navigationDestination(item: $selectedProject) { project in
            ProjectDetailView(project: project)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("新規作成") {
                    showingCreateSheet = true
                }
                .foregroundStyle(MerkenTheme.accentBlue)
                .accessibilityIdentifier("createProjectButton")
            }
        }
        .sheet(isPresented: $showingCreateSheet) {
            createProjectSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var topActions: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("学習モード")
                    .font(.headline)
                Text("単語帳を開いて、単語編集や4択クイズを開始できます。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
    }

    private var createProjectSheet: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(alignment: .leading, spacing: 14) {
                    Text("新しい単語帳")
                        .font(.title3.bold())
                    TextField("例: TOEFL Essential", text: $newProjectTitle)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .glassEffect(.regular, in: .rect(cornerRadius: 14))
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
