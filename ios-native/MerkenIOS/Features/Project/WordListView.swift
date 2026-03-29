import SwiftUI

private enum WordListFilter: Hashable {
    case all
    case status(WordStatus)
    case favorite
}

private enum WordSortOrder: String, CaseIterable {
    case createdAsc = "入力順"
    case createdDesc = "新しい順"
    case alphabetical = "ABC順"
}

struct WordListView: View {
    let project: Project
    let contentScrollEnabled: Bool

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = WordListViewModel()

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var exportWord: Word?
    @State private var searchText = ""

    @State private var selectedFilter: WordListFilter = .all
    @State private var selectedSort: WordSortOrder = .createdAsc
    private let initialStatus: WordStatus?

    private var headerTitle: String {
        if initialStatus != nil {
            // Dynamic based on current selected filter
            switch selectedFilter {
            case .status(.mastered): return "習得済みの単語"
            case .status(.review): return "学習中の単語"
            case .status(.new): return "未学習の単語"
            default: return "単語一覧"
            }
        }
        return "単語一覧"
    }

    private var filteredWords: [Word] {
        let filtered = viewModel.words.filter { word in
            switch selectedFilter {
            case .all:
                break
            case .status(let status):
                if word.status != status {
                    return false
                }
            case .favorite:
                if !word.isFavorite {
                    return false
                }
            }
            // Search filter
            if !searchText.isEmpty {
                return word.english.localizedCaseInsensitiveContains(searchText)
                    || word.japanese.localizedCaseInsensitiveContains(searchText)
            }
            return true
        }

        switch selectedSort {
        case .createdAsc:
            return filtered.sorted { $0.createdAt < $1.createdAt }
        case .createdDesc:
            return filtered.sorted { $0.createdAt > $1.createdAt }
        case .alphabetical:
            return filtered.sorted { $0.english.localizedCaseInsensitiveCompare($1.english) == .orderedAscending }
        }
    }

    /// Whether to show time-based group dividers (only for createdAt sorts)
    private var showTimeDividers: Bool {
        selectedSort == .createdAsc || selectedSort == .createdDesc
    }

    /// Returns true if a thick divider should appear before the word at the given index.
    /// Uses a 10-second threshold to separate different images within the same scan session.
    private func shouldShowGroupDivider(at index: Int) -> Bool {
        guard showTimeDividers, index > 0 else { return false }
        let words = filteredWords
        let threshold: TimeInterval = 10 // 10 seconds — separates individual images
        let prev = words[index - 1]
        let current = words[index]
        return abs(current.createdAt.timeIntervalSince(prev.createdAt)) > threshold
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

                        // Show status tabs when opened from stats widget, sort picker otherwise
                        if initialStatus != nil {
                            statusFilterTabs
                        } else {
                            sortPicker
                        }

                        // Words
                        if filteredWords.isEmpty {
                            emptyState
                        }

                        if !filteredWords.isEmpty {
                            let words = filteredWords
                            VStack(spacing: 0) {
                                dividerLine

                                ForEach(Array(words.enumerated()), id: \.element.id) { index, word in
                                    if shouldShowGroupDivider(at: index) {
                                        groupDividerLine
                                    }
                                    wordRow(word)
                                    dividerLine
                                }
                            }
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
            if case .all = selectedFilter, let initialStatus {
                selectedFilter = .status(initialStatus)
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
                filterChip(label: "すべて", filter: .all)
                filterChip(label: "新規", filter: .status(.new))
                filterChip(label: "復習", filter: .status(.review))
                filterChip(label: "習得", filter: .status(.mastered))
                filterChip(label: "苦手", filter: .favorite)
            }
        }
    }

    private func filterChip(label: String, filter: WordListFilter) -> some View {
        let isActive = selectedFilter == filter
        let count: Int = {
            switch filter {
            case .all:
                return viewModel.words.count
            case .status(let status):
                return viewModel.words.filter { $0.status == status }.count
            case .favorite:
                return viewModel.words.filter(\.isFavorite).count
            }
        }()

        return Button {
            selectedFilter = filter
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

    // MARK: - Sort Picker

    private var sortPicker: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.up.arrow.down")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(MerkenTheme.mutedText)

            Picker("並び替え", selection: $selectedSort) {
                ForEach(WordSortOrder.allCases, id: \.self) { order in
                    Text(order.rawValue).tag(order)
                }
            }
            .pickerStyle(.segmented)
        }
        .padding(.vertical, 4) // ~1.2x taller
    }

    // MARK: - Status Filter Tabs (for filtered word list from stats widgets)

    private var statusFilterTabs: some View {
        HStack(spacing: 0) {
            statusTab(label: "習得", status: .mastered, color: MerkenTheme.success)
            statusTab(label: "学習中", status: .review, color: MerkenTheme.accentBlue)
            statusTab(label: "未学習", status: .new, color: MerkenTheme.mutedText)
        }
        .padding(.vertical, 4)
    }

    private func statusTab(label: String, status: WordStatus, color: Color) -> some View {
        let isActive: Bool = {
            if case .status(let s) = selectedFilter {
                return s == status
            }
            return false
        }()

        return Button {
            selectedFilter = .status(status)
        } label: {
            VStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 15, weight: isActive ? .bold : .medium))
                    .foregroundStyle(isActive ? color : MerkenTheme.secondaryText)

                Rectangle()
                    .fill(isActive ? color : Color.clear)
                    .frame(height: 3)
                    .clipShape(.rect(cornerRadius: 1.5))
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Group Divider

    private var groupDividerLine: some View {
        Rectangle()
            .fill(MerkenTheme.border)
            .frame(height: 3)
            .padding(.vertical, 8)
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
        HStack(alignment: .center, spacing: 12) {
            // English word — prominent and bold
            Text(word.english)
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(2)
                .layoutPriority(1)

            // (品詞) 訳 — right of English word
            inlineDefinition(for: word)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Action icons: ✏️ ⋯ (heart removed)
            HStack(spacing: 16) {
                Button {
                    editorMode = .edit(existing: word)
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Menu {
                    Button {
                        exportWord = word
                    } label: {
                        Label("別の単語帳にエクスポート", systemImage: "square.and.arrow.up")
                    }

                    Button {
                        Task {
                            await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                        }
                    } label: {
                        Label(
                            word.isFavorite ? "苦手を解除" : "苦手に追加",
                            systemImage: word.isFavorite ? "heart.slash" : "heart"
                        )
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
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
        .padding(.vertical, 18)
    }

    /// Renders "(品詞) 訳" inline. Part of speech is muted, definition is secondary text.
    /// When translation is long, only the translation part wraps.
    private func inlineDefinition(for word: Word) -> some View {
        let pos = formattedPartOfSpeech(for: word)
        let japanesePos = pos.map { posTagsToJapanese($0) } ?? nil

        return Group {
            if let japanesePos {
                (Text(japanesePos + " ")
                    .font(.system(size: 15))
                    .foregroundColor(MerkenTheme.mutedText)
                 +
                 Text(word.japanese)
                    .font(.system(size: 15))
                    .foregroundColor(MerkenTheme.secondaryText)
                )
                .lineLimit(3)
                .multilineTextAlignment(.leading)
            } else {
                Text(word.japanese)
                    .font(.system(size: 15))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    /// Convert English POS tags to Japanese abbreviations
    private func posTagsToJapanese(_ posString: String) -> String {
        // posString is like "(noun)" or "(noun・verb)" or "(adjective)"
        let mapping: [String: String] = [
            "noun": "名",
            "verb": "動",
            "adjective": "形",
            "adverb": "副",
            "preposition": "前",
            "conjunction": "接",
            "pronoun": "代",
            "interjection": "感",
            "determiner": "限",
            "auxiliary": "助",
            "名詞": "名",
            "動詞": "動",
            "形容詞": "形",
            "副詞": "副",
            "前置詞": "前",
            "接続詞": "接",
            "代名詞": "代",
            "感動詞": "感",
        ]

        // Strip parentheses
        var inner = posString
        if inner.hasPrefix("(") && inner.hasSuffix(")") {
            inner = String(inner.dropFirst().dropLast())
        }

        let parts = inner.split(separator: "・").map { part in
            let trimmed = part.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return mapping[trimmed] ?? String(part)
        }

        return "(\(parts.joined(separator: ";")))"
    }

    private var dividerLine: some View {
        Rectangle()
            .fill(MerkenTheme.borderLight)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
    }

    private func formattedPartOfSpeech(for word: Word) -> String? {
        let parts = (word.partOfSpeechTags ?? []).compactMap { tag in
            let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        guard !parts.isEmpty else { return nil }
        return "(\(parts.joined(separator: "・")))"
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
