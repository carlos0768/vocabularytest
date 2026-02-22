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
                        if let firstWord = viewModel.allWords.first {
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
                    await viewModel.load(collectionId: collection.id, using: appState)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        showingAddProjects = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)

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

    /// Dummy project used as a container for quiz navigation
    private var dummyProject: Project {
        Project(
            id: collection.id,
            userId: collection.userId,
            title: collection.name
        )
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 12) {
            // Thumbnail circle
            ZStack {
                Circle()
                    .fill(MerkenTheme.placeholderColor(for: collection.id))
                    .frame(width: 56, height: 56)
                    .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1))

                Image(systemName: "books.vertical.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(viewModel.collection?.name ?? collection.name)
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)

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
                    }
                }
                Text("\(viewModel.allWords.count)語 / 習得 \(viewModel.masteredCount)語 / \(viewModel.projects.count)冊")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            Spacer()
        }
    }

    // MARK: - Flashcard Preview

    private func flashcardPreview(_ word: Word) -> some View {
        SolidCard {
            VStack(spacing: 12) {
                HStack {
                    Text("1/\(viewModel.allWords.count)")
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
                    quizDestination = QuizDestination(collectionId: collection.id)
                }

                learningModeCard(
                    icon: "rectangle.on.rectangle.angled",
                    iconColor: MerkenTheme.warning,
                    title: "フラッシュカード",
                    subtitle: "めくって学習"
                ) {
                    flashcardDestination = FlashcardDestination(collectionId: collection.id)
                }

                if appState.isPro {
                    learningModeCard(
                        icon: "text.bubble.fill",
                        iconColor: .purple,
                        title: "例文",
                        subtitle: "文脈で理解"
                    ) {
                        sentenceQuizDestination = SentenceQuizDestination(collectionId: collection.id)
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
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
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
                    Text("\(viewModel.allWords.count)語")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
                Spacer()
                Button {
                    showingAddProjects = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.caption.bold())
                        Text("単語帳を追加")
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
                    Text("単語がありません。単語帳を追加してください。")
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
                // Status badge
                Text(word.status.rawValue)
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusColor(word.status), in: .capsule)

                if word.isFavorite {
                    Image(systemName: "flag.fill")
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .font(.caption)
                }
            }
        }
    }

    private func statusColor(_ status: WordStatus) -> Color {
        switch status {
        case .new: return MerkenTheme.warning
        case .review: return MerkenTheme.accentBlue
        case .mastered: return MerkenTheme.success
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
                        .foregroundStyle(MerkenTheme.primaryText)

                    TextField("名前", text: $editedName)
                        .textFieldStyle(.plain)
                        .solidTextField(cornerRadius: 16)

                    TextField("説明（任意）", text: $editedDescription)
                        .textFieldStyle(.plain)
                        .solidTextField(cornerRadius: 16)

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
                        .tint(MerkenTheme.accentBlue)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            let available = allProjects.filter { !existingProjectIds.contains($0.id) }

                            if available.isEmpty {
                                SolidCard {
                                    Text("追加できる単語帳がありません。")
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }
                            } else {
                                ForEach(available) { project in
                                    SolidPane {
                                        HStack {
                                            Image(systemName: selectedIds.contains(project.id) ? "checkmark.circle.fill" : "circle")
                                                .foregroundStyle(selectedIds.contains(project.id) ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                            Text(project.title)
                                                .foregroundStyle(MerkenTheme.primaryText)
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
