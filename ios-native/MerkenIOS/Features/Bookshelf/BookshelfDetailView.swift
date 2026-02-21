import SwiftUI

private struct QuizDestination: Hashable {
    let collectionId: String
}

private struct FlashcardDestination: Hashable {
    let collectionId: String
}

private struct SentenceQuizDestination: Hashable {
    let collectionId: String
}

struct BookshelfDetailView: View {
    let collection: Collection

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = BookshelfDetailViewModel()

    @State private var isEditingName = false
    @State private var editedName: String = ""
    @State private var editedDescription: String = ""
    @State private var showingAddProjects = false

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var sentenceQuizDestination: SentenceQuizDestination?

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                GlassEffectContainer(spacing: 10) {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if let errorMessage = viewModel.errorMessage {
                        GlassCard {
                            Text(errorMessage)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    headerCard

                    statsCard

                    studyModesCard

                    projectsSection
                }
                .padding(16)
                } // GlassEffectContainer
            }
            .refreshable {
                await viewModel.load(collectionId: collection.id, using: appState)
            }
        }
        .navigationTitle(viewModel.collection?.name ?? collection.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    editedName = viewModel.collection?.name ?? collection.name
                    editedDescription = viewModel.collection?.description ?? ""
                    isEditingName = true
                } label: {
                    Image(systemName: "pencil")
                }
                .foregroundStyle(MerkenTheme.accentBlue)
            }
        }
        .sheet(isPresented: $isEditingName) {
            editSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingAddProjects) {
            AddProjectsSheet(
                collectionId: collection.id,
                existingProjectIds: Set(viewModel.projects.map(\.id))
            ) {
                await viewModel.load(collectionId: collection.id, using: appState)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .navigationDestination(item: $quizDestination) { _ in
            QuizView(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .navigationDestination(item: $flashcardDestination) { _ in
            FlashcardView(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .navigationDestination(item: $sentenceQuizDestination) { _ in
            SentenceQuizView(
                project: dummyProject,
                preloadedWords: viewModel.allWords
            )
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(collectionId: collection.id, using: appState)
        }
    }

    /// Dummy project used as a container for quiz navigation (actual words come from preloadedWords)
    private var dummyProject: Project {
        Project(
            id: collection.id,
            userId: collection.userId,
            title: collection.name
        )
    }

    // MARK: - Header

    private var headerCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(viewModel.collection?.name ?? collection.name)
                    .font(.title2.bold())

                if let desc = viewModel.collection?.description, !desc.isEmpty {
                    Text(desc)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
    }

    // MARK: - Stats

    private var statsCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("統計")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.secondaryText)

                HStack {
                    statItem(title: "総単語数", value: "\(viewModel.allWords.count)")
                    Spacer()
                    statItem(title: "mastered", value: "\(viewModel.masteredCount)", color: MerkenTheme.success)
                    Spacer()
                    statItem(title: "review", value: "\(viewModel.reviewCount)", color: MerkenTheme.accentBlue)
                    Spacer()
                    statItem(title: "new", value: "\(viewModel.newCount)", color: MerkenTheme.warning)
                }
            }
        }
    }

    // MARK: - Study Modes

    private var studyModesCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("学習モード")
                    .font(.headline)

                if viewModel.allWords.isEmpty {
                    Text("単語がありません。プロジェクトを追加してください。")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                } else {
                    Button {
                        quizDestination = QuizDestination(collectionId: collection.id)
                    } label: {
                        Label("4択クイズ", systemImage: "play.fill")
                    }
                    .buttonStyle(PrimaryGlassButton())

                    Button {
                        flashcardDestination = FlashcardDestination(collectionId: collection.id)
                    } label: {
                        Label("フラッシュカード", systemImage: "rectangle.on.rectangle.angled")
                    }
                    .buttonStyle(GhostGlassButton())

                    if appState.isPro {
                        Button {
                            sentenceQuizDestination = SentenceQuizDestination(collectionId: collection.id)
                        } label: {
                            Label("例文クイズ", systemImage: "text.bubble")
                        }
                        .buttonStyle(GhostGlassButton())
                    }
                }
            }
        }
    }

    // MARK: - Projects Section

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("単語帳")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                Spacer()
                Button {
                    showingAddProjects = true
                } label: {
                    Label("追加", systemImage: "plus")
                        .font(.subheadline)
                }
                .foregroundStyle(MerkenTheme.accentBlue)
            }

            if viewModel.projects.isEmpty {
                GlassCard {
                    Text("まだ単語帳が追加されていません。")
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            } else {
                ForEach(viewModel.projects) { project in
                    GlassPane {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.title)
                                    .font(.headline)
                                    .foregroundStyle(.white)
                                let wordCount = viewModel.allWords.filter { $0.projectId == project.id }.count
                                Text("\(wordCount) 語")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                            Spacer()
                            Image(systemName: "minus.circle")
                                .foregroundStyle(MerkenTheme.danger)
                                .onTapGesture {
                                    Task {
                                        await viewModel.removeProject(
                                            collectionId: collection.id,
                                            projectId: project.id,
                                            using: appState
                                        )
                                    }
                                }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Edit Sheet

    private var editSheet: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(alignment: .leading, spacing: 14) {
                    Text("本棚を編集")
                        .font(.title3.bold())

                    TextField("名前", text: $editedName)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .glassEffect(.regular, in: .rect(cornerRadius: 14))

                    TextField("説明（任意）", text: $editedDescription)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .glassEffect(.regular, in: .rect(cornerRadius: 14))

                    Button("保存") {
                        Task {
                            await viewModel.updateCollection(
                                id: collection.id,
                                name: editedName,
                                description: editedDescription.isEmpty ? nil : editedDescription,
                                using: appState
                            )
                            isEditingName = false
                        }
                    }
                    .buttonStyle(PrimaryGlassButton())
                    .disabled(editedName.trimmingCharacters(in: .whitespaces).isEmpty)

                    Spacer()
                }
                .padding(16)
            }
        }
    }

    // MARK: - Helpers

    private func statItem(title: String, value: String, color: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(color)
        }
    }
}

// MARK: - Add Projects Sheet

struct AddProjectsSheet: View {
    let collectionId: String
    let existingProjectIds: Set<String>
    let onComplete: () async -> Void

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var allProjects: [Project] = []
    @State private var selectedIds: Set<String> = []
    @State private var loading = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                if loading && allProjects.isEmpty {
                    ProgressView()
                        .tint(.white)
                } else {
                    ScrollView {
                        GlassEffectContainer(spacing: 10) {
                        LazyVStack(spacing: 10) {
                            let available = allProjects.filter { !existingProjectIds.contains($0.id) }

                            if available.isEmpty {
                                GlassCard {
                                    Text("追加できる単語帳がありません。")
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }
                            } else {
                                ForEach(available) { project in
                                    GlassPane {
                                        HStack {
                                            Image(systemName: selectedIds.contains(project.id) ? "checkmark.circle.fill" : "circle")
                                                .foregroundStyle(selectedIds.contains(project.id) ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                            Text(project.title)
                                                .foregroundStyle(.white)
                                            Spacer()
                                        }
                                    }
                                    .contentShape(.rect)
                                    .onTapGesture {
                                        if selectedIds.contains(project.id) {
                                            selectedIds.remove(project.id)
                                        } else {
                                            selectedIds.insert(project.id)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(16)
                        } // GlassEffectContainer
                    }
                }
            }
            .navigationTitle("単語帳を追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("追加") {
                        Task {
                            loading = true
                            try? await appState.collectionRepository.addProjects(
                                collectionId: collectionId,
                                projectIds: Array(selectedIds)
                            )
                            await onComplete()
                            dismiss()
                        }
                    }
                    .disabled(selectedIds.isEmpty)
                    .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
            .task {
                loading = true
                let projects = try? await appState.activeRepository.fetchProjects(userId: appState.activeUserId)
                allProjects = projects ?? []
                loading = false
            }
        }
    }
}
