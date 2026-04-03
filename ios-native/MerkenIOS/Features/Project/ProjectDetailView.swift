import SwiftUI
import PhotosUI
import UIKit

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
    @State private var chartAnimationProgress: Double = 0
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

    private func triggerChartAnimation() {
        chartAnimationProgress = 0
        withAnimation(.easeOut(duration: 0.9)) {
            chartAnimationProgress = 1
        }
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
                .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
                .overlay(alignment: .top) {
                    topButtonsOverlay
                }
                .overlay {
                    scanOverlay
                }
                .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
                    scrollOffset = value
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
                    triggerChartAnimation()
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
                    triggerChartAnimation()
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
                        triggerChartAnimation()
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
                ZStack {
                    backgroundLayers
                    scrollContent
                }
            }

            bottomActionBar
        }
    }

    private var backgroundLayers: some View {
        VStack(spacing: 0) {
            thumbnailBackgroundColor
            MerkenTheme.background
        }
        .ignoresSafeArea()
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                topScrollAnchor
                projectThumbnailHeader
                projectBodyCard
            }
        }
        .coordinateSpace(name: "projectDetailScroll")
        .scrollIndicators(.hidden)
        .disableTopScrollEdgeEffectIfAvailable()
        .ignoresSafeArea(.container, edges: .top)
        .refreshable {
            await viewModel.load(projectId: project.id, using: appState)
            triggerChartAnimation()
        }
    }

    private var topScrollAnchor: some View {
        Color.clear
            .frame(height: 0)
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: TopSafeAreaScrollOffsetKey.self,
                        value: proxy.frame(in: .named("projectDetailScroll")).minY
                    )
                }
            )
    }

    private var projectBodyCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let errorMessage = viewModel.errorMessage {
                SolidCard {
                    Text(errorMessage)
                        .foregroundStyle(MerkenTheme.warning)
                }
            }

            // Status widgets: 習得 / 学習中 / 未学習
            projectStatsSection

            // 単語一覧（Notion風）
            notionWordListSection
        }
        .padding(20)
        .padding(.bottom, 100) // extra space for bottom bar
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 24, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 24)
                .fill(MerkenTheme.background)
        )
        .clipShape(
            UnevenRoundedRectangle(topLeadingRadius: 24, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 24)
        )
        .padding(.top, -100)
    }

    // MARK: - Project Stats Section (習得 / 学習中 / 未学習)

    private var projectStatsSection: some View {
        let words = viewModel.words
        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = words.filter { $0.status == .new }.count
        let total = words.count

        return HStack(alignment: .top, spacing: 10) {
            Button {
                filteredWordListStatus = .mastered
                showingFilteredWordList = true
            } label: {
                masteryCard(
                    label: "習得",
                    count: masteredCount,
                    total: total,
                    color: MerkenTheme.success,
                    icon: "checkmark.seal.fill"
                )
            }
            .buttonStyle(.plain)

            Button {
                filteredWordListStatus = .review
                showingFilteredWordList = true
            } label: {
                masteryCard(
                    label: "学習中",
                    count: reviewCount,
                    total: total,
                    color: MerkenTheme.accentBlue,
                    icon: "arrow.trianglehead.2.clockwise"
                )
            }
            .buttonStyle(.plain)

            Button {
                filteredWordListStatus = .new
                showingFilteredWordList = true
            } label: {
                masteryCard(
                    label: "未学習",
                    count: newCount,
                    total: total,
                    color: MerkenTheme.mutedText,
                    icon: "sparkle"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func masteryCard(label: String, count: Int, total: Int, color: Color, icon: String) -> some View {
        let progress: CGFloat = total > 0 ? CGFloat(count) / CGFloat(total) : 0

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(count)")
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("/\(total)語")
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .font(.system(size: 21, weight: .bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)

            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 2)

            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 5)

                Circle()
                    .trim(from: 0, to: animatedChartProgress(progress))
                    .stroke(
                        color,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(color)
            }
            .frame(width: 54, height: 54)
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 120)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
    }

    private func animatedChartProgress(_ progress: CGFloat) -> CGFloat {
        progress * chartAnimationProgress
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            // フラッシュカード丸アイコン
            Button {
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

            // "クイズ" pill button
            Button {
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
                .background(MerkenTheme.surface, in: .capsule)
                .overlay(
                    Capsule()
                        .stroke(MerkenTheme.border, lineWidth: 1.5)
                )
            }

            // "＋ 単語追加" pill button
            Button {
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
                .background(MerkenTheme.accentBlue, in: .capsule)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
            MerkenTheme.background
                .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: -4)
        )
    }

    // MARK: - Notion-style Word List Section

    private let notionCheckColWidth: CGFloat = 34
    private let notionEnglishColWidth: CGFloat = 220
    private let notionPosColWidth: CGFloat = 36
    private let notionJapaneseColWidth: CGFloat = 180

    private var notionWordListSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header
            HStack(alignment: .center, spacing: 6) {
                Text("単語一覧")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.words.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .monospacedDigit()
            }
            .padding(.bottom, 10)

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
            } else {
                // Horizontal scroll — no outer border box, Notion style
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(spacing: 0) {
                        notionColumnHeader

                        let words = viewModel.words
                        ForEach(Array(words.enumerated()), id: \.element.id) { index, word in
                            notionWordRow(word, isLast: index == words.count - 1)
                        }
                    }
                }
            }
        }
    }

    private var notionColumnHeader: some View {
        HStack(spacing: 0) {
            // Check column header — small grid icon
            Image(systemName: "square.grid.3x1.below.line.grid.1x2")
                .font(.system(size: 10, weight: .semibold))
                .frame(width: notionCheckColWidth, alignment: .center)

            notionColDivider

            Text("単語")
                .frame(width: notionEnglishColWidth, alignment: .leading)
                .padding(.leading, 10)

            notionColDivider

            Text("品詞")
                .frame(width: notionPosColWidth, alignment: .center)

            notionColDivider

            Text("訳")
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)

            // 右端の余白
            Spacer().frame(width: 16)
        }
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(MerkenTheme.mutedText)
        .padding(.vertical, 6)
        .overlay(Rectangle().fill(MerkenTheme.border).frame(height: 1), alignment: .bottom)
        .overlay(Rectangle().fill(MerkenTheme.border).frame(height: 1), alignment: .top)
    }

    private var notionColDivider: some View {
        Rectangle()
            .fill(MerkenTheme.border)
            .frame(width: 1)
            .padding(.vertical, 4)
    }

    private func notionWordRow(_ word: Word, isLast: Bool) -> some View {
        HStack(spacing: 0) {
            // Check cell — tap to cycle status
            Button {
                let next: WordStatus = {
                    switch word.status {
                    case .new: return .review
                    case .review: return .mastered
                    case .mastered: return .new
                    }
                }()
                Task {
                    await viewModel.updateWord(
                        wordId: word.id,
                        patch: WordPatch(status: next),
                        broadcastChanges: false,
                        projectId: project.id,
                        using: appState
                    )
                }
            } label: {
                notionCheckBoxes(for: word.status)
                    .frame(width: notionCheckColWidth, alignment: .center)
            }
            .buttonStyle(.plain)

            notionColDivider

            // English word — fixed column width, 2-line wrap
            HStack(spacing: 4) {
                Text(word.english)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if word.isFavorite {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
                notionVocabBadge(for: word)
            }
            .frame(width: notionEnglishColWidth, alignment: .leading)
            .padding(.leading, 10)
            .padding(.vertical, 8)

            notionColDivider

            // 品詞バッジ
            notionPosBadge(for: word)
                .frame(width: notionPosColWidth, alignment: .center)
                .padding(.vertical, 8)

            notionColDivider

            // Japanese translation — fixed column width, 2-line wrap
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

    @ViewBuilder
    private func notionVocabBadge(for word: Word) -> some View {
        Button {
            let next: VocabularyType? = {
                switch word.vocabularyType {
                case .none: return .active
                case .active: return .passive
                case .passive: return nil
                }
            }()
            Task {
                await viewModel.updateWord(
                    wordId: word.id,
                    patch: WordPatch(vocabularyType: .some(next)),
                    broadcastChanges: false,
                    projectId: project.id,
                    using: appState
                )
            }
        } label: {
            switch word.vocabularyType {
            case .active:
                Text("A")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(MerkenTheme.accentBlue, in: Circle())
            case .passive:
                Text("P")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(MerkenTheme.secondaryText.opacity(0.5), in: Circle())
            case .none:
                EmptyView()
            }
        }
        .buttonStyle(.plain)
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

    /// 3マスのチェックボックス（縦並び）。学習状態に応じて自動で塗りつぶし。
    private func notionCheckBoxes(for status: WordStatus) -> some View {
        let filledCount: Int = {
            switch status {
            case .new:      return 0
            case .review:   return 1
            case .mastered: return 3
            }
        }()
        let boxSize: CGFloat = 13

        return VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { i in
                Rectangle()
                    .fill(i < filledCount ? Color.primary : Color.clear)
                    .frame(width: boxSize, height: boxSize)
                    .overlay(
                        Group {
                            if i < 2 {
                                Rectangle()
                                    .fill(MerkenTheme.border)
                                    .frame(height: 1)
                            }
                        },
                        alignment: .bottom
                    )
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 3)
                .stroke(MerkenTheme.border, lineWidth: 1)
        )
        .clipShape(.rect(cornerRadius: 3))
    }

    // MARK: - Top Buttons Overlay

    private var topButtonsOverlay: some View {
        ZStack {
            headerTitleBadge
                .padding(.horizontal, 108)

            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1))
                }

                Spacer()

                Button {
                    Task { await handleShare() }
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)

                Menu {
                    Button {
                        showingScanModeSheet = true
                    } label: {
                        Label("スキャンで追加", systemImage: "camera")
                    }
                    .disabled(!appState.isLoggedIn)

                    Button {
                        renameProjectTitle = displayProjectTitle
                        showingRenameProject = true
                    } label: {
                        Label("名前を変更", systemImage: "pencil")
                    }

                    Button {
                        editorMode = .create
                    } label: {
                        Label("手動追加", systemImage: "plus")
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
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1))
                }
                .accessibilityIdentifier("moreMenuButton")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private var headerTitleBadge: some View {
        VStack(spacing: 1) {
            Text(displayProjectTitle)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity)

            Text("\(viewModel.words.count)語")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.82))
                .monospacedDigit()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.18), radius: 10, x: 0, y: 4)
        .allowsHitTesting(false)
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

    // MARK: - Project Thumbnail Header

    private var projectThumbnailHeader: some View {
        ZStack(alignment: .bottomLeading) {
            if let iconImage = resolvedProject.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                let bgColor = MerkenTheme.placeholderColor(for: resolvedProject.id, isDark: colorScheme == .dark)
                bgColor
                Text(String(displayProjectTitle.prefix(1)))
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }

            LinearGradient(
                colors: [
                    .clear,
                    Color.black.opacity(0.14),
                    Color.black.opacity(0.52)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            thumbnailMetadataOverlay
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .contentShape(Rectangle())
        .clipped()
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
        triggerChartAnimation()
    }

    private var thumbnailMetadataOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 14) {
                if !displaySourceLabels.isEmpty {
                    ProjectSourceLabelsSection(
                        labels: displaySourceLabels,
                        maxRows: 1,
                        appearance: .thumbnail
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Spacer(minLength: 0)
                }

                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(viewModel.words.count)")
                        .font(.system(size: 22, weight: .bold))
                        .monospacedDigit()
                    Text("語")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.22), in: Capsule())
                .overlay(
                    Capsule()
                        .stroke(Color.white.opacity(0.16), lineWidth: 1)
                )
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 30)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
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
