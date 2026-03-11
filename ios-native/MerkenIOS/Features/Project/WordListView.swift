import SwiftUI

struct WordListView: View {
    let project: Project
    let contentScrollEnabled: Bool

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = WordListViewModel()

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var exportWord: Word?
    @State private var searchText = ""

    @State private var selectedStatus: WordStatus?
    private let initialStatus: WordStatus?

    private var headerTitle: String {
        switch initialStatus {
        case .mastered: return "習得済みの単語"
        case .review: return "学習中の単語"
        case .new: return "未学習の単語"
        case nil: return "単語一覧"
        }
    }

    private var filteredWords: [Word] {
        viewModel.words.filter { word in
            // Status filter
            if let status = selectedStatus, word.status != status {
                return false
            }
            // Search filter
            if !searchText.isEmpty {
                return word.english.localizedCaseInsensitiveContains(searchText)
                    || word.japanese.localizedCaseInsensitiveContains(searchText)
            }
            return true
        }
    }

    init(project: Project, contentScrollEnabled: Bool = true, initialStatus: WordStatus? = nil) {
        self.project = project
        self.contentScrollEnabled = contentScrollEnabled
        self.initialStatus = initialStatus
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        // Header
                        headerSection
                            .padding(.bottom, 4)

                        // Search
                        searchBar

                        // Status filter chips
                        statusChips

                        // Words
                        if filteredWords.isEmpty {
                            emptyState
                        }

                        ForEach(filteredWords) { word in
                            wordRow(word)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .scrollDisabled(!contentScrollEnabled)
                .refreshable {
                    await viewModel.load(projectId: project.id, using: appState)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .sheet(item: $editorMode, content: editorSheet)
        .sheet(item: $exportWord) { word in
            WordExportSheet(sourceWord: word, currentProject: project)
        }
        .onAppear {
            if selectedStatus == nil, let initialStatus {
                selectedStatus = initialStatus
            }
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(projectId: project.id, using: appState)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(headerTitle)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.words.count)語")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            Spacer()
            Button {
                editorMode = .create
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                    Text("追加")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(MerkenTheme.accentBlue, in: .capsule)
                .overlay(alignment: .bottom) {
                    Capsule()
                        .fill(MerkenTheme.accentBlueStrong)
                        .frame(height: 2)
                }
                .clipShape(.capsule)
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.mutedText)
            TextField("単語を検索...", text: $searchText)
                .font(.system(size: 15))
                .textFieldStyle(.plain)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
        .solidTextField(cornerRadius: 14)
    }

    // MARK: - Status Filter Chips

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                statusChip(label: "すべて", status: nil)
                statusChip(label: "新規", status: .new)
                statusChip(label: "復習", status: .review)
                statusChip(label: "習得", status: .mastered)
            }
        }
    }

    private func statusChip(label: String, status: WordStatus?) -> some View {
        let isActive = selectedStatus == status
        let count: Int = {
            if let s = status {
                return viewModel.words.filter { $0.status == s }.count
            }
            return viewModel.words.count
        }()

        return Button {
            selectedStatus = status
        } label: {
            HStack(spacing: 4) {
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Text("\(count)")
                    .font(.system(size: 12, weight: .bold))
                    .monospacedDigit()
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

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 28))
                .foregroundStyle(MerkenTheme.mutedText)
            Text(searchText.isEmpty
                 ? "単語がありません"
                 : "「\(searchText)」に一致する単語がありません")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    // MARK: - Word Row

    private func wordRow(_ word: Word) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(word.english)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)
                Text(word.japanese)
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineLimit(1)
            }
            Spacer()
            HStack(spacing: 12) {
                Button {
                    Task {
                        await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                    }
                } label: {
                    Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                        .font(.system(size: 14))
                        .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.mutedText)
                }

                Button {
                    editorMode = .edit(existing: word)
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Menu {
                    Button {
                        exportWord = word
                    } label: {
                        Label("別の単語帳にエクスポート", systemImage: "square.and.arrow.up")
                    }

                    Button(role: .destructive) {
                        Task {
                            await viewModel.deleteWord(wordId: word.id, projectId: project.id, using: appState)
                        }
                    } label: {
                        Label("削除", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
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

    // MARK: - Editor Sheet

    @ViewBuilder
    private func editorSheet(mode: WordEditorSheet.Mode) -> some View {
        WordEditorSheet(mode: mode, projectId: project.id) { input in
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

private struct WordExportSheet: View {
    let sourceWord: Word
    let currentProject: Project

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var projects: [Project] = []
    @State private var loading = true
    @State private var savingProjectId: String?
    @State private var errorMessage: String?

    private var exportTargets: [Project] {
        projects.filter { $0.id != currentProject.id }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                if loading {
                    ProgressView()
                } else if exportTargets.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "books.vertical")
                            .font(.largeTitle)
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Text("エクスポート先の単語帳がありません")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("別の単語帳を作成すると、ここから単語を複製できます。")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .multilineTextAlignment(.center)
                    }
                    .padding(24)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            exportHeader

                            if let errorMessage {
                                SolidCard(padding: 14) {
                                    Text(errorMessage)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(MerkenTheme.danger)
                                }
                            }

                            VStack(spacing: 8) {
                                ForEach(exportTargets) { project in
                                    exportTargetRow(project)
                                }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("単語をエクスポート")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("閉じる") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .task {
                await loadProjects()
            }
        }
    }

    private var exportHeader: some View {
        SolidCard(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(sourceWord.english)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(sourceWord.japanese)
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
                Text("「\(currentProject.title)」から別の単語帳へ複製します")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    private func exportTargetRow(_ project: Project) -> some View {
        let saving = savingProjectId == project.id

        return SolidPane {
            Button {
                Task {
                    await export(to: project)
                }
            } label: {
                HStack(spacing: 12) {
                    projectThumbnail(project)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(project.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .lineLimit(2)

                        Text(project.sourceLabels.isEmpty ? "単語帳" : project.sourceLabels.joined(separator: " / "))
                            .font(.system(size: 12))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineLimit(1)
                    }

                    Spacer()

                    if saving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(savingProjectId != nil)
        }
    }

    @ViewBuilder
    private func projectThumbnail(_ project: Project) -> some View {
        ZStack {
            if let iconImage = project.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                let placeholder = MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
                placeholder

                Text(String(project.title.prefix(1)))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func loadProjects() async {
        loading = true
        defer { loading = false }

        do {
            projects = try await appState.activeRepository.fetchProjects(userId: appState.activeUserId)
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    private func export(to project: Project) async {
        guard savingProjectId == nil else { return }
        savingProjectId = project.id
        defer { savingProjectId = nil }

        do {
            _ = try await appState.activeRepository.createWords([wordInput(for: sourceWord, projectId: project.id)])
            appState.bumpDataVersion()
            dismiss()
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    private func wordInput(for word: Word, projectId: String) -> WordInput {
        WordInput(
            projectId: projectId,
            english: word.english,
            japanese: word.japanese,
            distractors: word.distractors,
            exampleSentence: word.exampleSentence,
            exampleSentenceJa: word.exampleSentenceJa,
            pronunciation: word.pronunciation,
            partOfSpeechTags: word.partOfSpeechTags,
            relatedWords: word.relatedWords,
            usagePatterns: word.usagePatterns,
            insightsGeneratedAt: word.insightsGeneratedAt,
            insightsVersion: word.insightsVersion
        )
    }
}
