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

    @State private var learningModeCounts: [LearningModeUsageStore.Mode: Int] = [:]
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

    init(project: Project) {
        self.project = project
        _displayProjectTitle = State(initialValue: project.title)
        _displaySourceLabels = State(initialValue: project.sourceLabels)
    }

    private var learningModeScope: LearningModeUsageStore.Scope {
        .project(project.id)
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
                .sheet(isPresented: $showingProjectShareSheet, content: projectShareSheet)
        )

        return AnyView(
            presented
                .alert("この単語帳を削除しますか？", isPresented: $showingDeleteConfirm, actions: deleteAlertActions, message: deleteAlertMessage)
                .alert("単語帳名を変更", isPresented: $showingRenameProject, actions: renameAlertActions, message: renameAlertMessage)
                .photosPicker(isPresented: $showingProjectThumbnailPicker, selection: $selectedProjectThumbnailItem, matching: .images)
                .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
                    await viewModel.load(projectId: project.id, using: appState)
                    learningModeCounts = LearningModeUsageStore.counts(for: learningModeScope)
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
                shareURL: preparedProjectShareURL
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

            // Learning modes: フラッシュカード / 自己評価 / マッチ
            learningModesSection
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
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(MerkenTheme.border)
                .offset(y: 3)
        )
    }

    private func animatedChartProgress(_ progress: CGFloat) -> CGFloat {
        progress * chartAnimationProgress
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            // Circular flashcard icon button
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

            // "＋ 問題追加" pill button
            Button {
                showingScanModeSheet = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .bold))
                    Text("問題追加")
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

            // "▶ テスト" pill button
            Button {
                quizDestination = project
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 13, weight: .bold))
                    Text("テスト")
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

    // MARK: - Learning Modes Section

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            VStack(spacing: 10) {
                learningModeCard(
                    icon: "scope",
                    iconColor: MerkenTheme.success,
                    title: "自己評価",
                    subtitle: "思い出して評価",
                    count: learningModeCounts[.selfReview] ?? 0
                ) {
                    learningModeCounts[.selfReview] = LearningModeUsageStore.increment(.selfReview, for: learningModeScope)
                    quiz2Destination = project
                }

                if viewModel.words.count >= 4 {
                    learningModeCard(
                        icon: "square.grid.2x2",
                        iconColor: .purple,
                        title: "マッチ",
                        subtitle: "ペアを見つけろ",
                        count: learningModeCounts[.match] ?? 0
                    ) {
                        learningModeCounts[.match] = LearningModeUsageStore.increment(.match, for: learningModeScope)
                        showMatchGame = true
                    }
                }

                learningModeCard(
                    icon: "checklist",
                    iconColor: MerkenTheme.accentBlue,
                    title: "クイズ",
                    subtitle: "4択で実力テスト",
                    count: learningModeCounts[.quiz] ?? 0
                ) {
                    learningModeCounts[.quiz] = LearningModeUsageStore.increment(.quiz, for: learningModeScope)
                    quizDestination = project
                }
            }
        }
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
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.black.opacity(0.35), in: .circle)
                }

                Spacer()

                Button {
                    Task { await handleShare() }
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.black.opacity(0.35), in: .circle)
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
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.black.opacity(0.35), in: .circle)
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
        do {
            if case .proCloud = appState.repositoryMode {
                var shareId = resolvedProject.shareId
                if shareId == nil || shareId?.isEmpty == true {
                    shareId = try await appState.generateProjectShareId(projectId: project.id)
                }
                if let shareId,
                   let shareURL = URL(string: "https://www.merken.jp/share/\(shareId)") {
                    preparedProjectShareURL = shareURL
                }
            } else {
                preparedProjectShareURL = URL(string: "https://www.merken.jp")
            }
        } catch {
            preparedProjectShareURL = URL(string: "https://www.merken.jp")
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

    // MARK: - Card Helpers

    private func learningModeCard(icon: String, iconColor: Color, title: String, subtitle: String, count: Int, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                IconBadge(systemName: icon, color: iconColor, size: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Spacer()

                HStack(spacing: 10) {
                    Text("\(count)回")
                        .font(.system(size: 13, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(MerkenTheme.accentBlue.opacity(0.10), in: Capsule())
                        .fixedSize(horizontal: true, vertical: false)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(width: 14)
                }
                .fixedSize(horizontal: true, vertical: false)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(MerkenTheme.border, lineWidth: 1.5)
            )
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
        }
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
