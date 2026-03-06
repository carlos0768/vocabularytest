import SwiftUI
import AVFoundation

private struct SharePayload: Identifiable {
    let id = UUID()
    let items: [Any]
}

struct ProjectDetailView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = ProjectDetailViewModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var showingQuiz: String?
    @State private var flashcardDestination: Project?
    @State private var quiz2Destination: Project?
    @State private var quickResponseDestination: Project?
    @State private var showingScan = false
    @State private var showTinderSort = false
    @State private var showTimeAttack = false
    @State private var showMatchGame = false
    @State private var previewIndex = 0
    @State private var showingWordList = false
    @State private var dictionaryURL: URL?
    @State private var sharePayload: SharePayload?
    @State private var showingDeleteConfirm = false
    @State private var showingBookshelfPicker = false
    @State private var showingCreateBookshelf = false
    @State private var weakWordsFlashcard: Project?
    @State private var topWidgetPage = 0

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage = viewModel.errorMessage {
                        SolidCard {
                            Text(errorMessage)
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    // Swipeable top widget: Stats ↔ Word Card
                    if !viewModel.words.isEmpty {
                        topSwipeableWidget
                    }

                    // Learning modes
                    learningModesSection

}
                .padding(16)
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(projectId: project.id, using: appState)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button {
                    showingWordList = true
                } label: {
                    HStack(spacing: 4) {
                        Text(project.title)
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        showingScan = true
                    } label: {
                        Image(systemName: "camera")
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                    .disabled(!appState.isLoggedIn)
                    .accessibilityIdentifier("scanToProjectButton")

                    Menu {
                        Button {
                            editorMode = .create
                        } label: {
                            Label("手動追加", systemImage: "plus")
                        }
                        Button {
                            showingBookshelfPicker = true
                        } label: {
                            Label("本棚に追加", systemImage: "books.vertical")
                        }
                        Button {
                            showingCreateBookshelf = true
                        } label: {
                            Label("新しい本棚を作成", systemImage: "plus.rectangle.on.folder")
                        }
                        Button {
                            Task { await handleShare() }
                        } label: {
                            Label("共有", systemImage: "square.and.arrow.up")
                        }

                        Divider()

                        Button(role: .destructive) {
                            showingDeleteConfirm = true
                        } label: {
                            Label("単語帳を削除", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                    .accessibilityIdentifier("moreMenuButton")
                }
            }
        }
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
        .sheet(isPresented: $showingWordList) {
            NavigationStack {
                WordListView(project: project)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationContentInteraction(.scrolls)
        }
        .navigationDestination(item: $showingQuiz) { _ in
            QuizView(project: project, preloadedWords: viewModel.words)
        }
        .fullScreenCover(item: $flashcardDestination) { project in
            NavigationStack {
                FlashcardView(project: project, preloadedWords: viewModel.words)
            }
        }
        .fullScreenCover(item: $weakWordsFlashcard) { project in
            NavigationStack {
                FlashcardView(project: project, preloadedWords: weakWords)
            }
        }
        .navigationDestination(item: $quiz2Destination) { project in
            Quiz2View(project: project, preloadedWords: viewModel.words)
        }
        .navigationDestination(item: $quickResponseDestination) { project in
            QuickResponseView(project: project, preloadedWords: viewModel.words)
        }
        .navigationDestination(isPresented: $showTinderSort) {
            TinderSortView(project: project, words: viewModel.words)
        }
        .navigationDestination(isPresented: $showTimeAttack) {
            TimeAttackView(project: project, words: viewModel.words)
        }
        .navigationDestination(isPresented: $showMatchGame) {
            MatchGameView(project: project, words: viewModel.words)
        }
        .sheet(item: $sharePayload) { payload in
            ShareSheet(items: payload.items)
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
        .sheet(isPresented: $showingBookshelfPicker) {
            AddToBookshelfSheet(projectId: project.id)
                .environmentObject(appState)
        }
        .sheet(isPresented: $showingCreateBookshelf) {
            CreateBookshelfSheet(onComplete: {})
                .environmentObject(appState)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(projectId: project.id, using: appState)
        }
        .onChange(of: viewModel.words.count) { _ in
            if viewModel.words.isEmpty {
                previewIndex = 0
                return
            }

            if previewIndex >= viewModel.words.count {
                previewIndex = viewModel.words.count - 1
            }
        }
    }

    private func handleShare() async {
        guard case .proCloud = appState.repositoryMode else {
            // Guest users: text share with sample words (no link)
            let sampleWords = viewModel.words.prefix(3).map { $0.english }
            let wordsPart = sampleWords.joined(separator: "、")
            let totalCount = viewModel.words.count
            let text: String
            if wordsPart.isEmpty {
                text = "Merkenで単語を暗記中！"
            } else {
                text = "Merkenで\(wordsPart)など\(totalCount)語を暗記しました！\nhttps://www.merken.jp"
            }
            presentShareSheet(items: [text])
            return
        }

        do {
            var shareId = project.shareId
            if shareId == nil || shareId?.isEmpty == true {
                shareId = try await appState.generateProjectShareId(projectId: project.id)
            }
            guard let shareId else { return }

            guard let shareURL = URL(string: "https://www.merken.jp/share/\(shareId)") else { return }

            // Build share text with sample words
            let sampleWords = viewModel.words.prefix(3).map { $0.english }
            let wordsPart: String
            if sampleWords.count >= 2 {
                wordsPart = sampleWords.dropLast().joined(separator: "、") + "、" + sampleWords.last!
            } else if let first = sampleWords.first {
                wordsPart = first
            } else {
                wordsPart = ""
            }
            let totalCount = viewModel.words.count
            let shareText: String
            if wordsPart.isEmpty {
                shareText = "Merkenで単語を暗記中！\n\(shareURL.absoluteString)"
            } else {
                shareText = "Merkenで\(wordsPart)など\(totalCount)語を暗記しました！\n\(shareURL.absoluteString)"
            }
            presentShareSheet(items: [shareText])
        } catch {
            // Fallback to text share on error
            let sampleWords = viewModel.words.prefix(3).map { $0.english }
            let wordsPart = sampleWords.joined(separator: "、")
            let totalCount = viewModel.words.count
            let text: String
            if wordsPart.isEmpty {
                text = "Merkenで単語を暗記中！"
            } else {
                text = "Merkenで\(wordsPart)など\(totalCount)語を暗記しました！\nhttps://www.merken.jp"
            }
            presentShareSheet(items: [text])
        }
    }

    @MainActor
    private func presentShareSheet(items: [Any]) {
        sharePayload = SharePayload(items: items)
    }

    // MARK: - Top Swipeable Widget (Stats ↔ Word Card)

    private var topSwipeableWidget: some View {
        VStack(spacing: 0) {
            TabView(selection: $topWidgetPage) {
                statsPage.tag(0)
                flashcardPreview.tag(1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: UIScreen.main.bounds.height * 0.4)

            // Custom page indicator
            HStack(spacing: 6) {
                ForEach(0..<2, id: \.self) { i in
                    Circle()
                        .fill(i == topWidgetPage ? MerkenTheme.accentBlue : MerkenTheme.border)
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Stats Page

    private var statsPage: some View {
        let total = viewModel.words.count
        let masteredCount = viewModel.words.filter { $0.status == .mastered }.count
        let reviewCount = viewModel.words.filter { $0.status == .review }.count
        let newCount = viewModel.words.filter { $0.status == .new }.count
        let masteredPct = total > 0 ? Double(masteredCount) / Double(total) : 0

        return SolidCard {
            VStack(spacing: 16) {
                // Circular progress
                ZStack {
                    Circle()
                        .stroke(MerkenTheme.border, lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: masteredPct)
                        .stroke(MerkenTheme.success, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeOut(duration: 0.5), value: masteredPct)
                    VStack(spacing: 2) {
                        Text("\(Int(masteredPct * 100))%")
                            .font(.title.bold())
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("習得率")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
                .frame(width: 100, height: 100)

                // Status counts
                HStack(spacing: 0) {
                    statItem(count: masteredCount, label: "習得", color: MerkenTheme.success)
                    Divider().frame(height: 36)
                    statItem(count: reviewCount, label: "学習中", color: MerkenTheme.warning)
                    Divider().frame(height: 36)
                    statItem(count: newCount, label: "未学習", color: MerkenTheme.mutedText)
                }

                Text("\(total)語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.vertical, 8)
        }
        .padding(.horizontal, 4)
    }

    private func statItem(count: Int, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.title2.bold())
                .foregroundStyle(color)
            Text(label)
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Flashcard Preview (full-width with fullscreen button)

    private var safePreviewIndex: Int {
        guard !viewModel.words.isEmpty else { return 0 }
        return min(previewIndex, viewModel.words.count - 1)
    }

    private var flashcardPreview: some View {
        let word = viewModel.words[safePreviewIndex]

        return VStack(spacing: 14) {
            // Card (full-width, with fullscreen button overlay)
            ZStack(alignment: .bottomTrailing) {
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
                                    Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                                        .font(.subheadline)
                                        .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.secondaryText)
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
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)

                        // Japanese translation
                        Text(word.japanese)
                            .font(.title3)
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                }

                // Fullscreen button overlay
                Button {
                    flashcardDestination = project
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 36, height: 36)
                        .background(.ultraThinMaterial, in: .circle)
                }
                .padding(12)
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

    // MARK: - Weak Words (苦手な単語)

    private var weakWords: [Word] {
        viewModel.words.filter { word in
            word.status == .review || word.easeFactor < 2.5
        }
    }


    // MARK: - Learning Modes (2-column grid)

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)

            let columns = [
                GridItem(.flexible(), spacing: 10),
                GridItem(.flexible(), spacing: 10)
            ]
            LazyVGrid(columns: columns, spacing: 10) {
                learningModeCard(
                    icon: "scope",
                    iconColor: MerkenTheme.success,
                    title: "クイズ2",
                    subtitle: "思い出して評価"
                ) {
                    quiz2Destination = project
                }

                learningModeCard(
                    icon: "timer",
                    iconColor: .orange,
                    title: "タイムアタック",
                    subtitle: "時間内に即答"
                ) {
                    showTimeAttack = true
                }

                learningModeCard(
                    icon: "exclamationmark.triangle",
                    iconColor: MerkenTheme.danger,
                    title: "苦手な単語",
                    subtitle: weakWords.isEmpty ? "苦手な単語なし" : "\(weakWords.count)語を復習"
                ) {
                    if !weakWords.isEmpty {
                        weakWordsFlashcard = project
                    }
                }

                if viewModel.words.count >= 4 {
                    learningModeCard(
                        icon: "square.grid.2x2",
                        iconColor: .purple,
                        title: "マッチ",
                        subtitle: "ペアを見つけろ"
                    ) {
                        showMatchGame = true
                    }
                }
            }
        }
    }

    private func learningModeCard(icon: String, iconColor: Color, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                IconBadge(systemName: icon, color: iconColor, size: 56)

                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(20)
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
