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

                    // Loose-leaf word detail
                    if !viewModel.words.isEmpty {
                        looseLeafWordCard
                    }

                    // Word list link
                    Button {
                        showingWordList = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "list.bullet")
                                .font(.system(size: 13))
                            Text("単語一覧")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(MerkenTheme.accentBlue)
                    }

                    // Learning modes
                    learningModesSection

                    // Stats
                    if !viewModel.words.isEmpty {
                        Text("統計")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        statsWidget
                    }

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
                Text(project.title)
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)
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
                .padding(.top, 16)

                Spacer()

                // Word
                VStack(spacing: 16) {
                    Text(word.english)
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)

                    Text(word.japanese)
                        .font(.system(size: 24))
                        .foregroundStyle(MerkenTheme.secondaryText)

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

                Spacer()
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

    // MARK: - Stats Widget

    private var statsWidget: some View {
        let total = viewModel.words.count
        let masteredCount = viewModel.words.filter { $0.status == .mastered }.count
        let reviewCount = viewModel.words.filter { $0.status == .review }.count
        let newCount = viewModel.words.filter { $0.status == .new }.count
        let weakCount = weakWords.count

        return VStack(alignment: .leading, spacing: 20) {
            // Header + percentage
            HStack {
                Text("習得の進捗")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Text(total > 0
                     ? "\(Int(Double(masteredCount) / Double(total) * 100))%"
                     : "0%")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(MerkenTheme.success)
            }

            // Progress bar
            GeometryReader { geo in
                let t = max(CGFloat(total), 1)
                let masteredW = geo.size.width * CGFloat(masteredCount) / t
                let reviewW = geo.size.width * CGFloat(reviewCount) / t

                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(MerkenTheme.surfaceAlt)
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(MerkenTheme.success)
                            .frame(width: max(masteredW, 0))
                        Rectangle()
                            .fill(MerkenTheme.accentBlue)
                            .frame(width: max(reviewW, 0))
                    }
                    .clipShape(.rect(cornerRadius: 6))
                }
            }
            .frame(height: 14)

            // Stat cards (2x2 grid, no dividers)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                statTile(icon: "checkmark.circle", iconColor: MerkenTheme.success, label: "習得済み", count: masteredCount)
                statTile(icon: "arrow.triangle.2.circlepath", iconColor: MerkenTheme.accentBlue, label: "復習中", count: reviewCount)
                statTile(icon: "clock", iconColor: MerkenTheme.mutedText, label: "未学習", count: newCount)
                statTile(icon: "exclamationmark.circle", iconColor: MerkenTheme.danger, label: "苦手な単語", count: weakCount)
            }
        }
        .padding(20)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
        .padding(.horizontal, 4)
    }

    private func statTile(icon: String, iconColor: Color, label: String, count: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(iconColor)
            Text("\(count)")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(MerkenTheme.mutedText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 14))
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


    // MARK: - Learning Modes (horizontal full-width)

    private var learningModesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("学習モード")
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)

            VStack(spacing: 10) {
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
