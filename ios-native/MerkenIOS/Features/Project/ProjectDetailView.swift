import SwiftUI
import PhotosUI
import UIKit

private enum NotionSortOrder: String, CaseIterable {
    case createdAsc  = "追加順"
    case alphabetical = "アルファベット"
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
                result = result.filter { $0.status == .mastered }
            case .passive:
                result = result.filter { $0.status == .review || $0.status == .new }
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
                .navigationDestination(item: $selectedNotionWord) { word in
                    WordDetailView(project: project, wordID: word.id, viewModel: viewModel)
                }
                .sheet(isPresented: $showingProjectShareSheet, content: projectShareSheet)
                .sheet(isPresented: $notionShowFilterSheet) { notionFilterSheet }
        )

        return AnyView(
            presented
                .alert("この単語帳を削除しますか？", isPresented: $showingDeleteConfirm, actions: deleteAlertActions, message: deleteAlertMessage)
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
            VStack(spacing: 0) {
                webStyleHeader
                scrollContent
            }

            bottomActionBar
        }
        .ignoresSafeArea(.keyboard)
        .background(MerkenTheme.background.ignoresSafeArea())
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage = viewModel.errorMessage {
                    SolidCard {
                        Text(errorMessage)
                            .foregroundStyle(MerkenTheme.warning)
                    }
                }

                projectStatsSection

                notionWordListSection
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await viewModel.load(projectId: project.id, using: appState)
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
        .padding(16)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.border, lineWidth: 1)
        )
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
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            Button {
                MerkenHaptic.light()
                flashcardDestination = project
            } label: {
                Image(systemName: "rectangle.portrait.on.rectangle.portrait")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 48, height: 48)
                    .background(Color.clear)
                    .clipShape(Circle())
                    .overlay(
                        Circle()
                            .stroke(MerkenTheme.accentBlue, lineWidth: 2)
                    )
            }

            Button {
                MerkenHaptic.light()
                quizDestination = project
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 15, weight: .bold))
                    Text("クイズ")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(MerkenTheme.primaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.surface, in: .rect(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(MerkenTheme.border, lineWidth: 1.5)
                )
            }

            Button {
                MerkenHaptic.light()
                showingScanModeSheet = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .bold))
                    Text("単語追加")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 14))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
            MerkenTheme.background
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
                    .foregroundStyle(MerkenTheme.accentBlue)
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
                    .tint(MerkenTheme.accentBlue)
                } header: {
                    Text("ブックマーク")
                }

                Section {
                    notionFilterActivenessRow(label: "すべて", icon: "circle.dashed", iconColor: MerkenTheme.mutedText, value: nil)
                    notionFilterActivenessRow(label: "アクティブ（習得済み）", icon: "checkmark.seal.fill", iconColor: MerkenTheme.success, value: .active)
                    notionFilterActivenessRow(label: "パッシブ（学習中・未学習）", icon: "arrow.trianglehead.2.clockwise", iconColor: MerkenTheme.accentBlue, value: .passive)
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
                        .foregroundStyle(MerkenTheme.accentBlue)
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
                        .foregroundStyle(MerkenTheme.accentBlue)
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
                        .foregroundStyle(MerkenTheme.warning)
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
        let totalHeight: CGFloat = boxSize * 3

        return ZStack {
            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { i in
                    Rectangle()
                        .fill(i < filledCount ? Color.primary : Color.clear)
                        .frame(width: boxSize, height: boxSize)
                }
            }

            VStack(spacing: 0) {
                Spacer().frame(height: boxSize)
                Rectangle().fill(MerkenTheme.border).frame(width: boxSize, height: 1)
                Spacer().frame(height: boxSize - 1)
                Rectangle().fill(MerkenTheme.border).frame(width: boxSize, height: 1)
                Spacer().frame(height: boxSize - 1)
            }
            .frame(height: totalHeight)
        }
        .frame(width: boxSize, height: totalHeight)
        .overlay(
            RoundedRectangle(cornerRadius: 3)
                .stroke(MerkenTheme.border, lineWidth: 1)
        )
        .clipShape(.rect(cornerRadius: 3))
    }

    // MARK: - Top Buttons Overlay (Web: 戻る | タイトル | 共有 ⋯)

    private var webStyleHeader: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Color.white.opacity(0.2), in: .circle)
                }

                VStack(spacing: 1) {
                    Text(displayProjectTitle)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Text("\(viewModel.words.count)語")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.7))
                        .monospacedDigit()
                }
                .frame(maxWidth: .infinity)

                HStack(spacing: 8) {
                    if appState.isPro {
                        Button {
                            Task { await handleShare() }
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 40, height: 40)
                                .background(Color.white.opacity(0.2), in: .circle)
                        }
                        .buttonStyle(.plain)
                    }

                    Menu {
                        Button {
                            renameProjectTitle = displayProjectTitle
                            showingRenameProject = true
                        } label: {
                            Label("名前を変更", systemImage: "pencil")
                        }

                        Button {
                            showingProjectThumbnailPicker = true
                        } label: {
                            Label(resolvedProject.iconImage == nil ? "画像を設定" : "画像を変更", systemImage: "photo")
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
                            Label("単語帳を削除", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(Color.white.opacity(0.2), in: .circle)
                    }
                    .accessibilityIdentifier("moreMenuButton")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 20)
        }
        .background(headerGradient.ignoresSafeArea(edges: .top))
    }

    private var headerGradient: some View {
        LinearGradient(
            colors: [thumbnailBackgroundColor, thumbnailBackgroundColor.opacity(0.85)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
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
