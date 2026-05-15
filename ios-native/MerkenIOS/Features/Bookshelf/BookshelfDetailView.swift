import SwiftUI

private enum SharedSortOrder: String, CaseIterable {
    case createdAsc   = "追加順"
    case alphabetical = "アルファベット"
}

private enum SharedActiveness: Equatable {
    case active
    case passive
}

private struct SharedFilterState {
    var activeness: SharedActiveness? = nil
    var partOfSpeech: String? = nil

    var isActive: Bool { activeness != nil || partOfSpeech != nil }
}

struct SharedProjectDetailView: View {
    let summary: SharedProjectSummary

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = SharedProjectDetailViewModel()

    // Search / Filter / Sort
    @State private var searchText = ""
    @State private var showSearch = false
    @State private var sortOrder: SharedSortOrder = .createdAsc
    @State private var filterState = SharedFilterState()
    @State private var showFilterSheet = false

    // Select mode
    @State private var selectMode = false
    @State private var selectedIds: Set<String> = []

    // Import sheet
    @State private var showImportSheet = false

    private var project: Project {
        viewModel.project ?? summary.project
    }

    // MARK: - Filtered words

    private var filteredWords: [Word] {
        var result = viewModel.words

        if !searchText.isEmpty {
            result = result.filter {
                $0.english.localizedCaseInsensitiveContains(searchText)
                    || $0.japanese.localizedCaseInsensitiveContains(searchText)
            }
        }
        if let act = filterState.activeness {
            switch act {
            case .active:  result = result.filter { $0.vocabularyType == .active }
            case .passive: result = result.filter { $0.vocabularyType == .passive }
            }
        }
        if let pos = filterState.partOfSpeech {
            result = result.filter { word in
                word.partOfSpeechTags?.contains(where: { $0.localizedCaseInsensitiveContains(pos) }) ?? false
            }
        }
        switch sortOrder {
        case .createdAsc:
            return result.sorted { $0.createdAt < $1.createdAt }
        case .alphabetical:
            return result.sorted { $0.english.localizedCaseInsensitiveCompare($1.english) == .orderedAscending }
        }
    }

    private var availablePartsOfSpeech: [String] {
        let all = viewModel.words.flatMap { $0.partOfSpeechTags ?? [] }
        let trimmed = all.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return Array(Set(trimmed)).sorted()
    }

    private var hasActiveFilters: Bool {
        filterState.isActive || !searchText.isEmpty
    }

    // MARK: - Body

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                headerBar
                scrollContent
            }
            bottomActionBar
        }
        .navigationBarHidden(true)
        .onAppear { appState.tabBarVisible = false }
        .onDisappear { appState.tabBarVisible = true }
        .sheet(isPresented: $showFilterSheet) { filterSheet }
        .sheet(isPresented: $showImportSheet) { importSheet }
        .task(id: "\(summary.project.id)-\(appState.dataVersion)") {
            await viewModel.load(projectId: summary.project.id, using: appState)
        }
        .background(PaperDotBackground().ignoresSafeArea())
    }

    // MARK: - Header (same as ProjectDetailView)

    private var headerBar: some View {
        HStack {
            SolidIconButton(systemImage: "chevron.left", size: 38) {
                dismiss()
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 4)
        .background(MerkenTheme.paperBackground.ignoresSafeArea(edges: .top))
    }

    private var headerGradient: some View {
        MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let errorMessage = viewModel.errorMessage {
                    SolidCard {
                        Text(errorMessage)
                            .foregroundStyle(MerkenTheme.warning)
                    }
                    .padding(.horizontal, 20)
                }

                sharedHeroPanel
                sharedPreviewHeader
                sharedWordPreviewList
            }
            .padding(.top, 4)
            .padding(.bottom, 130)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await viewModel.load(projectId: summary.project.id, using: appState)
        }
    }

    private var ownerLabel: String {
        "共有ユーザー"
    }

    private var sharedHeroPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.system(size: 13, weight: .black))
                Text("SHARED")
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .tracking(1)
            }
            .foregroundStyle(MerkenTheme.mutedText)

            Text(project.title)
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(MerkenTheme.solidInk)
                .lineLimit(3)
                .minimumScaleFactor(0.82)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Text(String(ownerLabel.prefix(1)))
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .frame(width: 22, height: 22)
                    .background(MerkenTheme.surfaceAlt, in: Circle())
                    .overlay(Circle().stroke(MerkenTheme.solidInk, lineWidth: 1))

                Text(ownerLabel)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(MerkenTheme.mutedText)

                Text("·")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)

                Text(project.createdAt.formatted(.dateTime.locale(Locale(identifier: "ja_JP")).year().month().day()))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            Rectangle()
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                .foregroundStyle(MerkenTheme.border)
                .frame(height: 1)
                .padding(.top, 2)

            HStack(spacing: 18) {
                sharedStat(label: "単語数", value: "\(viewModel.words.count)", suffix: "語")
                sharedStat(label: "メンバー", value: "\(viewModel.collaboratorCount)", suffix: "人")
            }
        }
        .padding(16)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 1.0, green: 248 / 255, blue: 236 / 255),
                    MerkenTheme.surface
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(MerkenTheme.solidBorder, lineWidth: 1.25)
        )
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(MerkenTheme.solidShadow)
                .offset(x: 3, y: 4)
        )
        .padding(.horizontal, 18)
    }

    private func sharedStat(label: String, value: String, suffix: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .tracking(0.6)
                .foregroundStyle(MerkenTheme.mutedText)
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(value)
                    .font(.system(size: 18, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .monospacedDigit()
                Text(suffix)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sharedPreviewHeader: some View {
        HStack {
            Text("単語プレビュー · 全 \(viewModel.words.count) 語")
                .font(.system(size: 10, weight: .black, design: .monospaced))
                .tracking(0.8)
                .foregroundStyle(MerkenTheme.mutedText)

            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
    }

    private var sharedWordPreviewList: some View {
        VStack(spacing: 4) {
            if viewModel.loading && viewModel.words.isEmpty {
                HStack {
                    Spacer()
                    ProgressView().controlSize(.small)
                    Text("読み込み中...")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                    Spacer()
                }
                .padding(.vertical, 28)
            } else if viewModel.words.isEmpty {
                Text("単語がありません")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
            } else {
                ForEach(Array(viewModel.words.enumerated()), id: \.element.id) { index, word in
                    sharedPreviewRow(word: word, index: index)
                }
            }
        }
        .padding(.horizontal, 14)
    }

    private func sharedPreviewRow(word: Word, index: Int) -> some View {
        let selected = selectedIds.contains(word.id)
        return Button {
            guard selectMode else { return }
            if selected {
                selectedIds.remove(word.id)
            } else {
                selectedIds.insert(word.id)
            }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(selectMode && selected ? "✓" : String(format: "%02d", index + 1))
                    .font(.system(size: 9, weight: .black, design: .monospaced))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .frame(width: 20, alignment: .leading)

                VStack(alignment: .leading, spacing: 2) {
                    Text(word.english)
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(MerkenTheme.solidInk)
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        if let pos = word.partOfSpeechTags?.first, !pos.isEmpty {
                            Text(pos)
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .italic()
                                .foregroundStyle(MerkenTheme.mutedText)
                                .lineLimit(1)
                        }

                        Text(word.japanese)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(selected ? MerkenTheme.solidInk : MerkenTheme.border, lineWidth: 1.25)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Word List Section

    private let notionEnglishColWidth: CGFloat = 158
    private let notionApPosClusterWidth: CGFloat = 88
    private let notionJapaneseColWidth: CGFloat = 180
    private let notionCheckColWidth: CGFloat = 34

    private var notionWordListSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header + toolbar
            HStack(alignment: .center, spacing: 6) {
                Text("単語一覧")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.words.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .monospacedDigit()

                Spacer()

                toolbar
            }
            .padding(.bottom, 10)

            // Search bar
            if showSearch {
                searchBar
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.bottom, 8)
            }

            if viewModel.loading && viewModel.words.isEmpty {
                loadingPlaceholder
            } else if viewModel.words.isEmpty {
                emptyPlaceholder(text: "単語がありません")
            } else if filteredWords.isEmpty {
                emptyPlaceholder(text: searchText.isEmpty
                    ? "条件に一致する単語がありません"
                    : "「\(searchText)」に一致する単語がありません")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(spacing: 0) {
                        columnHeader

                        ForEach(Array(filteredWords.enumerated()), id: \.element.id) { index, word in
                            wordRow(word, isLast: index == filteredWords.count - 1)
                        }
                    }
                }
            }
        }
        .padding(14)
        .solidSurface(tone: .surface, depth: .standard, cornerRadius: 18)
    }

    // MARK: - Toolbar

    private var toolbar: some View {
        HStack(spacing: 6) {
            toolbarIconButton(
                icon: showSearch ? "xmark" : "magnifyingglass",
                isActive: showSearch || !searchText.isEmpty
            ) {
                withAnimation(.easeInOut(duration: 0.18)) {
                    showSearch.toggle()
                    if !showSearch { searchText = "" }
                }
            }

            toolbarIconButton(
                icon: "line.3.horizontal.decrease.circle",
                isActive: filterState.isActive
            ) {
                showFilterSheet = true
            }

            Menu {
                ForEach(SharedSortOrder.allCases, id: \.self) { order in
                    Button {
                        sortOrder = order
                    } label: {
                        if sortOrder == order {
                            Label(order.rawValue, systemImage: "checkmark")
                        } else {
                            Text(order.rawValue)
                        }
                    }
                }
            } label: {
                toolbarIconLabel(icon: "arrow.up.arrow.down", isActive: false)
            }

            if hasActiveFilters {
                Text("\(filteredWords.count)/\(viewModel.words.count)")
                    .font(.system(size: 11, weight: .medium))
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
            .font(.system(size: 16, weight: .black))
            .foregroundStyle(isActive ? MerkenTheme.inverseText : MerkenTheme.solidInk)
            .frame(width: 36, height: 36)
            .solidSurface(tone: isActive ? .inverse : .surface, depth: .small, cornerRadius: 18)
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
                Button { searchText = "" } label: {
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
                Section {
                    filterActivenessRow(label: "すべて", icon: "circle.dashed", iconColor: MerkenTheme.mutedText, value: nil)
                    filterActivenessRow(label: "アクティブ", icon: "a.circle.fill", iconColor: MerkenTheme.accentBlue, value: .active)
                    filterActivenessRow(label: "パッシブ", icon: "p.circle.fill", iconColor: MerkenTheme.secondaryText, value: .passive)
                } header: {
                    Text("アクティブ / パッシブ")
                }

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
                    Button("リセット") { filterState = SharedFilterState() }
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

    private func filterActivenessRow(label: String, icon: String, iconColor: Color, value: SharedActiveness?) -> some View {
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
                Text(label).foregroundStyle(MerkenTheme.primaryText)
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

    // MARK: - Column Header

    private var columnHeader: some View {
        HStack(spacing: 0) {
            if selectMode {
                Spacer().frame(width: notionCheckColWidth)
            }

            Text("単語")
                .frame(width: notionEnglishColWidth, alignment: .leading)
                .padding(.leading, 8)

            HStack(spacing: 4) {
                Text("A/P").frame(width: 42, alignment: .center)
                Text("品詞").frame(width: 42, alignment: .center)
            }
            .frame(width: notionApPosClusterWidth)

            Text("訳")
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)

            Spacer().frame(width: 16)
        }
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(MerkenTheme.mutedText)
        .padding(.vertical, 6)
        .overlay(Rectangle().fill(MerkenTheme.border).frame(height: 1), alignment: .bottom)
    }

    // MARK: - Word Row

    private func wordRow(_ word: Word, isLast: Bool) -> some View {
        HStack(spacing: 0) {
            if selectMode {
                checkboxView(isSelected: selectedIds.contains(word.id))
                    .frame(width: notionCheckColWidth, alignment: .center)
            }

            Text(word.english)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: notionEnglishColWidth, alignment: .leading)
                .padding(.leading, 8)
                .padding(.vertical, 8)

            HStack(spacing: 4) {
                VocabularyTypeCycleButton(vocabularyType: word.vocabularyType, isEnabled: false) {}
                    .frame(width: 42, alignment: .center)
                posBadge(for: word)
                    .frame(width: 42, alignment: .center)
            }
            .frame(width: notionApPosClusterWidth)
            .padding(.vertical, 8)

            Text(word.japanese)
                .font(.system(size: 13))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)
                .padding(.vertical, 8)

            Spacer().frame(width: 16)
        }
        .frame(minHeight: 48)
        .contentShape(Rectangle())
        .onTapGesture {
            if selectMode {
                if selectedIds.contains(word.id) {
                    selectedIds.remove(word.id)
                } else {
                    selectedIds.insert(word.id)
                }
            }
        }
        .overlay(
            Group {
                if !isLast {
                    Rectangle().fill(MerkenTheme.borderLight).frame(height: 1)
                }
            },
            alignment: .bottom
        )
    }

    private func checkboxView(isSelected: Bool) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .stroke(isSelected ? MerkenTheme.accentBlue : MerkenTheme.border, lineWidth: 2)
                .frame(width: 22, height: 22)
            if isSelected {
                RoundedRectangle(cornerRadius: 4)
                    .fill(MerkenTheme.accentBlue)
                    .frame(width: 22, height: 22)
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
    }

    @ViewBuilder
    private func posBadge(for word: Word) -> some View {
        let tags = word.partOfSpeechTags ?? []
        let label = tags.compactMap { tag -> String? in
            let t = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            switch t {
            case "noun", "名詞":        return "名"
            case "verb", "動詞":        return "動"
            case "adjective", "形容詞": return "形"
            case "adverb", "副詞":      return "副"
            case "preposition", "前置詞": return "前"
            case "conjunction", "接続詞": return "接"
            case "pronoun", "代名詞":    return "代"
            case "idiom", "熟語", "phrase", "フレーズ", "idiomatic_expression": return "熟"
            case "phrasal_verb", "句動詞": return "句"
            default: return nil
            }
        }.prefix(2).joined(separator: "・")

        if label.isEmpty {
            Text("—")
                .font(.system(size: 15))
                .foregroundStyle(MerkenTheme.mutedText)
        } else {
            Text(label)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
        }
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                if viewModel.importedProjectId != nil {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16, weight: .black))
                        Text("追加済み — 単語帳を開く")
                            .font(.system(size: 15, weight: .black))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .solidSurface(tone: .inverse, depth: .small, cornerRadius: 14)
                } else if selectMode {
                    Button {
                        selectMode = false
                        selectedIds = []
                    } label: {
                        Text("キャンセル")
                    }
                    .buttonStyle(SolidButtonStyle(.surface, size: .medium, cornerRadius: 12))

                    Button {
                        let selected = viewModel.words.filter { selectedIds.contains($0.id) }
                        Task {
                            await viewModel.importToLocal(
                                title: project.title,
                                words: selected,
                                sourceShareId: project.shareId ?? project.id,
                                using: appState
                            )
                            selectMode = false
                            selectedIds = []
                        }
                    } label: {
                        HStack(spacing: 6) {
                            if viewModel.importing {
                                ProgressView().progressViewStyle(.circular).tint(.white)
                            } else {
                                Image(systemName: "square.and.arrow.down")
                                    .font(.system(size: 15, weight: .bold))
                            }
                            Text(viewModel.importing ? "追加中..." : "選択した \(selectedIds.count)語を追加")
                        }
                    }
                    .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 12))
                    .disabled(viewModel.importing || selectedIds.isEmpty)
                } else {
                    Button {
                        showImportSheet = true
                    } label: {
                        HStack(spacing: 6) {
                            if viewModel.importing {
                                ProgressView().progressViewStyle(.circular).tint(.white)
                            } else {
                                Image(systemName: "square.and.arrow.down")
                                    .font(.system(size: 15, weight: .bold))
                            }
                            Text(viewModel.importing ? "追加中..." : "\(viewModel.words.count)語をインポート")
                        }
                    }
                    .buttonStyle(SolidButtonStyle(.inverse, size: .large, expands: true, cornerRadius: 14))
                    .disabled(viewModel.importing || viewModel.words.isEmpty)
                }
            }

            Text("オリジナルは変更されません")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(MerkenTheme.mutedText)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background(
            LinearGradient(
                colors: [MerkenTheme.paperBackground.opacity(0), MerkenTheme.paperBackground, MerkenTheme.paperBackground],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(.container, edges: .bottom)
        )
    }

    // MARK: - Import Sheet

    private var importSheet: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(MerkenTheme.border)
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .padding(.bottom, 16)

            importSheetRow(
                icon: "square.and.arrow.down",
                iconColor: MerkenTheme.primaryText,
                title: "すべて追加",
                subtitle: "\(viewModel.words.count)語"
            ) {
                showImportSheet = false
                Task {
                    await viewModel.importToLocal(
                        title: project.title,
                        words: viewModel.words,
                        sourceShareId: project.shareId ?? project.id,
                        using: appState
                    )
                }
            }

            if hasActiveFilters && filteredWords.count != viewModel.words.count {
                importSheetRow(
                    icon: "line.3.horizontal.decrease.circle",
                    iconColor: MerkenTheme.accentBlue,
                    title: "フィルタ結果を追加",
                    subtitle: "\(filteredWords.count)語"
                ) {
                    showImportSheet = false
                    Task {
                        await viewModel.importToLocal(
                            title: project.title,
                            words: filteredWords,
                            sourceShareId: project.shareId ?? project.id,
                            using: appState
                        )
                    }
                }
            }

            importSheetRow(
                icon: "checklist",
                iconColor: MerkenTheme.secondaryText,
                title: "選択して追加",
                subtitle: "追加する単語を選んでください"
            ) {
                showImportSheet = false
                selectMode = true
                selectedIds = []
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity)
        .background(MerkenTheme.background.ignoresSafeArea())
        .presentationDetents([.height(hasActiveFilters && filteredWords.count != viewModel.words.count ? 260 : 200)])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(20)
        .presentationBackground(MerkenTheme.background)
    }

    private func importSheetRow(icon: String, iconColor: Color, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(iconColor)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
                Spacer()
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 4)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private var loadingPlaceholder: some View {
        HStack {
            Spacer()
            VStack(spacing: 6) {
                ProgressView().progressViewStyle(.circular)
                Text("読み込み中...")
                    .font(.system(size: 13))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .padding(.vertical, 24)
            Spacer()
        }
    }

    private func emptyPlaceholder(text: String) -> some View {
        SolidEmptyState(icon: "tray", title: "単語がありません", message: text)
            .padding(.vertical, 8)
    }
}
