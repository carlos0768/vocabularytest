import SwiftUI

struct ProjectDetailView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectDetailViewModel()

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var showingQuiz: String?
    @State private var showingScan = false

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    let filteredWords = viewModel.filteredWords

                    if let errorMessage = viewModel.errorMessage {
                        GlassCard {
                            Text(errorMessage)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    topCard

                    searchAndFilters

                    LazyVStack(spacing: 10) {
                        if filteredWords.isEmpty {
                            GlassCard {
                                Text("単語がありません。追加して学習を開始してください。")
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }

                        ForEach(filteredWords) { word in
                            GlassPane {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(word.english)
                                                .font(.headline)
                                                .foregroundStyle(.white)
                                            Text(word.japanese)
                                                .font(.subheadline)
                                                .foregroundStyle(MerkenTheme.secondaryText)
                                        }
                                        Spacer()
                                        Text(word.status.rawValue.uppercased())
                                            .font(.caption.bold())
                                            .foregroundStyle(statusColor(word.status))
                                    }

                                    if let example = word.exampleSentence, !example.isEmpty {
                                        Text(example)
                                            .font(.caption)
                                            .foregroundStyle(MerkenTheme.mutedText)
                                            .lineLimit(2)
                                    }

                                    HStack {
                                        Button {
                                            Task {
                                                await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                                            }
                                        } label: {
                                            Label("お気に入り", systemImage: word.isFavorite ? "heart.fill" : "heart")
                                                .font(.caption)
                                                .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.secondaryText)
                                        }

                                        Spacer()

                                        Text("編集")
                                            .font(.caption)
                                            .foregroundStyle(MerkenTheme.accentBlue)
                                            .onTapGesture {
                                                editorMode = .edit(existing: word)
                                            }

                                        Button("削除", role: .destructive) {
                                            Task {
                                                await viewModel.deleteWord(wordId: word.id, projectId: project.id, using: appState)
                                            }
                                        }
                                        .font(.caption)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(16)
            }
            .refreshable {
                await viewModel.load(projectId: project.id, using: appState)
            }
        }
        .navigationTitle(project.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        showingScan = true
                    } label: {
                        Image(systemName: "camera")
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .disabled(!appState.isLoggedIn)
                    .accessibilityIdentifier("scanToProjectButton")

                    Button {
                        editorMode = .create
                    } label: {
                        Image(systemName: "plus")
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .accessibilityIdentifier("addWordButton")
                }
            }
        }
        .fullScreenCover(isPresented: $showingScan) {
            ScanCoordinatorView(
                targetProjectId: project.id,
                targetProjectTitle: project.title
            ) { _ in
                Task {
                    await viewModel.load(projectId: project.id, using: appState)
                }
            }
            .environmentObject(appState)
        }
        .sheet(item: $editorMode, content: editorSheet)
        .navigationDestination(item: $showingQuiz) { _ in
            QuizView(project: project, preloadedWords: viewModel.words)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(projectId: project.id, using: appState)
        }
    }

    private var topCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("学習モード")
                    .font(.headline)

                Button {
                    showingQuiz = project.id
                } label: {
                    Label("4択クイズを開始", systemImage: "play.fill")
                }
                .buttonStyle(PrimaryGlassButton())
                .accessibilityIdentifier("startQuizButton")
            }
        }
    }

    private var searchAndFilters: some View {
        GlassPane {
            VStack(spacing: 10) {
                TextField("単語を検索", text: $viewModel.searchText)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.08)))

                Toggle(isOn: $viewModel.favoritesOnly) {
                    Text("お気に入りのみ")
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
    }

    @ViewBuilder
    private func editorSheet(mode: WordEditorSheet.Mode) -> some View {
        WordEditorSheet(mode: mode) { input in
            Task {
                switch mode {
                case .create:
                    await viewModel.addWord(
                        input: WordInput(
                            projectId: project.id,
                            english: input.english,
                            japanese: input.japanese,
                            distractors: input.distractors,
                            exampleSentence: input.exampleSentence,
                            exampleSentenceJa: input.exampleSentenceJa,
                            pronunciation: input.pronunciation
                        ),
                        projectId: project.id,
                        using: appState
                    )
                case .edit(let existing):
                    await viewModel.updateWord(
                        wordId: existing.id,
                        patch: WordPatch(
                            english: input.english,
                            japanese: input.japanese,
                            distractors: input.distractors,
                            exampleSentence: .some(input.exampleSentence)
                        ),
                        projectId: project.id,
                        using: appState
                    )
                }
            }
        }
    }

    private func statusColor(_ status: WordStatus) -> Color {
        switch status {
        case .new:
            return MerkenTheme.warning
        case .review:
            return MerkenTheme.accentBlue
        case .mastered:
            return MerkenTheme.success
        }
    }
}

extension WordEditorSheet.Mode: Identifiable {
    var id: String {
        switch self {
        case .create:
            return "create"
        case .edit(let existing):
            return existing.id
        }
    }
}
