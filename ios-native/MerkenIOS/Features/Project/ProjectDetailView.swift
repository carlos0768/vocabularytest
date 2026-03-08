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
    @State private var showFullScreenWord = false
    @State private var statsPage = 0
    @State private var filteredWordListStatus: WordStatus?
    @State private var showingFilteredWordList = false

    private var thumbnailBackgroundColor: Color {
        if project.iconImage != nil {
            return Color(red: 0.15, green: 0.15, blue: 0.18)
        }
        return MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                thumbnailBackgroundColor
                MerkenTheme.background
            }
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    // Edge-to-edge thumbnail
                    projectThumbnailHeader

                    // Body card overlapping the thumbnail
                    VStack(alignment: .leading, spacing: 16) {
                        // Project title + word count
                        HStack(alignment: .firstTextBaseline) {
                            Text(project.title)
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .lineLimit(2)
                            Spacer()
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text("\(viewModel.words.count)")
                                    .font(.system(size: 22, weight: .bold))
                                    .monospacedDigit()
                                    .foregroundStyle(MerkenTheme.primaryText)
                                Text("語")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                        .padding(.bottom, 24)

                        if let errorMessage = viewModel.errorMessage {
                            SolidCard {
                                Text(errorMessage)
                                    .foregroundStyle(MerkenTheme.warning)
                            }
                        }

                        // Word stats + Part of speech widgets
                        projectStatsSection

                        // Learning modes
                        learningModesSection
                    }
                    .padding(20)
                    .padding(.bottom, 80) // space for bottom bar
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
            }
            .scrollIndicators(.hidden)
            .ignoresSafeArea(.container, edges: .top)
            .refreshable {
                await viewModel.load(projectId: project.id, using: appState)
            }

            // Fixed bottom bar with two action buttons
            bottomActionBar
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .top) {
            topButtonsOverlay
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
        .fullScreenCover(isPresented: $showingWordList) {
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
        .fullScreenCover(isPresented: $showingFilteredWordList) {
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
        .fullScreenCover(isPresented: $showFullScreenWord) {
            fullScreenWordView
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
        .onAppear { appState.tabBarVisible = false }
        .onDisappear {
            // Only restore tab bar when actually leaving the project detail flow
            // (not when pushing to quiz/flashcard sub-screens)
            if flashcardDestination == nil &&
               quiz2Destination == nil &&
               quickResponseDestination == nil &&
               !showTinderSort &&
               !showTimeAttack &&
               !showMatchGame &&
               !showFullScreenWord &&
               !showingWordList &&
               !showingFilteredWordList {
                appState.tabBarVisible = true
            }
        }
    }

    // MARK: - Top Buttons Overlay

    private var topButtonsOverlay: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.35), in: .circle)
            }

            Spacer()

            Menu {
                Button {
                    showingScan = true
                } label: {
                    Label("スキャンで追加", systemImage: "camera")
                }
                .disabled(!appState.isLoggedIn)

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
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.35), in: .circle)
            }
            .accessibilityIdentifier("moreMenuButton")
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
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

    // MARK: - Loose-leaf Word Card

    private var looseLeafWordCard: some View {
        let safeIdx = min(previewIndex, max(viewModel.words.count - 1, 0))
        let word = viewModel.words[safeIdx]

        return VStack(spacing: 8) {
            // Counter
            HStack {
                Spacer()
                Text("\(safeIdx + 1) / \(viewModel.words.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            // Loose-leaf card
            VStack(alignment: .leading, spacing: 0) {
                // Red margin line
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(Color.clear)
                        .frame(width: 40)
                    Rectangle()
                        .fill(Color.red.opacity(0.2))
                        .frame(width: 1)
                    Spacer()
                }
                .frame(height: 0)

                VStack(alignment: .leading, spacing: 16) {
                    // Word + audio
                    HStack(alignment: .firstTextBaseline) {
                        Text(word.english)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Spacer()
                        HStack(spacing: 12) {
                            Button { speakWord(word.english) } label: {
                                Image(systemName: "speaker.wave.2")
                                    .font(.system(size: 16))
                                    .foregroundStyle(MerkenTheme.accentBlue)
                            }
                            Button {
                                Task { await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState) }
                            } label: {
                                Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                                    .font(.system(size: 16))
                                    .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.mutedText)
                            }
                        }
                    }

                    // Japanese
                    Text(word.japanese)
                        .font(.system(size: 18))
                        .foregroundStyle(MerkenTheme.secondaryText)

                    // Divider line (notebook ruled line style)
                    Rectangle()
                        .fill(MerkenTheme.border.opacity(0.3))
                        .frame(height: 1)

                    // Example sentence
                    if let example = word.exampleSentence, !example.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(example)
                                .font(.system(size: 15))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .italic()
                            if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                                Text(exampleJa)
                                    .font(.system(size: 14))
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                        }
                    } else {
                        Text("例文なし")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }

                    // Status badge
                    HStack(spacing: 8) {
                        statusBadge(word.status)
                        if word.isFavorite {
                            Text("苦手")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(MerkenTheme.danger)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(MerkenTheme.danger.opacity(0.1), in: .capsule)
                        }
                    }
                }
                .padding(20)
            }
            // Notebook styling: ruled lines background
            .background {
                VStack(spacing: 0) {
                    ForEach(0..<12, id: \.self) { _ in
                        Rectangle()
                            .fill(Color.clear)
                            .frame(height: 27)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(MerkenTheme.accentBlue.opacity(0.06))
                                    .frame(height: 1)
                            }
                    }
                }
            }
            .clipShape(.rect(cornerRadius: 16))
            .background(Color.white, in: .rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(MerkenTheme.border, lineWidth: 1)
            )
            // Expand button
            .overlay(alignment: .bottomTrailing) {
                Button { showFullScreenWord = true } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 32, height: 32)
                        .background(.ultraThinMaterial, in: .circle)
                }
                .padding(12)
            }
            // Paper shadow
            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
            // Swipe gesture
            .gesture(
                DragGesture(minimumDistance: 30, coordinateSpace: .local)
                    .onEnded { value in
                        if value.translation.width < -30 {
                            withAnimation(.easeOut(duration: 0.2)) {
                                previewIndex = safeIdx < viewModel.words.count - 1 ? safeIdx + 1 : 0
                            }
                        } else if value.translation.width > 30 {
                            withAnimation(.easeOut(duration: 0.2)) {
                                previewIndex = safeIdx > 0 ? safeIdx - 1 : viewModel.words.count - 1
                            }
                        }
                    }
            )
        }
    }

    // MARK: - Full Screen Word View

    private var fullScreenWordView: some View {
        let safeIdx = min(previewIndex, max(viewModel.words.count - 1, 0))
        let word = viewModel.words[safeIdx]

        return ZStack {
            // Loose-leaf ruled lines background
            Color.white.ignoresSafeArea()
            VStack(spacing: 0) {
                ForEach(0..<30, id: \.self) { _ in
                    Rectangle()
                        .fill(Color.clear)
                        .frame(height: 28)
                        .overlay(alignment: .bottom) {
                            Rectangle()
                                .fill(MerkenTheme.accentBlue.opacity(0.06))
                                .frame(height: 1)
                        }
                }
            }
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar
                HStack {
                    Button { showFullScreenWord = false } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .frame(width: 36, height: 36)
                            .background(MerkenTheme.surfaceAlt, in: .circle)
                    }
                    Spacer()
                    Text("\(safeIdx + 1) / \(viewModel.words.count)")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                    Spacer()
                    HStack(spacing: 16) {
                        Button { speakWord(word.english) } label: {
                            Image(systemName: "speaker.wave.2")
                                .font(.system(size: 18))
                                .foregroundStyle(MerkenTheme.accentBlue)
                        }
                        Button {
                            Task { await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState) }
                        } label: {
                            Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                                .font(.system(size: 18))
                                .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.mutedText)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 8)

                // Word content centered
                Spacer(minLength: 0)

                VStack(spacing: 16) {
                    Text(word.english)
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)

                    Text(word.japanese)
                        .font(.system(size: 24))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)

                    if let example = word.exampleSentence, !example.isEmpty {
                        VStack(spacing: 8) {
                            Text(example)
                                .font(.system(size: 18))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .italic()
                                .multilineTextAlignment(.center)
                            if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                                Text(exampleJa)
                                    .font(.system(size: 16))
                                    .foregroundStyle(MerkenTheme.mutedText)
                                    .multilineTextAlignment(.center)
                            }
                        }
                        .padding(.top, 8)
                    }

                    statusBadge(word.status)
                }
                .padding(.horizontal, 32)
                .frame(maxWidth: .infinity)

                Spacer(minLength: 0)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 30, coordinateSpace: .local)
                .onEnded { value in
                    if value.translation.width < -30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            previewIndex = safeIdx < viewModel.words.count - 1 ? safeIdx + 1 : 0
                        }
                    } else if value.translation.width > 30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            previewIndex = safeIdx > 0 ? safeIdx - 1 : viewModel.words.count - 1
                        }
                    }
                }
        )
    }
    private func statusBadge(_ status: WordStatus) -> some View {
        let (text, color): (String, Color) = {
            switch status {
            case .mastered: return ("習得", MerkenTheme.success)
            case .review: return ("学習中", MerkenTheme.accentBlue)
            case .new: return ("未学習", MerkenTheme.mutedText)
            }
        }()
        return Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.1), in: .capsule)
    }

    private var safePreviewIndex: Int {
        guard !viewModel.words.isEmpty else { return 0 }
        return min(previewIndex, viewModel.words.count - 1)
    }

    // Kept for fullscreen cover reference
    private var flashcardPreview_unused: some View {
        let word = viewModel.words[safePreviewIndex]

        return ZStack(alignment: .bottomTrailing) {
            SolidCard {
                VStack(spacing: 16) {
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

                    Spacer()

                    // English word
                    Text(word.english)
                        .font(.largeTitle.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)

                    // Japanese translation
                    Text(word.japanese)
                        .font(.title2)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)

                    Spacer()
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
        .padding(.horizontal, 4)
        .gesture(
            DragGesture(minimumDistance: 30, coordinateSpace: .local)
                .onEnded { value in
                    if value.translation.width < -30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            previewIndex = safePreviewIndex < viewModel.words.count - 1
                                ? safePreviewIndex + 1 : 0
                        }
                    } else if value.translation.width > 30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            previewIndex = safePreviewIndex > 0
                                ? safePreviewIndex - 1 : viewModel.words.count - 1
                        }
                    }
                }
        )
    }

    private func speakWord(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.45
        AVSpeechSynthesizer().speak(utterance)
    }

    // MARK: - Word Detail Widget

    @State private var wordDetailIndex = 0

    private var wordDetailWidget: some View {
        let safeIdx = min(wordDetailIndex, max(viewModel.words.count - 1, 0))
        let word = viewModel.words[safeIdx]

        return VStack(alignment: .leading, spacing: 14) {
            // Word + pronunciation
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(word.english)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                    Button {
                        speakWord(word.english)
                    } label: {
                        Image(systemName: "speaker.wave.2")
                            .font(.system(size: 16))
                            .foregroundStyle(MerkenTheme.accentBlue)
                    }
                }
                Text(word.japanese)
                    .font(.system(size: 16))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            // Example sentence
            if let example = word.exampleSentence, !example.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(example)
                        .font(.system(size: 15))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .italic()
                    if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                        Text(exampleJa)
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 12))
            }
        }
        .padding(20)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .gesture(
            DragGesture(minimumDistance: 30, coordinateSpace: .local)
                .onEnded { value in
                    if value.translation.width < -30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            wordDetailIndex = safeIdx < viewModel.words.count - 1 ? safeIdx + 1 : 0
                        }
                    } else if value.translation.width > 30 {
                        withAnimation(.easeOut(duration: 0.2)) {
                            wordDetailIndex = safeIdx > 0 ? safeIdx - 1 : viewModel.words.count - 1
                        }
                    }
                }
        )
    }

    // MARK: - Weak Words (苦手な単語)

    private var weakWords: [Word] {
        viewModel.words.filter { word in
            word.status == .review || word.easeFactor < 2.5
        }
    }


    // MARK: - Project Thumbnail Header

    private var projectThumbnailHeader: some View {
        ZStack {
            if let iconImage = project.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                let bgColor = MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
                bgColor
                Text(String(project.title.prefix(1)))
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .contentShape(Rectangle())
    }

    // MARK: - Word Stats + Part-of-Speech Widgets

    private var projectStatsSection: some View {
        let words = viewModel.words
        let widgets = HomeViewModel.topHomePartOfSpeechWidgets(for: words)

        let masteredCount = words.filter { $0.status == .mastered }.count
        let reviewCount = words.filter { $0.status == .review }.count
        let newCount = words.filter { $0.status == .new }.count
        let total = words.count

        return VStack(spacing: 8) {
            TabView(selection: $statsPage) {
                // Page 1: Part-of-speech widgets
                Group {
                    if !widgets.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            ForEach(widgets) { widget in
                                projectPartOfSpeechCard(widget)
                            }
                        }
                    } else {
                        Color.clear
                    }
                }
                .tag(0)

                // Page 2: Mastery progress
                HStack(alignment: .top, spacing: 10) {
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
                .tag(1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 130)

            // Page indicator dots
            HStack(spacing: 6) {
                ForEach(0..<2, id: \.self) { page in
                    Circle()
                        .fill(statsPage == page ? MerkenTheme.accentBlue : MerkenTheme.borderLight)
                        .frame(width: 6, height: 6)
                }
            }
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
                    .trim(from: 0, to: progress)
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

    private func projectPartOfSpeechCard(_ widget: HomePartOfSpeechWidget) -> some View {
        let accentColor = projectPartOfSpeechAccent(for: widget.key)
        let iconName = projectPartOfSpeechIcon(for: widget.key)

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(widget.masteredCount)")
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("/\(widget.totalCount)語")
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            .font(.system(size: 21, weight: .bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)

            Text(widget.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 2)

            ZStack {
                Circle()
                    .stroke(MerkenTheme.borderLight, lineWidth: 5)

                Circle()
                    .trim(from: 0, to: widget.progress)
                    .stroke(
                        accentColor,
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Image(systemName: iconName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(accentColor)
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

    private func projectPartOfSpeechAccent(for key: String) -> Color {
        switch key {
        case "noun": return MerkenTheme.chartBlue
        case "verb": return MerkenTheme.danger
        case "adjective": return MerkenTheme.warning
        case "idiom": return MerkenTheme.success
        case "phrasal_verb": return Color(red: 0.18, green: 0.68, blue: 0.62)
        case "adverb": return Color(red: 0.37, green: 0.45, blue: 0.83)
        case "preposition": return Color(red: 0.32, green: 0.52, blue: 0.74)
        case "conjunction": return Color(red: 0.84, green: 0.52, blue: 0.20)
        case "pronoun": return Color(red: 0.24, green: 0.63, blue: 0.72)
        case "determiner": return Color(red: 0.58, green: 0.49, blue: 0.84)
        case "interjection": return Color(red: 0.94, green: 0.43, blue: 0.43)
        case "auxiliary": return Color(red: 0.46, green: 0.58, blue: 0.71)
        default: return MerkenTheme.secondaryText
        }
    }

    private func projectPartOfSpeechIcon(for key: String) -> String {
        switch key {
        case "noun": return "tag.fill"
        case "verb": return "bolt.fill"
        case "adjective": return "sparkles"
        case "adverb": return "gauge.with.dots.needle.50percent"
        case "idiom": return "quote.opening"
        case "phrasal_verb": return "link"
        case "preposition": return "arrow.right"
        case "conjunction": return "point.3.connected.trianglepath.dotted"
        case "pronoun": return "person.fill"
        case "determiner": return "text.book.closed.fill"
        case "interjection": return "exclamationmark.bubble.fill"
        case "auxiliary": return "gearshape.2.fill"
        default: return "square.grid.2x2.fill"
        }
    }

    // MARK: - Learning Modes (horizontal full-width)

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

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
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

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 12) {
            Button {
                showingWordList = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 15, weight: .medium))
                    Text("単語一覧")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(MerkenTheme.primaryText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.surface, in: .rect(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(MerkenTheme.border, lineWidth: 1)
                )
            }

            Button {
                flashcardDestination = project
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.portrait.on.rectangle.portrait")
                        .font(.system(size: 15, weight: .medium))
                    Text("フラッシュカード")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(MerkenTheme.accentBlue, in: .rect(cornerRadius: 14))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
        )
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
