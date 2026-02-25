import SwiftUI
import AVFoundation

struct ProjectDetailView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectDetailViewModel()
    @Environment(\.dismiss) private var dismiss

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var showingQuiz: String?
    @State private var flashcardDestination: Project?
    @State private var quiz2Destination: Project?
    @State private var sentenceQuizDestination: Project?
    @State private var showingScan = false
    @State private var previewIndex = 0
    @State private var showingWordList = false
    @State private var dictionaryURL: URL?
    @State private var showingShareSheet = false
    @State private var shareItems: [Any] = []
    @State private var showingDeleteConfirm = false

    private var hasIconImage: Bool {
        if let iconImage = project.iconImage,
           ImageCompressor.decodeBase64Image(iconImage) != nil {
            return true
        }
        return false
    }

    var body: some View {
        ZStack {
            // Use plain background when header has image (prevents dots showing behind cover)
            if hasIconImage {
                MerkenTheme.background.ignoresSafeArea()
            } else {
                AppBackground()
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Notion-style cover header (scrolls with content)
                    headerSection

                    // Content below header — wrap in AppBackground so dots show here
                    ZStack(alignment: .top) {
                        if hasIconImage {
                            AppBackground()
                        }

                        VStack(alignment: .leading, spacing: 16) {
                            if let errorMessage = viewModel.errorMessage {
                                SolidCard {
                                    Text(errorMessage)
                                        .foregroundStyle(MerkenTheme.warning)
                                }
                            }

                            // Flashcard preview with navigation
                            if !viewModel.words.isEmpty {
                                flashcardPreview
                            }

                            // Learning modes
                            learningModesSection

                            // Word list
                            wordListSection
                        }
                        .padding(16)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollEdgeEffectStyle(.none, for: .top)
            .contentMargins(.top, 0, for: .scrollContent)
            .refreshable {
                await viewModel.load(projectId: project.id, using: appState)
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .background(TransparentNavBarSetter())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        showingScan = true
                    } label: {
                        Image(systemName: "camera")
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.4), radius: 2, x: 0, y: 1)
                    }
                    .disabled(!appState.isLoggedIn)
                    .accessibilityIdentifier("scanToProjectButton")

                    Button {
                        editorMode = .create
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.4), radius: 2, x: 0, y: 1)
                    }
                    .accessibilityIdentifier("addWordButton")
                }
            }
        }
        .tint(.white)
        .sheet(isPresented: $showingScan) {
            ScanCoordinatorView(
                targetProjectId: project.id,
                targetProjectTitle: project.title
            ) { _ in
                Task {
                    await viewModel.load(projectId: project.id, using: appState)
                }
            }
            .environmentObject(appState)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editorMode, content: editorSheet)
        .sheet(item: $dictionaryURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
        }
        .navigationDestination(isPresented: $showingWordList) {
            WordListView(project: project)
        }
        .navigationDestination(item: $showingQuiz) { _ in
            QuizView(project: project, preloadedWords: viewModel.words)
        }
        .navigationDestination(item: $flashcardDestination) { project in
            FlashcardView(project: project)
        }
        .navigationDestination(item: $quiz2Destination) { project in
            Quiz2View(project: project, preloadedWords: viewModel.words)
        }
        .navigationDestination(item: $sentenceQuizDestination) { project in
            SentenceQuizView(project: project)
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(items: shareItems)
        }
        .alert("この単語帳を削除しますか？", isPresented: $showingDeleteConfirm) {
            Button("削除", role: .destructive) {
                Task {
                    await viewModel.deleteProject(id: project.id, using: appState)
                    dismiss()
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("「\(project.title)」と含まれる単語がすべて削除されます。この操作は取り消せません。")
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(projectId: project.id, using: appState)
        }
    }

    private func handleShare() async {
        guard case .proCloud = appState.repositoryMode else {
            // Guest users: text share via share sheet
            let lines = viewModel.words.map { "\($0.english) — \($0.japanese)" }
            let text = "【\(project.title)】\n" + lines.joined(separator: "\n")
            shareItems = [text]
            showingShareSheet = true
            return
        }

        do {
            var shareId = project.shareId
            if shareId == nil || shareId?.isEmpty == true {
                guard let cloudRepo = appState.activeRepository as? CloudWordRepository else { return }
                shareId = try await cloudRepo.generateShareId(projectId: project.id)
            }
            guard let shareId else { return }

            let shareUrl = "https://www.merken.jp/share/\(shareId)"
            shareItems = [shareUrl]
            showingShareSheet = true
        } catch {
            // Fallback to text share on error
            let lines = viewModel.words.map { "\($0.english) — \($0.japanese)" }
            let text = "【\(project.title)】\n" + lines.joined(separator: "\n")
            shareItems = [text]
            showingShareSheet = true
        }
    }

    // MARK: - Header (Notion-style cover, extends behind nav bar)

    /// Extra height added above the visible header to cover safe area + nav bar + overscroll
    private let headerTopExtension: CGFloat = 300

    private var headerSection: some View {
        ZStack(alignment: .bottomLeading) {
            // Cover image (or placeholder) — extended upward to cover safe area
            if let iconImage = project.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                // Twitter-style center-crop: show the middle of the image
                GeometryReader { geo in
                    let imageSize = uiImage.size
                    let containerWidth = geo.size.width
                    let containerHeight = geo.size.height
                    let scale = max(containerWidth / imageSize.width, containerHeight / imageSize.height)
                    let scaledWidth = imageSize.width * scale
                    let scaledHeight = imageSize.height * scale
                    let offsetX = (containerWidth - scaledWidth) / 2
                    let offsetY = (containerHeight - scaledHeight) / 2

                    Image(uiImage: uiImage)
                        .resizable()
                        .frame(width: scaledWidth, height: scaledHeight)
                        .offset(x: offsetX, y: offsetY)
                }
                .frame(height: 184 + headerTopExtension)
                .clipped()
            } else {
                MerkenTheme.placeholderColor(for: project.id)
                    .frame(height: 184 + headerTopExtension)
            }

            // Content overlay — title + actions pinned to bottom
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(project.title)
                            .font(.title3.bold())
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .layoutPriority(-1)
                            .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)

                    }

                    let masteredCount = viewModel.words.filter { $0.status == .mastered }.count
                    Text("\(viewModel.words.count)語 / 習得 \(masteredCount)語")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.85))
                        .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)
                }

                Spacer(minLength: 0)

                HStack(spacing: 10) {
                    Button {
                        Task { await handleShare() }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(.white.opacity(0.2), in: .circle)
                    }
                    Button {
                        showingDeleteConfirm = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(.white.opacity(0.2), in: .circle)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .frame(height: 184 + headerTopExtension)
        .padding(.top, -headerTopExtension)
    }

    // MARK: - Flashcard Preview (with navigation, matching Web)

    private var safePreviewIndex: Int {
        guard !viewModel.words.isEmpty else { return 0 }
        return min(previewIndex, viewModel.words.count - 1)
    }

    private var flashcardPreview: some View {
        let word = viewModel.words[safePreviewIndex]

        return VStack(spacing: 14) {
            // Card
            SolidCard {
                VStack(spacing: 12) {
                    // Top bar: progress + actions
                    HStack {
                        Text("\(safePreviewIndex + 1)/\(viewModel.words.count)")
                            .font(.caption.bold())
                            .foregroundStyle(MerkenTheme.mutedText)
                        Spacer()
                        HStack(spacing: 4) {
                            Button {
                                speakWord(word.english)
                            } label: {
                                Image(systemName: "speaker.wave.2")
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                    .frame(width: 32, height: 32)
                            }
                            Button {
                                Task {
                                    await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                                }
                            } label: {
                                Image(systemName: word.isFavorite ? "flag.fill" : "flag")
                                    .font(.subheadline)
                                    .foregroundStyle(word.isFavorite ? MerkenTheme.accentBlue : MerkenTheme.secondaryText)
                                    .frame(width: 32, height: 32)
                            }
                        }
                    }

                    // English word
                    VStack(spacing: 4) {
                        Text(word.english)
                            .font(.title.bold())
                            .foregroundStyle(MerkenTheme.primaryText)
                            .multilineTextAlignment(.center)
                        if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                            Text(pronunciation)
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)

                    // Japanese translation
                    Text(word.japanese)
                        .font(.title3)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)

                    // Example sentence removed per Carlos
                }
            }

            // Navigation: prev / dictionary / next
            HStack(spacing: 12) {
                Button {
                    withAnimation(.easeOut(duration: 0.2)) {
                        previewIndex = safePreviewIndex > 0
                            ? safePreviewIndex - 1
                            : viewModel.words.count - 1
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.5))
                }

                Button {
                    let encoded = word.english.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word.english
                    if let url = URL(string: "https://eow.alc.co.jp/search?q=\(encoded)") {
                        dictionaryURL = url
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "book")
                            .font(.subheadline)
                        Text("辞書")
                            .font(.subheadline.bold())
                    }
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.horizontal, 20)
                    .frame(height: 44)
                    .background(MerkenTheme.surface, in: .capsule)
                    .overlay(Capsule().stroke(MerkenTheme.border, lineWidth: 1.5))
                }

                Button {
                    withAnimation(.easeOut(duration: 0.2)) {
                        previewIndex = safePreviewIndex < viewModel.words.count - 1
                            ? safePreviewIndex + 1
                            : 0
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.5))
                }
            }
        }
    }

    private func speakWord(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.45
        AVSpeechSynthesizer().speak(utterance)
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
                    quiz2Destination = project
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
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
        }
    }

    // MARK: - Word List (compact summary → navigates to full list)

    private var wordListSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                showingWordList = true
            } label: {
                SolidCard {
                    HStack {
                        IconBadge(systemName: "list.bullet", color: MerkenTheme.accentBlue, size: 32)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("単語一覧")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.primaryText)
                            let masteredCount = viewModel.words.filter { $0.status == .mastered }.count
                            let reviewCount = viewModel.words.filter { $0.status == .review }.count
                            Text("\(viewModel.words.count)語 / 習得 \(masteredCount)語 / 復習 \(reviewCount)語")
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
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
