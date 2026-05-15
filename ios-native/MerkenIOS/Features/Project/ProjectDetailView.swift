import SwiftUI
import PhotosUI
import UIKit

private enum NotionSortOrder: String, CaseIterable {
    case createdAsc  = "追加順"
    case alphabetical = "アルファベット"
    case statusAsc = "未習得順"
}

private enum NotionActiveness: Equatable {
    case active
    case passive
}

private struct NotionFilterState {
    var partOfSpeech: String? = nil
    var activeness: NotionActiveness? = nil
    var bookmarkOnly: Bool = false

    var isActive: Bool {
        partOfSpeech != nil || activeness != nil || bookmarkOnly
    }
}

struct ProjectDetailView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectDetailViewModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var editorMode: WordEditorSheet.Mode?
    @State private var flashcardDestination: Project?
    @State private var quizDestination: Project?
    @State private var quiz2Destination: Project?
    @State private var showingScan = false
    @State private var showingScanModeSheet = false
    @State private var showMatchGame = false
    @State private var showingWordList = false
    @State private var dictionaryURL: URL?
    @State private var preparedProjectShareURL: URL?
    @State private var showingProjectShareSheet = false
    @State private var showingDeleteConfirm = false

    @State private var scrollOffset: CGFloat = 0
    @State private var renameProjectTitle = ""
    @State private var showingRenameProject = false
    @State private var displayProjectTitle: String
    @State private var displaySourceLabels: [String]
    @State private var preselectedScanMode: ScanMode?
    @State private var preselectedEikenLevel: EikenLevel?
    @State private var preselectedScanSource: ScanSource?
    @State private var showingProjectThumbnailPicker = false
    @State private var selectedProjectThumbnailItem: PhotosPickerItem?
    @State private var filteredWordListStatus: WordStatus?
    @State private var showingFilteredWordList = false
    @State private var selectedNotionWord: Word?
    @State private var showingShareRestrictionAlert = false
    @State private var shareRestrictionMessage = ""

    // Notion word list: search, filter, sort
    @State private var notionSearchText = ""
    @State private var notionShowSearch = false
    @State private var notionSortOrder: NotionSortOrder = .createdAsc
    @State private var notionFilterState = NotionFilterState()
    @State private var notionShowFilterSheet = false
    @State private var selectMode = false
    @State private var selectedWordIds = Set<String>()
    @State private var showingBulkDeleteConfirm = false
    @State private var bulkFavoriteLoading = false

    init(project: Project) {
        self.project = project
        _displayProjectTitle = State(initialValue: project.title)
        _displaySourceLabels = State(initialValue: project.sourceLabels)
    }

    private var resolvedProject: Project {
        viewModel.projectMetadata ?? project
    }

    private var thumbnailBackgroundColor: Color {
        if resolvedProject.iconImage != nil {
            return Color(red: 0.15, green: 0.15, blue: 0.18)
        }
        return MerkenTheme.placeholderColor(for: resolvedProject.id, isDark: colorScheme == .dark)
    }

    private var notionFilteredWords: [Word] {
        var result = viewModel.words

        // Search
        if !notionSearchText.isEmpty {
            result = result.filter {
                $0.english.localizedCaseInsensitiveContains(notionSearchText)
                    || $0.japanese.localizedCaseInsensitiveContains(notionSearchText)
            }
        }

        // Bookmark
        if notionFilterState.bookmarkOnly {
            result = result.filter { $0.isFavorite }
        }

        // Part of speech
        if let pos = notionFilterState.partOfSpeech {
            result = result.filter { word in
                word.partOfSpeechTags?.contains(where: {
                    $0.localizedCaseInsensitiveContains(pos)
                }) ?? false
            }
        }

        // Active / Passive
        if let activeness = notionFilterState.activeness {
            switch activeness {
            case .active:
                result = result.filter { $0.vocabularyType == .active }
            case .passive:
                result = result.filter { $0.vocabularyType == .passive }
            }
        }

        // Sort
        switch notionSortOrder {
        case .createdAsc:
            return result.sorted { $0.createdAt < $1.createdAt }
        case .alphabetical:
            return result.sorted {
                $0.english.localizedCaseInsensitiveCompare($1.english) == .orderedAscending
            }
        case .statusAsc:
            let order: [WordStatus: Int] = [.new: 0, .review: 1, .mastered: 2]
            return result.sorted {
                (order[$0.status] ?? 0) == (order[$1.status] ?? 0)
                    ? $0.createdAt < $1.createdAt
                    : (order[$0.status] ?? 0) < (order[$1.status] ?? 0)
            }
        }
    }

    private var notionAvailablePartsOfSpeech: [String] {
        let all = viewModel.words.flatMap { $0.partOfSpeechTags ?? [] }
        let trimmed = all.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return Array(Set(trimmed)).sorted()
    }

    var body: some View {
        configuredContent
    }

    private var configuredContent: some View {
        let chrome = AnyView(
            rootContent
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(.hidden, for: .navigationBar)
                .navigationBarBackButtonHidden(true)
                .toolbar(.hidden, for: .navigationBar)
                .overlay {
                    scanOverlay
                }
        )

        let presented = AnyView(
            chrome
                .sheet(isPresented: $showingScanModeSheet, content: scanModeSheet)
                .sheet(item: $editorMode, content: editorSheet)
                .sheet(item: $dictionaryURL) { url in
                    SafariView(url: url)
                        .ignoresSafeArea()
                }
                .fullScreenCover(isPresented: $showingWordList, content: wordListSheet)
                .fullScreenCover(isPresented: $showingFilteredWordList, content: filteredWordListSheet)
                .fullScreenCover(item: $flashcardDestination, content: flashcardSheet)
                .navigationDestination(item: $quizDestination) { project in
                    QuizView(project: project, preloadedWords: viewModel.words, skipSetup: true)
                }
                .navigationDestination(item: $quiz2Destination) { project in
                    Quiz2View(project: project, preloadedWords: viewModel.words)
                }
                .navigationDestination(isPresented: $showMatchGame) {
                    MatchGameView(project: project, words: viewModel.words)
                }
                .sheet(isPresented: $showingProjectShareSheet, content: projectShareSheet)
                .sheet(isPresented: $notionShowFilterSheet) { notionFilterSheet }
                .overlay {
                    WordDetailModalOverlay(
                        project: project,
                        viewModel: viewModel,
                        selectedWord: $selectedNotionWord
                    )
                }
        )

        return AnyView(
            presented
                .alert("この単語帳を削除しますか？", isPresented: $showingDeleteConfirm, actions: deleteAlertActions, message: deleteAlertMessage)
                .alert("選択した\(selectedWordIds.count)語を削除しますか？", isPresented: $showingBulkDeleteConfirm) {
                    Button("キャンセル", role: .cancel) {}
                    Button("削除", role: .destructive) {
                        deleteSelectedWords()
                    }
                } message: {
                    Text("この操作は取り消せません。")
                }
                .alert("単語帳名を変更", isPresented: $showingRenameProject, actions: renameAlertActions, message: renameAlertMessage)
                .alert("共有リンクを作成できません", isPresented: $showingShareRestrictionAlert) {
                    Button("設定を見る") {
                        appState.selectedTab = 4
                    }
                    Button("閉じる", role: .cancel) {}
                } message: {
                    Text(shareRestrictionMessage)
                }
                .photosPicker(isPresented: $showingProjectThumbnailPicker, selection: $selectedProjectThumbnailItem, matching: .images)
                .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
                    await viewModel.load(projectId: project.id, using: appState)
                }
                .onChange(of: viewModel.projectMetadata?.title) { _, newValue in
                    if let newValue, !newValue.isEmpty {
                        displayProjectTitle = newValue
                    }
                }
                .onChange(of: viewModel.projectMetadata?.sourceLabels) { _, newValue in
                    displaySourceLabels = normalizeProjectSourceLabels(newValue)
                }
                .onChange(of: selectedProjectThumbnailItem) { _, newValue in
                    guard let newValue else { return }
                    Task {
                        await applySelectedProjectThumbnail(newValue)
                    }
                }
                .onAppear {
                    appState.tabBarVisible = false
                }
                .onDisappear {
                    if flashcardDestination == nil &&
                       quizDestination == nil &&
                       quiz2Destination == nil &&
                       !showMatchGame &&
                       !showingWordList &&
                       !showingFilteredWordList {
                        appState.tabBarVisible = true
                    }
                }
        )
    }

    @ViewBuilder
    private var scanOverlay: some View {
        if showingScan {
            ScanCoordinatorView(
                targetProjectId: project.id,
                targetProjectTitle: displayProjectTitle,
                preselectedMode: preselectedScanMode,
                preselectedEikenLevel: preselectedEikenLevel,
                preselectedSource: preselectedScanSource,
                onComplete: { _ in
                    Task {
                        await viewModel.load(projectId: project.id, using: appState)
                    }
                },
                onDismissRequest: {
                    showingScan = false
                }
            )
            .environmentObject(appState)
            .transition(.opacity)
            .zIndex(4)
        }
    }

    private func scanModeSheet() -> some View {
        ScanModeSheet(
            isPro: appState.subscription?.isActivePro ?? false,
            onSelect: { mode, eikenLevel, source in
                preselectedScanMode = mode
                preselectedEikenLevel = eikenLevel
                preselectedScanSource = source
                showingScanModeSheet = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                    showingScan = true
                }
            },
            onCancel: {
                showingScanModeSheet = false
            }
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.resizes)
    }

    private func wordListSheet() -> some View {
        NavigationStack {
            WordListView(project: project)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            showingWordList = false
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                    }
                }
        }
    }

    private func filteredWordListSheet() -> some View {
        NavigationStack {
            WordListView(project: project, initialStatus: filteredWordListStatus)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            showingFilteredWordList = false
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                    }
                }
        }
    }

    private func flashcardSheet(project: Project) -> some View {
        NavigationStack {
            FlashcardView(project: project, preloadedWords: viewModel.words)
        }
    }

    @ViewBuilder
    private func projectShareSheet() -> some View {
        if let preparedProjectShareURL {
            ProjectShareSheet(
                project: resolvedProject,
                projectTitle: displayProjectTitle,
                words: viewModel.words,
                shareURL: preparedProjectShareURL,
                onUpdateShareScope: { shareScope in
                    try await appState.updateProjectShareScope(
                        projectId: project.id,
                        shareScope: shareScope
                    )
                }
            ) {
                showingProjectShareSheet = false
            }
        }
    }

    private func deleteAlertActions() -> some View {
        Group {
            Button("削除", role: .destructive) {
                Task {
                    await viewModel.deleteProject(id: project.id, using: appState)
                    dismiss()
                }
            }
            Button("キャンセル", role: .cancel) {}
        }
    }

    private func deleteAlertMessage() -> some View {
        Text("「\(displayProjectTitle)」と含まれる単語がすべて削除されます。この操作は取り消せません。")
    }

    private func renameAlertActions() -> some View {
        Group {
            TextField("単語帳名", text: $renameProjectTitle)
            Button("保存") {
                let nextTitle = renameProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !nextTitle.isEmpty else { return }
                displayProjectTitle = nextTitle
                Task {
                    await viewModel.renameProject(id: project.id, title: nextTitle, using: appState)
                }
            }
            .disabled(renameProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("キャンセル", role: .cancel) {
                renameProjectTitle = displayProjectTitle
            }
        }
    }

    private func renameAlertMessage() -> some View {
        Text("「\(displayProjectTitle)」の名前を変更します。")
    }

    private var rootContent: some View {
        ZStack(alignment: .bottom) {
            scrollContent

            if selectMode {
                bulkActionBar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .ignoresSafeArea(.keyboard)
        .background(PaperDotBackground().ignoresSafeArea())
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                webStyleHeader

                if let errorMessage = viewModel.errorMessage {
                    SolidCard {
                        Text(errorMessage)
                            .foregroundStyle(MerkenTheme.warning)
                    }
                    .padding(.horizontal, 20)
                }

                projectHeroSection
                projectStackedProgressSection
                topActionRow
                projectWordToolbar

                wordCardListSection
            }
            .padding(.top, 8)
            .padding(.bottom, selectMode ? 116 : 28)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await viewModel.load(projectId: project.id, using: appState)
        }
    }

    private var projectWordCounts: (total: Int, mastered: Int, learning: Int, newCount: Int) {
        let words = viewModel.words
        return (
            words.count,
            words.filter { $0.status == .mastered }.count,
            words.filter { $0.status == .review }.count,
            words.filter { $0.status == .new }.count
        )
    }

    private var wordFilterActive: Bool {
        notionFilterState.isActive || !notionSearchText.isEmpty
    }

    private var selectedWordsForBulk: [Word] {
        viewModel.words.filter { selectedWordIds.contains($0.id) }
    }

    private var allFilteredWordsSelected: Bool {
        !notionFilteredWords.isEmpty && notionFilteredWords.allSatisfy { selectedWordIds.contains($0.id) }
    }

    private var allFavoriteInSelection: Bool {
        let selected = selectedWordsForBulk
        return !selected.isEmpty && selected.allSatisfy(\.isFavorite)
    }

    private var projectHeroSection: some View {
        HStack(alignment: .top, spacing: 14) {
            projectThumbnail

            VStack(alignment: .leading, spacing: 5) {
                Text("BOOK · \(projectWordCounts.total) words")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(0.6)
                    .foregroundStyle(MerkenTheme.mutedText)

                Text(displayProjectTitle)
                    .font(.system(size: 24, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineLimit(3)
                    .minimumScaleFactor(0.82)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 2)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 2)
    }

    private var projectThumbnail: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(MerkenTheme.solidShadow)
                .offset(x: 2.5, y: 2.5)

            ZStack {
                if let iconImage = resolvedProject.iconImage,
                   let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                } else {
                    thumbnailBackgroundColor
                    Text(String(displayProjectTitle.prefix(1)))
                        .font(.system(size: 28, weight: .black))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .stroke(MerkenTheme.solidBorder, lineWidth: 1.25)
            )
        }
        .frame(width: 67, height: 67)
    }

    private var projectStackedProgressSection: some View {
        let counts = projectWordCounts
        return VStack(alignment: .leading, spacing: 7) {
            GeometryReader { proxy in
                let width = proxy.size.width
                let total = max(counts.total, 1)
                let masteredWidth = width * CGFloat(counts.mastered) / CGFloat(total)
                let learningWidth = width * CGFloat(counts.learning) / CGFloat(total)
                let newWidth = max(0, width - masteredWidth - learningWidth)

                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(MerkenTheme.surface)

                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(MerkenTheme.success)
                            .frame(width: masteredWidth)
                        Rectangle()
                            .fill(MerkenTheme.warning)
                            .frame(width: learningWidth)
                        Rectangle()
                            .fill(MerkenTheme.solidInk.opacity(0.12))
                            .frame(width: newWidth)
                    }
                    .clipShape(Capsule())
                }
                .overlay(Capsule().stroke(MerkenTheme.solidInk, lineWidth: 1.25))
            }
            .frame(height: 10)

            HStack(spacing: 14) {
                progressLegendDot(color: MerkenTheme.success, label: "習得", count: counts.mastered)
                progressLegendDot(color: MerkenTheme.warning, label: "学習中", count: counts.learning)
                progressLegendDot(color: MerkenTheme.solidInk.opacity(0.35), label: "未学習", count: counts.newCount)
            }
        }
        .padding(.horizontal, 20)
    }

    private func progressLegendDot(color: Color, label: String, count: Int) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 3.5, style: .continuous)
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(MerkenTheme.secondaryText)
            Text("\(count)")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(MerkenTheme.mutedText)
        }
    }

    private var topActionRow: some View {
        HStack(spacing: 8) {
            Button {
                MerkenHaptic.light()
                quizDestination = project
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .medium))
                    Text("クイズを始める")
                }
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .projectWebSolidSurface(
                    fill: MerkenTheme.accentGreen,
                    borderColor: MerkenTheme.accentGreen,
                    shadowColor: MerkenTheme.accentGreen,
                    cornerRadius: 10
                )
            }
            .buttonStyle(.plain)

            Button {
                MerkenHaptic.light()
                flashcardDestination = project
            } label: {
                webProjectIconButton(icon: "rectangle.on.rectangle", iconSize: 18)
            }
            .buttonStyle(.plain)

            Menu {
                Button {
                    showingScanModeSheet = true
                } label: {
                    Label("スキャンで追加", systemImage: "camera")
                }

                Button {
                    editorMode = .create
                } label: {
                    Label("手で入力", systemImage: "pencil")
                }
            } label: {
                webProjectIconButton(icon: "plus", iconSize: 20)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 4)
    }

    private func webProjectIconButton(icon: String, iconSize: CGFloat) -> some View {
        Image(systemName: icon)
            .font(.system(size: iconSize, weight: .medium))
            .foregroundStyle(MerkenTheme.solidInk)
            .frame(width: 44, height: 44)
            .projectWebSolidSurface(cornerRadius: 10)
    }

    private var projectWordToolbar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)

                TextField("単語を検索", text: $notionSearchText)
                    .font(.system(size: 12, weight: .medium))
                    .textFieldStyle(.plain)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                if !notionSearchText.isEmpty {
                    Button {
                        notionSearchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity)
            .projectWebSolidSurface(cornerRadius: 18)

            if wordFilterActive {
                Text("\(notionFilteredWords.count)/\(projectWordCounts.total)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            toolbarCircle(icon: "line.3.horizontal.decrease", isActive: notionFilterState.isActive) {
                notionShowFilterSheet = true
            }

            Menu {
                ForEach(NotionSortOrder.allCases, id: \.self) { order in
                    Button {
                        notionSortOrder = order
                    } label: {
                        if notionSortOrder == order {
                            Label(order.rawValue, systemImage: "checkmark")
                        } else {
                            Text(order.rawValue)
                        }
                    }
                }
            } label: {
                toolbarCircleLabel(icon: "arrow.up.arrow.down", isActive: notionSortOrder != .createdAsc)
            }

            toolbarCircle(icon: selectMode ? "xmark" : "checkmark.square", isActive: selectMode) {
                withAnimation(.easeInOut(duration: 0.18)) {
                    selectMode.toggle()
                    if !selectMode {
                        selectedWordIds.removeAll()
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 2)
    }

    private func toolbarCircle(icon: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            toolbarCircleLabel(icon: icon, isActive: isActive)
        }
        .buttonStyle(.plain)
    }

    private func toolbarCircleLabel(icon: String, isActive: Bool) -> some View {
        Image(systemName: icon)
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(isActive ? MerkenTheme.inverseText : MerkenTheme.solidInk)
            .frame(width: 32, height: 32)
            .projectWebSolidSurface(
                fill: isActive ? MerkenTheme.inverseSurface : MerkenTheme.surface,
                cornerRadius: 16
            )
    }

    private var wordCardListSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if viewModel.loading && viewModel.words.isEmpty {
                wordListLoadingCard
            } else if viewModel.words.isEmpty {
                webWordEmptyCard(text: "単語がありません")
            } else if notionFilteredWords.isEmpty {
                webWordEmptyCard(text: notionSearchText.isEmpty ? "一致する単語がありません" : "一致する単語がありません")
            } else {
                ForEach(notionFilteredWords) { word in
                    webWordCard(word)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 2)
    }

    private var wordListLoadingCard: some View {
        HStack {
            Spacer()
            ProgressView()
                .controlSize(.small)
            Text("単語を読み込み中...")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(MerkenTheme.mutedText)
            Spacer()
        }
        .padding(.vertical, 28)
        .solidSurface(tone: .surface, depth: .flat, cornerRadius: 12, borderColor: MerkenTheme.border)
    }

    private func webWordEmptyCard(text: String) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(MerkenTheme.mutedText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 34)
            .padding(.horizontal, 16)
            .solidSurface(tone: .surface, depth: .flat, cornerRadius: 12, borderColor: MerkenTheme.border)
    }

    private func webWordCard(_ word: Word) -> some View {
        let isSelected = selectedWordIds.contains(word.id)
        let fillColor = isSelected && selectMode ? MerkenTheme.chartBlue.opacity(0.06) : MerkenTheme.surface
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)

        return HStack(spacing: 10) {
            if selectMode {
                selectCheckbox(isSelected: isSelected)
                    .frame(width: 22, height: 22)
            } else {
                Button {
                    MerkenHaptic.light()
                    Task {
                        await viewModel.advanceNotionCheckbox(
                            word: word,
                            projectId: project.id,
                            using: appState
                        )
                    }
                } label: {
                    webStatusSquares(filledCount: viewModel.filledNotionCount(for: word))
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(word.english)
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineLimit(1)
                    .truncationMode(.tail)

                HStack(spacing: 4) {
                    if let pos = posShort(for: word) {
                        Text(pos)
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }

                    Text(word.japanese)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                if selectMode {
                    toggleSelectedWord(word.id)
                } else {
                    selectedNotionWord = word
                }
            }

            if selectMode {
                if word.isFavorite {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 16, weight: .black))
                        .foregroundStyle(MerkenTheme.accentGreen)
                }
            } else {
                VocabularyTypeCycleButton(vocabularyType: word.vocabularyType) {
                    MerkenHaptic.light()
                    let next = VocabularyType.cyclingNext(after: word.vocabularyType)
                    Task {
                        await viewModel.updateWord(
                            wordId: word.id,
                            patch: WordPatch(vocabularyType: .some(next)),
                            broadcastChanges: false,
                            projectId: project.id,
                            using: appState
                        )
                    }
                }
                .frame(width: 28, height: 28)

                Button {
                    MerkenHaptic.light()
                    Task {
                        await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                    }
                } label: {
                    Image(systemName: word.isFavorite ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundStyle(MerkenTheme.accentGreen)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .background(fillColor, in: shape)
        .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
        .background(shape.fill(MerkenTheme.solidShadow).offset(x: 2, y: 2))
        .contentShape(shape)
        .onTapGesture {
            if selectMode {
                toggleSelectedWord(word.id)
            }
        }
    }

    private func toggleSelectedWord(_ wordId: String) {
        if selectedWordIds.contains(wordId) {
            selectedWordIds.remove(wordId)
        } else {
            selectedWordIds.insert(wordId)
        }
    }

    private func webStatusSquares(filledCount: Int) -> some View {
        let boxSize: CGFloat = 9
        let boxSpacing: CGFloat = 3.5

        return VStack(spacing: boxSpacing) {
            ForEach(0..<3, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(index < filledCount ? MerkenTheme.solidInk : Color.clear)
                    .frame(width: boxSize, height: boxSize)
                    .overlay(
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .stroke(MerkenTheme.solidBorder, lineWidth: 1.1)
                    )
            }
        }
        .padding(.horizontal, 2)
        .padding(.vertical, 1)
    }

    private func selectCheckbox(isSelected: Bool) -> some View {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(isSelected ? MerkenTheme.solidInk : MerkenTheme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .stroke(MerkenTheme.solidInk, lineWidth: 1.5)
            )
            .overlay {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(.white)
                }
            }
    }

    private func posShort(for word: Word) -> String? {
        guard let first = word.partOfSpeechTags?.first?.trimmingCharacters(in: .whitespacesAndNewlines),
              !first.isEmpty else {
            return nil
        }
        let label = notionPosDisplayName(first)
        guard let firstCharacter = label.first else { return nil }
        return "(\(firstCharacter))"
    }

    private var bulkActionBar: some View {
        HStack(spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    selectMode = false
                    selectedWordIds.removeAll()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
            }
            .buttonStyle(SolidButtonStyle(.surface, size: .icon(36), cornerRadius: 10))

            Button {
                if allFilteredWordsSelected {
                    for word in notionFilteredWords {
                        selectedWordIds.remove(word.id)
                    }
                } else {
                    for word in notionFilteredWords {
                        selectedWordIds.insert(word.id)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    selectCheckbox(isSelected: allFilteredWordsSelected)
                        .frame(width: 18, height: 18)
                    Text(allFilteredWordsSelected ? "解除" : "全選択")
                        .font(.system(size: 12, weight: .bold))
                }
            }
            .buttonStyle(SolidButtonStyle(.surface, size: .small, cornerRadius: 10))
            .disabled(notionFilteredWords.isEmpty)

            VStack(spacing: 2) {
                Text("SELECTED")
                    .font(.system(size: 9, weight: .black, design: .monospaced))
                    .tracking(0.7)
                    .foregroundStyle(MerkenTheme.mutedText)
                HStack(alignment: .lastTextBaseline, spacing: 3) {
                    Text("\(selectedWordIds.count)")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text("/ \(notionFilteredWords.count)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
            .frame(maxWidth: .infinity)

            Button {
                bulkToggleFavorite()
            } label: {
                if bulkFavoriteLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(MerkenTheme.accentGreen)
                } else {
                    Image(systemName: allFavoriteInSelection ? "bookmark.slash" : "bookmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(MerkenTheme.accentGreen)
                }
            }
            .buttonStyle(SolidButtonStyle(.surface, size: .icon(36), cornerRadius: 10))
            .disabled(selectedWordIds.isEmpty || bulkFavoriteLoading)

            Button {
                showingBulkDeleteConfirm = true
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "trash")
                    Text("削除")
                }
            }
            .buttonStyle(SolidButtonStyle(.danger, size: .small, cornerRadius: 10))
            .disabled(selectedWordIds.isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            LinearGradient(
                colors: [MerkenTheme.paperBackground.opacity(0), MerkenTheme.paperBackground, MerkenTheme.paperBackground],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .bottom)
        )
    }

    private func bulkToggleFavorite() {
        guard !selectedWordIds.isEmpty, !bulkFavoriteLoading else { return }
        let targetFavorite = !allFavoriteInSelection
        let ids = selectedWordIds

        Task {
            bulkFavoriteLoading = true
            defer { bulkFavoriteLoading = false }
            for word in viewModel.words where ids.contains(word.id) {
                await viewModel.updateWord(
                    wordId: word.id,
                    patch: WordPatch(isFavorite: targetFavorite),
                    broadcastChanges: false,
                    projectId: project.id,
                    using: appState
                )
            }
        }
    }

    private func deleteSelectedWords() {
        let ids = selectedWordIds
        guard !ids.isEmpty else { return }
        Task {
            for id in ids {
                await viewModel.deleteWord(wordId: id, projectId: project.id, using: appState)
            }
            selectedWordIds.removeAll()
            withAnimation(.easeInOut(duration: 0.18)) {
                selectMode = false
            }
        }
    }

    // MARK: - Project Stats Section (習得 / 学習中 / 未学習)

    private var projectStatsSection: some View {
        let words = viewModel.words
        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = words.filter { $0.status == .new }.count
        let total = words.count

        return HStack(alignment: .top, spacing: 12) {
            statsColumnButton(
                count: masteredCount, total: total, label: "習得",
                borderColor: MerkenTheme.success, icon: "checkmark",
                iconColor: MerkenTheme.success, status: .mastered
            )

            statsColumnButton(
                count: reviewCount, total: total, label: "学習中",
                borderColor: MerkenTheme.mutedText, icon: "arrow.trianglehead.2.clockwise",
                iconColor: MerkenTheme.mutedText, status: .review
            )

            statsColumnButton(
                count: newCount, total: total, label: "未学習",
                borderColor: MerkenTheme.border, icon: "sparkle",
                iconColor: MerkenTheme.mutedText, status: .new
            )
        }
        .padding(0)
    }

    private func statsColumnButton(count: Int, total: Int, label: String, borderColor: Color, icon: String, iconColor: Color, status: WordStatus) -> some View {
        Button {
            MerkenHaptic.light()
            filteredWordListStatus = status
            showingFilteredWordList = true
        } label: {
            statsColumn(count: count, total: total, label: label, borderColor: borderColor, icon: icon, iconColor: iconColor)
        }
        .buttonStyle(.plain)
    }

    private func statsColumn(count: Int, total: Int, label: String, borderColor: Color, icon: String, iconColor: Color) -> some View {
        VStack(spacing: 0) {
            Text("\(count)/\(total)語")
                .font(.system(size: 12))
                .foregroundStyle(MerkenTheme.mutedText)
                .monospacedDigit()

            Text(label)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .padding(.top, 4)

            Circle()
                .stroke(borderColor, lineWidth: 3)
                .frame(width: 40, height: 40)
                .overlay(
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(iconColor)
                )
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .solidSurface(
            tone: .surface,
            depth: .small,
            cornerRadius: 16,
            borderColor: borderColor
        )
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            Button {
                MerkenHaptic.light()
                flashcardDestination = project
            } label: {
                Image(systemName: "rectangle.portrait.on.rectangle.portrait")
                    .font(.system(size: 18, weight: .black))
            }
            .buttonStyle(SolidButtonStyle(.surface, size: .icon(48), cornerRadius: 24))

            Button {
                MerkenHaptic.light()
                quizDestination = project
            } label: {
                Text("クイズ")
            }
            .buttonStyle(SolidButtonStyle(.surface, size: .medium, expands: true, cornerRadius: 14))

            Button {
                MerkenHaptic.light()
                showingScanModeSheet = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                    Text("単語追加")
                }
            }
            .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 14))
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
            MerkenTheme.paperBackground
                .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: -4)
                .ignoresSafeArea(.container, edges: .bottom)
        )
    }

    // MARK: - Notion-style Word List Section

    private let notionCheckColWidth: CGFloat = 34
    /// Web `min-w-[10rem]` 相当。広すぎると単語と A/P の間に不要な空白ができる
    private let notionEnglishColWidth: CGFloat = 158
    /// Web の A/P・品詞列（各 `w-10`）を1ブロックにまとめた幅
    private let notionApPosClusterWidth: CGFloat = 88
    private let notionJapaneseColWidth: CGFloat = 180

    private var notionWordListSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header + toolbar on same row
            HStack(alignment: .center, spacing: 6) {
                Text("単語一覧")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.words.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .monospacedDigit()

                Spacer()

                notionToolbar
            }
            .padding(.bottom, 10)

            // Expandable search bar
            if notionShowSearch {
                notionSearchBar
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.bottom, 8)
            }

            if viewModel.words.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "tray")
                            .font(.system(size: 22))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text("単語がありません")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    .padding(.vertical, 24)
                    Spacer()
                }
            } else if notionFilteredWords.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "tray")
                            .font(.system(size: 22))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text(notionSearchText.isEmpty
                             ? "条件に一致する単語がありません"
                             : "「\(notionSearchText)」に一致する単語がありません")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.vertical, 24)
                    Spacer()
                }
            } else {
                // Horizontal scroll — no outer border box, Notion style
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(spacing: 0) {
                        notionColumnHeader

                        let words = notionFilteredWords
                        ForEach(Array(words.enumerated()), id: \.element.id) { index, word in
                            notionWordRow(word, isLast: index == words.count - 1)
                        }
                    }
                }
            }
        }
        .padding(14)
        .solidSurface(tone: .surface, depth: .standard, cornerRadius: 18)
    }

    // MARK: - Notion Toolbar

    private var notionToolbar: some View {
        HStack(spacing: 6) {
            // Search toggle
            notionToolbarIconButton(
                icon: notionShowSearch ? "xmark" : "magnifyingglass",
                isActive: notionShowSearch || !notionSearchText.isEmpty
            ) {
                withAnimation(.easeInOut(duration: 0.18)) {
                    notionShowSearch.toggle()
                    if !notionShowSearch { notionSearchText = "" }
                }
            }

            // Filter
            notionToolbarIconButton(
                icon: "line.3.horizontal.decrease.circle",
                isActive: notionFilterState.isActive
            ) {
                notionShowFilterSheet = true
            }

            // Sort menu
            Menu {
                ForEach(NotionSortOrder.allCases, id: \.self) { order in
                    Button {
                        notionSortOrder = order
                    } label: {
                        if notionSortOrder == order {
                            Label(order.rawValue, systemImage: "checkmark")
                        } else {
                            Text(order.rawValue)
                        }
                    }
                }
            } label: {
                notionToolbarIconLabel(icon: "arrow.up.arrow.down", isActive: false)
            }

            // Active filter badge
            if notionFilterState.isActive || !notionSearchText.isEmpty {
                let count = notionFilteredWords.count
                let total = viewModel.words.count
                Text("\(count)/\(total)")
                    .font(.system(size: 11, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    @ViewBuilder
    private func notionToolbarIconButton(icon: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            notionToolbarIconLabel(icon: icon, isActive: isActive)
        }
    }

    private func notionToolbarIconLabel(icon: String, isActive: Bool) -> some View {
        Image(systemName: icon)
            .font(.system(size: 16, weight: .black))
            .foregroundStyle(isActive ? MerkenTheme.inverseText : MerkenTheme.solidInk)
            .frame(width: 36, height: 36)
            .solidSurface(
                tone: isActive ? .inverse : .surface,
                depth: .small,
                cornerRadius: 18
            )
    }

    // MARK: - Notion Search Bar

    private var notionSearchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(MerkenTheme.mutedText)
            TextField("単語を検索...", text: $notionSearchText)
                .font(.system(size: 15))
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
            if !notionSearchText.isEmpty {
                Button {
                    notionSearchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
        .solidTextField(cornerRadius: 14)
    }

    // MARK: - Notion Filter Sheet

    private var notionFilterSheet: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(isOn: $notionFilterState.bookmarkOnly) {
                        Label("ブックマークのみ", systemImage: "bookmark.fill")
                            .foregroundStyle(MerkenTheme.primaryText)
                    }
                    .tint(MerkenTheme.accentGreen)
                } header: {
                    Text("ブックマーク")
                }

                Section {
                    notionFilterActivenessRow(label: "すべて", icon: "circle.dashed", iconColor: MerkenTheme.mutedText, value: nil)
                    notionFilterActivenessRow(label: "アクティブ", icon: "a.circle.fill", iconColor: MerkenTheme.accentGreen, value: .active)
                    notionFilterActivenessRow(label: "パッシブ", icon: "p.circle.fill", iconColor: MerkenTheme.secondaryText, value: .passive)
                } header: {
                    Text("アクティブ / パッシブ")
                }

                if !notionAvailablePartsOfSpeech.isEmpty {
                    Section {
                        notionFilterPosRow(label: "すべて", value: nil)
                        ForEach(notionAvailablePartsOfSpeech, id: \.self) { pos in
                            notionFilterPosRow(label: notionPosDisplayName(pos), value: pos)
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
                        notionFilterState = NotionFilterState()
                    }
                    .foregroundStyle(MerkenTheme.danger)
                    .disabled(!notionFilterState.isActive)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完了") { notionShowFilterSheet = false }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func notionFilterActivenessRow(label: String, icon: String, iconColor: Color, value: NotionActiveness?) -> some View {
        let isSelected = notionFilterState.activeness == value
        return Button {
            notionFilterState.activeness = value
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
                        .foregroundStyle(MerkenTheme.solidInk)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func notionFilterPosRow(label: String, value: String?) -> some View {
        let isSelected = notionFilterState.partOfSpeech == value
        return Button {
            notionFilterState.partOfSpeech = value
        } label: {
            HStack {
                Text(label)
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.solidInk)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func notionPosDisplayName(_ tag: String) -> String {
        let mapping: [String: String] = [
            "noun": "名詞", "verb": "動詞", "adjective": "形容詞",
            "adverb": "副詞", "preposition": "前置詞", "conjunction": "接続詞",
            "pronoun": "代名詞", "interjection": "感動詞",
            "determiner": "限定詞", "auxiliary": "助動詞",
            "phrase": "句", "idiom": "イディオム", "phrasal_verb": "句動詞",
            "other": "その他",
        ]
        return mapping[tag.lowercased()] ?? tag
    }

    private var notionColumnHeader: some View {
        HStack(spacing: 0) {
            Spacer().frame(width: notionCheckColWidth)

            Text("単語")
                .frame(width: notionEnglishColWidth, alignment: .leading)
                .padding(.leading, 8)

            HStack(spacing: 4) {
                Text("A/P")
                    .frame(width: 42, alignment: .center)
                Text("品詞")
                    .frame(width: 42, alignment: .center)
            }
            .frame(width: notionApPosClusterWidth)

            Text("訳")
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)

            Spacer().frame(width: 16)
        }
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(MerkenTheme.mutedText)
        .padding(.vertical, 6)
        .overlay(Rectangle().fill(MerkenTheme.border).frame(height: 1), alignment: .bottom)
    }

    private func notionWordRow(_ word: Word, isLast: Bool) -> some View {
        HStack(spacing: 0) {
            Button {
                MerkenHaptic.light()
                Task {
                    await viewModel.advanceNotionCheckbox(
                        word: word,
                        projectId: project.id,
                        using: appState
                    )
                }
            } label: {
                notionCheckBoxes(filledCount: viewModel.filledNotionCount(for: word))
                    .frame(width: notionCheckColWidth, alignment: .center)
            }
            .buttonStyle(.plain)

            HStack(spacing: 4) {
                Text(word.english)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if word.isFavorite {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(MerkenTheme.accentGreen)
                }
            }
            .frame(width: notionEnglishColWidth, alignment: .leading)
            .padding(.leading, 8)
            .padding(.vertical, 8)

            HStack(spacing: 4) {
                notionVocabularyTypeCell(for: word)
                    .frame(width: 42, alignment: .center)
                notionPosBadge(for: word)
                    .frame(width: 42, alignment: .center)
            }
            .frame(width: notionApPosClusterWidth)
            .padding(.vertical, 8)

            // Japanese translation
            Text(word.japanese)
                .font(.system(size: 13))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)
                .padding(.vertical, 8)

            // 右端の余白
            Spacer().frame(width: 16)
        }
        .frame(minHeight: 48)
        .contentShape(Rectangle())
        .onTapGesture {
            selectedNotionWord = word
        }
        .overlay(
            Group {
                if !isLast {
                    Rectangle()
                        .fill(MerkenTheme.borderLight)
                        .frame(height: 1)
                }
            },
            alignment: .bottom
        )
    }

    private func notionVocabularyTypeCell(for word: Word) -> some View {
        VocabularyTypeCycleButton(vocabularyType: word.vocabularyType) {
            MerkenHaptic.light()
            let next = VocabularyType.cyclingNext(after: word.vocabularyType)
            Task {
                await viewModel.updateWord(
                    wordId: word.id,
                    patch: WordPatch(vocabularyType: .some(next)),
                    broadcastChanges: false,
                    projectId: project.id,
                    using: appState
                )
            }
        }
    }

    /// 品詞を日本語略称バッジで表示
    @ViewBuilder
    private func notionPosBadge(for word: Word) -> some View {
        let tags = word.partOfSpeechTags ?? []
        let label = tags.compactMap { tag -> String? in
            let t = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            switch t {
            case "noun", "名詞":               return "名"
            case "verb", "動詞":               return "動"
            case "adjective", "形容詞":        return "形"
            case "adverb", "副詞":             return "副"
            case "preposition", "前置詞":      return "前"
            case "conjunction", "接続詞":      return "接"
            case "pronoun", "代名詞":          return "代"
            case "idiom", "熟語", "phrase",
                 "フレーズ", "idiomatic_expression": return "熟"
            case "phrasal_verb", "句動詞":     return "句"
            default:                           return nil
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

    /// 3マスのチェックボックス（縦並び）。`filledCount` は ViewModel / NotionCheckboxProgress が算出。
    private func notionCheckBoxes(filledCount: Int) -> some View {
        let boxSize: CGFloat = 13
        let boxSpacing: CGFloat = 3

        return VStack(spacing: boxSpacing) {
            ForEach(0..<3, id: \.self) { i in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(i < filledCount ? MerkenTheme.solidInk : Color.clear)
                    .frame(width: boxSize, height: boxSize)
                    .overlay(
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .stroke(MerkenTheme.solidBorder, lineWidth: 1.1)
                    )
            }
        }
    }

    // MARK: - Top Buttons Overlay (Web: 戻る | タイトル | 共有 ⋯)

    private var webStyleHeader: some View {
        HStack {
            SolidIconButton(systemImage: "chevron.left", size: 38) {
                dismiss()
            }

            Spacer()

            Menu {
                Button {
                    renameProjectTitle = displayProjectTitle
                    showingRenameProject = true
                } label: {
                    Label("名称変更", systemImage: "pencil")
                }

                Button {
                    showingProjectThumbnailPicker = true
                } label: {
                    Label(resolvedProject.iconImage == nil ? "画像設定" : "画像変更", systemImage: "photo")
                }

                Button {
                    Task { await handleShare() }
                } label: {
                    Label("共有", systemImage: "square.and.arrow.up")
                }

                if resolvedProject.iconImage != nil {
                    Button {
                        Task {
                            await viewModel.updateProjectIcon(id: project.id, iconImage: nil, using: appState)
                        }
                    } label: {
                        Label("単色に戻す", systemImage: "paintpalette")
                    }
                }

                Divider()

                Button(role: .destructive) {
                    showingDeleteConfirm = true
                } label: {
                    Label("削除", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .frame(width: 38, height: 38)
                    .solidSurface(tone: .surface, depth: .small, cornerRadius: 19)
            }
            .accessibilityIdentifier("moreMenuButton")
        }
        .padding(.horizontal, 16)
        .padding(.top, 2)
        .padding(.bottom, 2)
    }

    private var headerGradient: some View {
        thumbnailBackgroundColor
    }

    private func handleShare() async {
        guard appState.isLoggedIn else {
            shareRestrictionMessage = "共有リンクの作成にはログインが必要です。"
            showingShareRestrictionAlert = true
            return
        }

        guard appState.isPro else {
            shareRestrictionMessage = "共有リンクの作成はProプラン限定です。設定からアップグレードしてください。"
            showingShareRestrictionAlert = true
            return
        }

        do {
            var shareId = resolvedProject.shareId
            if shareId == nil || shareId?.isEmpty == true {
                shareId = try await appState.generateProjectShareId(projectId: project.id)
            }

            guard let shareId,
                  let shareURL = URL(string: "https://www.merken.jp/share/\(shareId)") else {
                shareRestrictionMessage = "共有リンクの作成に失敗しました。時間をおいて再度お試しください。"
                showingShareRestrictionAlert = true
                return
            }

            preparedProjectShareURL = shareURL
        } catch {
            preparedProjectShareURL = nil
            shareRestrictionMessage = "共有リンクの作成に失敗しました。時間をおいて再度お試しください。"
            showingShareRestrictionAlert = true
            return
        }

        showingProjectShareSheet = preparedProjectShareURL != nil
    }

    private func applySelectedProjectThumbnail(_ item: PhotosPickerItem) async {
        defer {
            selectedProjectThumbnailItem = nil
        }

        guard let data = try? await item.loadTransferable(type: Data.self),
              let uiImage = UIImage(data: data),
              let base64 = ImageCompressor.generateThumbnailBase64(uiImage) else {
            return
        }

        await viewModel.updateProjectIcon(id: project.id, iconImage: base64, using: appState)
        await viewModel.load(projectId: project.id, using: appState)
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

private struct ProjectSourceLabelsSection: View {
    enum Appearance {
        case surface
        case thumbnail
    }

    let labels: [String]
    var maxRows: Int = 2
    var appearance: Appearance = .surface

    @State private var availableWidth: CGFloat = 0

    private let chipHorizontalPadding: CGFloat = 10
    private let chipVerticalPadding: CGFloat = 6
    private let chipSpacing: CGFloat = 8
    private let font = UIFont.systemFont(ofSize: 13, weight: .semibold)

    private var visibleLabels: [String] {
        guard availableWidth > 0 else { return normalizeProjectSourceLabels(labels) }

        let normalized = normalizeProjectSourceLabels(labels)
        guard normalized.count > 1 else { return normalized }

        for visibleCount in stride(from: normalized.count, through: 1, by: -1) {
            let hiddenCount = normalized.count - visibleCount
            var candidate = Array(normalized.prefix(visibleCount))
            if hiddenCount > 0 {
                candidate.append("+\(hiddenCount)")
            }

            if fitsWithinTwoRows(candidate, width: availableWidth) {
                return candidate
            }
        }

        return ["+\(normalized.count)"]
    }

    var body: some View {
        let normalized = normalizeProjectSourceLabels(labels)

        Group {
            if !normalized.isEmpty {
                Group {
                    if maxRows == 1 {
                        HStack(spacing: chipSpacing) {
                            ForEach(visibleLabels, id: \.self) { label in
                                chip(label)
                            }
                        }
                    } else {
                        FlowLayout(spacing: chipSpacing) {
                            ForEach(visibleLabels, id: \.self) { label in
                                chip(label)
                            }
                        }
                    }
                }
                .background(
                    GeometryReader { proxy in
                        Color.clear
                            .onAppear {
                                availableWidth = proxy.size.width
                            }
                            .onChange(of: proxy.size.width) { _, newWidth in
                                availableWidth = newWidth
                            }
                    }
                )
            }
        }
    }

    private func fitsWithinTwoRows(_ labels: [String], width: CGFloat) -> Bool {
        guard width > 0 else { return true }

        var currentRow = 1
        var currentX: CGFloat = 0

        for label in labels {
            let chipWidth = measuredChipWidth(for: label)
            if currentX > 0, currentX + chipSpacing + chipWidth > width {
                currentRow += 1
                currentX = 0
            }

            if currentRow > maxRows {
                return false
            }

            if currentX > 0 {
                currentX += chipSpacing
            }
            currentX += chipWidth
        }

        return true
    }

    private func measuredChipWidth(for label: String) -> CGFloat {
        let textWidth = NSString(string: label).size(withAttributes: [.font: font]).width
        return ceil(textWidth + chipHorizontalPadding * 2 + 2)
    }

    @ViewBuilder
    private func chip(_ label: String) -> some View {
        Text(label)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(appearance == .thumbnail ? Color.white.opacity(0.94) : MerkenTheme.secondaryText)
            .lineLimit(1)
            .padding(.horizontal, chipHorizontalPadding)
            .padding(.vertical, chipVerticalPadding)
            .background(
                appearance == .thumbnail ? Color.black.opacity(0.22) : MerkenTheme.surface,
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(
                        appearance == .thumbnail ? Color.white.opacity(0.18) : MerkenTheme.border,
                        lineWidth: 1
                    )
            )
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(subviews: subviews, containerWidth: proposal.width ?? .infinity)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(subviews: subviews, containerWidth: bounds.width)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: ProposedViewSize(result.sizes[index])
            )
        }
    }

    private struct LayoutResult {
        var positions: [CGPoint]
        var sizes: [CGSize]
        var size: CGSize
    }

    private func layout(subviews: Subviews, containerWidth: CGFloat) -> LayoutResult {
        var positions: [CGPoint] = []
        var sizes: [CGSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            sizes.append(size)

            if x + size.width > containerWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }

            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxWidth = max(maxWidth, x)
        }

        return LayoutResult(
            positions: positions,
            sizes: sizes,
            size: CGSize(width: maxWidth, height: y + rowHeight)
        )
    }
}

private struct ProjectWebSolidSurfaceModifier: ViewModifier {
    let fill: Color
    let borderColor: Color
    let shadowColor: Color
    let cornerRadius: CGFloat
    let lineWidth: CGFloat
    let shadowOffset: CGSize

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        content
            .background(fill, in: shape)
            .overlay(shape.stroke(borderColor, lineWidth: lineWidth))
            .background(
                shape
                    .fill(shadowColor)
                    .offset(x: shadowOffset.width, y: shadowOffset.height)
            )
    }
}

private extension View {
    func projectWebSolidSurface(
        fill: Color = MerkenTheme.surface,
        borderColor: Color = MerkenTheme.solidBorder,
        shadowColor: Color = MerkenTheme.solidShadow,
        cornerRadius: CGFloat,
        lineWidth: CGFloat = 1.25,
        shadowOffset: CGSize = CGSize(width: 2, height: 2)
    ) -> some View {
        modifier(
            ProjectWebSolidSurfaceModifier(
                fill: fill,
                borderColor: borderColor,
                shadowColor: shadowColor,
                cornerRadius: cornerRadius,
                lineWidth: lineWidth,
                shadowOffset: shadowOffset
            )
        )
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
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
