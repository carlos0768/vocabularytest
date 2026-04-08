import SwiftUI

private enum WordListFilter: Hashable {
    case all
    case status(WordStatus)
    case favorite
}

private enum WordSortOrder: String, CaseIterable {
    case createdAsc  = "追加順"
    case alphabetical = "アルファベット"
}

private enum WordActiveness: Equatable {
    case active
    case passive
}

private struct WordListFilterState {
    var partOfSpeech: String? = nil
    var activeness: WordActiveness? = nil
    var bookmarkOnly: Bool = false

    var isActive: Bool {
        partOfSpeech != nil || activeness != nil || bookmarkOnly
    }
}

struct WordListView: View {
    let project: Project
    let contentScrollEnabled: Bool

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = WordListViewModel()

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var exportWord: Word?
    @State private var selectedWord: Word?
    @State private var searchText = ""

    @State private var selectedFilter: WordListFilter = .all
    @State private var selectedSort: WordSortOrder = .createdAsc

    // New toolbar state
    @State private var showSearch = false
    @State private var showFilterSheet = false
    @State private var filterState = WordListFilterState()
    @State private var selectMode = false
    @State private var selectedWordIds = Set<String>()
    @State private var showBulkDeleteConfirm = false

    private let initialStatus: WordStatus?

    private var headerTitle: String {
        if initialStatus != nil {
            switch selectedFilter {
            case .status(.mastered): return "習得済みの単語"
            case .status(.review):   return "学習中の単語"
            case .status(.new):      return "未学習の単語"
            default:                 return "単語一覧"
            }
        }
        return "単語一覧"
    }

    private var filteredWords: [Word] {
        var result = viewModel.words.filter { word in
            switch selectedFilter {
            case .all: break
            case .status(let status):
                if word.status != status { return false }
            case .favorite:
                if !word.isFavorite { return false }
            }
            return true
        }

        // Search
        if !searchText.isEmpty {
            result = result.filter {
                $0.english.localizedCaseInsensitiveContains(searchText)
                    || $0.japanese.localizedCaseInsensitiveContains(searchText)
            }
        }

        // Bookmark
        if filterState.bookmarkOnly {
            result = result.filter { $0.isFavorite }
        }

        // Part of speech
        if let pos = filterState.partOfSpeech {
            result = result.filter { word in
                word.partOfSpeechTags?.contains(where: {
                    $0.localizedCaseInsensitiveContains(pos)
                }) ?? false
            }
        }

        // Active / Passive
        if let activeness = filterState.activeness {
            switch activeness {
            case .active:
                result = result.filter { $0.status == .mastered }
            case .passive:
                result = result.filter { $0.status == .review || $0.status == .new }
            }
        }

        switch selectedSort {
        case .createdAsc:
            return result.sorted { $0.createdAt < $1.createdAt }
        case .alphabetical:
            return result.sorted {
                $0.english.localizedCaseInsensitiveCompare($1.english) == .orderedAscending
            }
        }
    }

    private var showTimeDividers: Bool { selectedSort == .createdAsc }

    private func shouldShowGroupDivider(at index: Int) -> Bool {
        guard showTimeDividers, index > 0 else { return false }
        let words = filteredWords
        let threshold: TimeInterval = 10
        let prev = words[index - 1]
        let current = words[index]
        return abs(current.createdAt.timeIntervalSince(prev.createdAt)) > threshold
    }

    /// Unique POS tags present in the current word list
    private var availablePartsOfSpeech: [String] {
        let all = viewModel.words.flatMap { $0.partOfSpeechTags ?? [] }
        let trimmed = all.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return Array(Set(trimmed)).sorted()
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
                        headerSection
                            .padding(.bottom, 4)

                        // Compact toolbar: 🔍  filter  sort  —  count
                        wordListToolbar

                        // Expandable search bar
                        if showSearch {
                            searchBar
                                .transition(.move(edge: .top).combined(with: .opacity))
                        }

                        // Status tabs when opened from stats widget
                        if initialStatus != nil {
                            statusFilterTabs
                        }

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
        .sheet(isPresented: $showFilterSheet) {
            filterSheet
        }
        .navigationDestination(item: $selectedWord) { word in
            WordDetailView(
                project: project,
                wordID: word.id,
                viewModel: viewModel
            )
        }
        .overlay(alignment: .bottom) {
            if selectMode {
                HStack(spacing: 12) {
                    Button {
                        withAnimation { selectMode = false; selectedWordIds.removeAll() }
                    } label: {
                        Text("キャンセル")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(MerkenTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)

                    Button {
                        showBulkDeleteConfirm = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "trash")
                                .font(.system(size: 15, weight: .semibold))
                            Text(selectedWordIds.isEmpty ? "削除" : "\(selectedWordIds.count)語を削除")
                                .font(.system(size: 15, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(selectedWordIds.isEmpty ? MerkenTheme.danger.opacity(0.5) : MerkenTheme.danger, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(selectedWordIds.isEmpty)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
        }
        .alert("選択した\(selectedWordIds.count)語を削除しますか？", isPresented: $showBulkDeleteConfirm) {
            Button("キャンセル", role: .cancel) {}
            Button("削除", role: .destructive) {
                Task {
                    for id in selectedWordIds {
                        await viewModel.deleteWord(wordId: id, projectId: project.id, using: appState)
                    }
                    selectedWordIds.removeAll()
                    selectMode = false
                }
            }
        } message: {
            Text("この操作は取り消せません。")
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

    // MARK: - Compact Toolbar (search / filter / sort)

    private var wordListToolbar: some View {
        HStack(spacing: 6) {
            // Search toggle
            toolbarIconButton(
                icon: showSearch ? "xmark" : "magnifyingglass",
                isActive: showSearch || !searchText.isEmpty
            ) {
                withAnimation(.easeInOut(duration: 0.18)) {
                    showSearch.toggle()
                    if !showSearch { searchText = "" }
                }
            }

            // Filter
            toolbarIconButton(
                icon: "line.3.horizontal.decrease.circle",
                isActive: filterState.isActive
            ) {
                showFilterSheet = true
            }

            // Sort menu
            Menu {
                ForEach(WordSortOrder.allCases, id: \.self) { order in
                    Button {
                        selectedSort = order
                    } label: {
                        if selectedSort == order {
                            Label(order.rawValue, systemImage: "checkmark")
                        } else {
                            Text(order.rawValue)
                        }
                    }
                }
            } label: {
                toolbarIconLabel(icon: "arrow.up.arrow.down", isActive: false)
            }

            // Select mode toggle
            toolbarIconButton(
                icon: selectMode ? "xmark.circle" : "checkmark.circle",
                isActive: selectMode
            ) {
                withAnimation(.easeInOut(duration: 0.18)) {
                    selectMode.toggle()
                    if !selectMode { selectedWordIds.removeAll() }
                }
            }

            Spacer()

            // Active filter badge
            if filterState.isActive || !searchText.isEmpty {
                let count = filteredWords.count
                let total = viewModel.words.count
                Text("\(count) / \(total)語")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.accentBlue)
            }
        }
    }

    @ViewBuilder
    private func toolbarIconButton(icon: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            toolbarIconLabel(icon: icon, isActive: isActive)
        }
    }

    private func toolbarIconLabel(icon: String, isActive: Bool) -> some View {
        Image(systemName: icon)
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(isActive ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
            .frame(width: 36, height: 36)
            .background(
                isActive ? MerkenTheme.accentBlue.opacity(0.12) : MerkenTheme.surface,
                in: .circle
            )
            .overlay(
                Circle().stroke(
                    isActive ? MerkenTheme.accentBlue.opacity(0.35) : MerkenTheme.borderLight,
                    lineWidth: 1
                )
            )
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
                .autocorrectionDisabled()
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

    // MARK: - Filter Sheet

    private var filterSheet: some View {
        NavigationStack {
            List {
                // ブックマーク
                Section {
                    Toggle(isOn: $filterState.bookmarkOnly) {
                        Label("ブックマークのみ", systemImage: "bookmark.fill")
                            .foregroundStyle(MerkenTheme.primaryText)
                    }
                    .tint(MerkenTheme.accentBlue)
                } header: {
                    Text("ブックマーク")
                }

                // アクティブ / パッシブ
                Section {
                    filterActivenessRow(label: "すべて", icon: "circle.dashed", iconColor: MerkenTheme.mutedText, value: nil)
                    filterActivenessRow(label: "アクティブ（習得済み）", icon: "checkmark.seal.fill", iconColor: MerkenTheme.success, value: .active)
                    filterActivenessRow(label: "パッシブ（学習中・未学習）", icon: "arrow.trianglehead.2.clockwise", iconColor: MerkenTheme.accentBlue, value: .passive)
                } header: {
                    Text("アクティブ / パッシブ")
                }

                // 品詞
                if !availablePartsOfSpeech.isEmpty {
                    Section {
                        filterPosRow(label: "すべて", value: nil)
                        ForEach(availablePartsOfSpeech, id: \.self) { pos in
                            filterPosRow(label: posDisplayName(pos), value: pos)
                        }
                    } header: {
                        Text("品詞")
                    }
                }
            }
            .navigationTitle("フィルタ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("リセット") {
                        filterState = WordListFilterState()
                    }
                    .foregroundStyle(MerkenTheme.danger)
                    .disabled(!filterState.isActive)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完了") { showFilterSheet = false }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func filterActivenessRow(label: String, icon: String, iconColor: Color, value: WordActiveness?) -> some View {
        let isSelected = filterState.activeness == value
        return Button {
            filterState.activeness = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(iconColor)
                    .frame(width: 22)
                Text(label)
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func filterPosRow(label: String, value: String?) -> some View {
        let isSelected = filterState.partOfSpeech == value
        return Button {
            filterState.partOfSpeech = value
        } label: {
            HStack {
                Text(label)
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func posDisplayName(_ tag: String) -> String {
        let mapping: [String: String] = [
            "noun": "名詞", "verb": "動詞", "adjective": "形容詞",
            "adverb": "副詞", "preposition": "前置詞", "conjunction": "接続詞",
            "pronoun": "代名詞", "interjection": "感動詞",
            "determiner": "限定詞", "auxiliary": "助動詞",
        ]
        return mapping[tag.lowercased()] ?? tag
    }

    // MARK: - Status Filter Chips (unused in toolbar flow, kept for statusChips reference)

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(label: "すべて", filter: .all)
                filterChip(label: "新規",   filter: .status(.new))
                filterChip(label: "復習",   filter: .status(.review))
                filterChip(label: "習得",   filter: .status(.mastered))
                filterChip(label: "苦手",   filter: .favorite)
            }
        }
    }

    private func filterChip(label: String, filter: WordListFilter) -> some View {
        let isActive = selectedFilter == filter
        let count: Int = {
            switch filter {
            case .all:               return viewModel.words.count
            case .status(let s):    return viewModel.words.filter { $0.status == s }.count
            case .favorite:         return viewModel.words.filter(\.isFavorite).count
            }
        }()

        return Button { selectedFilter = filter } label: {
            HStack(spacing: 4) {
                Text(label).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text("\(count)").font(.system(size: 12, weight: .bold)).monospacedDigit()
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .foregroundStyle(isActive ? .white : MerkenTheme.secondaryText)
            .background(isActive ? MerkenTheme.accentBlue : MerkenTheme.surface, in: .capsule)
            .overlay(Capsule().stroke(isActive ? Color.clear : MerkenTheme.borderLight, lineWidth: 1))
        }
    }

    // MARK: - Status Filter Tabs (stats widget entry point)

    private var statusFilterTabs: some View {
        HStack(spacing: 0) {
            statusTab(label: "習得",   status: .mastered, color: MerkenTheme.success)
            statusTab(label: "学習中", status: .review,   color: MerkenTheme.accentBlue)
            statusTab(label: "未学習", status: .new,      color: MerkenTheme.mutedText)
        }
        .padding(.vertical, 4)
    }

    private func statusTab(label: String, status: WordStatus, color: Color) -> some View {
        let isActive: Bool = {
            if case .status(let s) = selectedFilter { return s == status }
            return false
        }()

        return Button { selectedFilter = .status(status) } label: {
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
        HStack(alignment: .center, spacing: 8) {
            if selectMode {
                Button {
                    if selectedWordIds.contains(word.id) {
                        selectedWordIds.remove(word.id)
                    } else {
                        selectedWordIds.insert(word.id)
                    }
                } label: {
                    Image(systemName: selectedWordIds.contains(word.id) ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 22))
                        .foregroundStyle(selectedWordIds.contains(word.id) ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                }
                .buttonStyle(.plain)
            }

            Button {
                if selectMode {
                    if selectedWordIds.contains(word.id) {
                        selectedWordIds.remove(word.id)
                    } else {
                        selectedWordIds.insert(word.id)
                    }
                } else {
                    selectedWord = word
                }
            } label: {
                HStack(alignment: .center, spacing: 8) {
                    Text(word.english)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(2)
                        .layoutPriority(1)

                    inlineDefinition(for: word)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            HStack(spacing: 12) {
                Button {
                    editorMode = .edit(existing: word)
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 16, weight: .medium))
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
                            systemImage: word.isFavorite ? "bookmark.slash" : "bookmark"
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
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
        .padding(.vertical, 12)
    }

    private func inlineDefinition(for word: Word) -> some View {
        let pos = formattedPartOfSpeech(for: word)
        let japanesePos = pos.map { posTagsToJapanese($0) } ?? nil

        return Group {
            if let japanesePos {
                (Text(japanesePos + " ")
                    .font(.system(size: 12))
                    .foregroundColor(MerkenTheme.mutedText)
                 +
                 Text(word.japanese)
                    .font(.system(size: 14))
                    .foregroundColor(MerkenTheme.secondaryText)
                )
                .lineLimit(3)
                .multilineTextAlignment(.leading)
            } else {
                Text(word.japanese)
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private func posTagsToJapanese(_ posString: String) -> String {
        let mapping: [String: String] = [
            "noun": "名", "verb": "動", "adjective": "形",
            "adverb": "副", "preposition": "前", "conjunction": "接",
            "pronoun": "代", "interjection": "感", "determiner": "限",
            "auxiliary": "助",
            "名詞": "名", "動詞": "動", "形容詞": "形", "副詞": "副",
            "前置詞": "前", "接続詞": "接", "代名詞": "代", "感動詞": "感",
        ]
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
                    Button("閉じる") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
            .task { await loadProjects() }
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
                Task { await export(to: project) }
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
                        ProgressView().controlSize(.small)
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
                Image(uiImage: uiImage).resizable().scaledToFill()
            } else {
                MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
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
            if error.isCancellationError { return }
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
            if error.isCancellationError { return }
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
