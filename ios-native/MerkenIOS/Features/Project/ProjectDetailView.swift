import SwiftUI

struct ProjectDetailView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectDetailViewModel()

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var showingQuiz: String?
    @State private var flashcardDestination: Project?
    @State private var sentenceQuizDestination: Project?
    @State private var showingScan = false
    @State private var searchText = ""

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
                        if let errorMessage = viewModel.errorMessage {
                            SolidCard {
                                Text(errorMessage)
                                    .foregroundStyle(MerkenTheme.warning)
                            }
                        }

                        // Flashcard preview
                        if let firstWord = viewModel.words.first {
                            flashcardPreview(firstWord)
                        }

                        // Learning modes
                        learningModesSection

                        // Word list
                        wordListSection
                    }
                    .padding(16)
                }
                .refreshable {
                    await viewModel.load(projectId: project.id, using: appState)
                }
            }
        }
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
        .navigationDestination(item: $flashcardDestination) { project in
            FlashcardView(project: project)
        }
        .navigationDestination(item: $sentenceQuizDestination) { project in
            SentenceQuizView(project: project)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(projectId: project.id, using: appState)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 12) {
            // Thumbnail circle
            ZStack {
                if let iconImage = project.iconImage,
                   let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 56, height: 56)
                        .clipShape(.circle)
                } else {
                    Circle()
                        .fill(MerkenTheme.placeholderColor(for: project.id))
                        .frame(width: 56, height: 56)
                    Text(String(project.title.prefix(1)))
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 56, height: 56)
            .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1))

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(project.title)
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .layoutPriority(-1)

                    Image(systemName: "pencil")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .fixedSize()

                    if appState.isPro {
                        HStack(spacing: 2) {
                            Image(systemName: "sparkles")
                                .font(.caption2)
                            Text("Pro")
                                .font(.caption2.bold())
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(MerkenTheme.accentBlue, in: .capsule)
                        .fixedSize()
                    }
                }
                let masteredCount = viewModel.words.filter { $0.status == .mastered }.count
                Text("\(viewModel.words.count)語 / 習得 \(masteredCount)語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .frame(minWidth: 0)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                Image(systemName: "square.and.arrow.up")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .frame(width: 36, height: 36)
                    .background(MerkenTheme.surfaceAlt, in: .circle)
                    .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1))
                Image(systemName: "trash")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.danger)
                    .frame(width: 36, height: 36)
                    .background(MerkenTheme.surfaceAlt, in: .circle)
                    .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1))
            }
        }
    }

    // MARK: - Flashcard Preview

    private func flashcardPreview(_ word: Word) -> some View {
        SolidCard {
            VStack(spacing: 12) {
                HStack {
                    Text("1/\(viewModel.words.count)")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                    Spacer()
                    Image(systemName: "speaker.wave.2")
                        .foregroundStyle(MerkenTheme.secondaryText)
                    Image(systemName: word.isFavorite ? "flag.fill" : "flag")
                        .foregroundStyle(word.isFavorite ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                }

                Text(word.english)
                    .font(.title.bold())
                    .foregroundStyle(MerkenTheme.primaryText)

                Text(word.japanese)
                    .font(.title3)
                    .foregroundStyle(MerkenTheme.secondaryText)

                if let example = word.exampleSentence, !example.isEmpty {
                    Divider()
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text("99")
                                .font(.caption2.bold())
                                .foregroundStyle(MerkenTheme.accentBlue)
                            Text("例文")
                                .font(.caption.bold())
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                        Text(example)
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        if let exJa = word.exampleSentenceJa {
                            Text(exJa)
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    // MARK: - Learning Modes (2-column grid)

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)

            let columns = [
                GridItem(.flexible(), spacing: 12),
                GridItem(.flexible(), spacing: 12)
            ]
            LazyVGrid(columns: columns, spacing: 12) {
                learningModeCard(
                    icon: "questionmark.square.fill",
                    iconColor: MerkenTheme.accentBlue,
                    title: "クイズ",
                    subtitle: "4択で確認"
                ) {
                    showingQuiz = project.id
                }

                learningModeCard(
                    icon: "scope",
                    iconColor: MerkenTheme.success,
                    title: "クイズ2",
                    subtitle: "思い出して評価"
                ) {
                    // future
                }

                learningModeCard(
                    icon: "rectangle.on.rectangle.angled",
                    iconColor: MerkenTheme.warning,
                    title: "フラッシュカード",
                    subtitle: "めくって学習"
                ) {
                    flashcardDestination = project
                }

                if appState.isPro {
                    learningModeCard(
                        icon: "text.bubble.fill",
                        iconColor: .purple,
                        title: "例文",
                        subtitle: "文脈で理解"
                    ) {
                        sentenceQuizDestination = project
                    }
                }
            }
        }
    }

    private func learningModeCard(icon: String, iconColor: Color, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                IconBadge(systemName: icon, color: iconColor, size: 48)

                Text(title)
                    .font(.headline.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .shadow(color: MerkenTheme.border.opacity(0.5), radius: 0, x: 0, y: 3)
        }
    }

    // MARK: - Word List

    private var wordListSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            HStack {
                IconBadge(systemName: "list.bullet", color: MerkenTheme.accentBlue, size: 32)
                VStack(alignment: .leading, spacing: 0) {
                    Text("単語一覧")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("\(viewModel.words.count)語")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
                Spacer()
                Button {
                    editorMode = .create
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.caption.bold())
                        Text("追加")
                            .font(.subheadline.bold())
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(MerkenTheme.accentBlue, in: .capsule)
                }
            }

            // Search
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(MerkenTheme.mutedText)
                TextField("単語を検索...", text: $viewModel.searchText)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
            )

            // Words
            let filteredWords = viewModel.filteredWords
            if filteredWords.isEmpty {
                SolidCard {
                    Text("単語がありません。追加して学習を開始してください。")
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            ForEach(filteredWords) { word in
                wordRow(word)
            }
        }
    }

    private func wordRow(_ word: Word) -> some View {
        SolidPane {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(word.english)
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(word.japanese)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                Spacer()
                HStack(spacing: 14) {
                    Button {
                        Task {
                            await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                        }
                    } label: {
                        Image(systemName: word.isFavorite ? "flag.fill" : "flag")
                            .foregroundStyle(word.isFavorite ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                    }

                    Button {
                        editorMode = .edit(existing: word)
                    } label: {
                        Image(systemName: "pencil")
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Button {
                        Task {
                            await viewModel.deleteWord(wordId: word.id, projectId: project.id, using: appState)
                        }
                    } label: {
                        Image(systemName: "trash")
                            .foregroundStyle(MerkenTheme.danger)
                    }
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
