import SwiftUI

struct FlashcardView: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: FlashcardViewModel
    @State private var showingDeleteConfirm = false
    @State private var showingEditSheet = false
    @State private var editEnglish = ""
    @State private var editJapanese = ""
    @State private var pressedButton: String?
    @State private var showTinderSort = false
    @State private var showTimeAttack = false
    @Environment(\.dismiss) private var dismiss

    private let showDismissButton: Bool

    init(project: Project, preloadedWords: [Word]? = nil, showDismissButton: Bool = true) {
        self.project = project
        self.preloadedWords = preloadedWords
        self.showDismissButton = showDismissButton
        _viewModel = StateObject(wrappedValue: FlashcardViewModel(initialWords: preloadedWords))
    }

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .loading:
                loadingView
            case .empty:
                emptyView
            case .viewing:
                viewingView
            }
        }
        .navigationTitle("フラッシュカード")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if showDismissButton {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
            }
        }
        .onDisappear {
            viewModel.stopAutoPlay()
        }
        .task(id: project.id) {
            guard preloadedWords == nil || preloadedWords?.isEmpty == true else { return }
            await viewModel.load(projectId: project.id, using: appState)
        }
        .alert("この単語を削除しますか？", isPresented: $showingDeleteConfirm) {
            Button("削除", role: .destructive) {
                Task { await viewModel.deleteWord(using: appState) }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            if let word = viewModel.currentWord {
                Text("「\(word.english)」を削除します。この操作は元に戻せません。")
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            editWordSheet
        }
        .navigationDestination(isPresented: $showTinderSort) {
            TinderSortView(
                project: project,
                words: viewModel.allWords,
                onFlashcardUnknown: { unknownWords in
                    showTinderSort = false
                    viewModel.setWords(unknownWords)
                }
            )
        }
        .onChange(of: viewModel.shouldShowTinderSort) {
            if viewModel.shouldShowTinderSort {
                viewModel.shouldShowTinderSort = false
                showTinderSort = true
            }
        }
        .navigationDestination(isPresented: $showTimeAttack) {
            TimeAttackView(
                project: project,
                words: viewModel.allWords
            )
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(MerkenTheme.accentBlue)
            Text("単語を読み込み中...")
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }

    // MARK: - Empty

    private var emptyView: some View {
        VStack(spacing: 16) {
            SolidCard {
                VStack(spacing: 8) {
                    Image(systemName: "rectangle.on.rectangle.slash")
                        .font(.largeTitle)
                        .foregroundStyle(MerkenTheme.mutedText)
                    Text("単語がありません")
                        .font(.headline)
                    Text("先に単語を追加してください。")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                .frame(maxWidth: .infinity)
            }

            if let errorMessage = viewModel.errorMessage {
                SolidCard {
                    Text(errorMessage)
                        .foregroundStyle(MerkenTheme.warning)
                }
            }
        }
        .padding(16)
    }

    // MARK: - Viewing

    private var viewingView: some View {
        VStack(spacing: 0) {
            // Header: progress + mode badge + overflow menu
            VStack(spacing: 6) {
                HStack {
                    // Mode badge
                    Button {
                        MerkenHaptic.light()
                        viewModel.toggleDirection()
                    } label: {
                        Text(viewModel.japaneseFirst ? "日→英" : "英→日")
                    }
                    .buttonStyle(SolidButtonStyle(viewModel.japaneseFirst ? .inverse : .surface, size: .small, cornerRadius: 16))

                    Spacer()

                    // Progress
                    Text("\(viewModel.currentIndex + 1) / \(viewModel.wordCount)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)

                    Spacer()

                    // Overflow menu (⋯)
                    Menu {
                        Button {
                            MerkenHaptic.light()
                            viewModel.toggleAutoPlay()
                        } label: {
                            Label(
                                viewModel.isAutoPlayEnabled ? "自動再生モードを停止" : "自動再生モードを開始",
                                systemImage: viewModel.isAutoPlayEnabled ? "pause.circle" : "play.circle"
                            )
                        }

                        Divider()

                        Button {
                            if let word = viewModel.currentWord {
                                editEnglish = word.english
                                editJapanese = word.japanese
                                showingEditSheet = true
                            }
                        } label: {
                            Label("単語を編集", systemImage: "pencil")
                        }

                        Button {
                            MerkenHaptic.light()
                            viewModel.shuffle()
                        } label: {
                            Label("シャッフル", systemImage: "shuffle")
                        }

                        Divider()

                        Button(role: .destructive) {
                            showingDeleteConfirm = true
                        } label: {
                            Label("単語を削除", systemImage: "trash")
                        }
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "ellipsis")
                                .font(.title3)
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .frame(width: 36, height: 36)

                            if viewModel.isAutoPlayEnabled {
                                Circle()
                                    .fill(MerkenTheme.success)
                                    .frame(width: 9, height: 9)
                                    .offset(x: -4, y: 5)
                            }
                        }
                    }
                }

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(MerkenTheme.border)
                            .frame(height: 3)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(MerkenTheme.accentBlue)
                            .frame(
                                width: viewModel.wordCount > 0
                                    ? geo.size.width * CGFloat(viewModel.currentIndex + 1) / CGFloat(viewModel.wordCount)
                                    : 0,
                                height: 3
                            )
                            .animation(MerkenSpring.gentle, value: viewModel.currentIndex)
                    }
                }
                .frame(height: 3)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 4)

            VStack(spacing: 0) {
                Spacer(minLength: 0)

                // Card
                Group {
                    if let word = viewModel.currentWord {
                        FlashcardCardView(
                            word: word,
                            isFlipped: viewModel.isFlipped,
                            japaneseFirst: viewModel.japaneseFirst,
                            onTap: { viewModel.flipCard() },
                            onSwipeLeft: { viewModel.goNext() },
                            onSwipeRight: { viewModel.goPrevious() }
                        )
                    }
                }
                .padding(.horizontal, 24)

                Spacer(minLength: 0)

                Spacer(minLength: 18).fixedSize()

                // Action chips — edit, pronunciation, status, favorite, delete
                HStack(spacing: 12) {
                    actionChip(icon: "pencil", label: "編集") {
                        if let word = viewModel.currentWord {
                            editEnglish = word.english
                            editJapanese = word.japanese
                            showingEditSheet = true
                        }
                    }

                    actionChip(icon: "speaker.wave.2.fill", label: "発音") {
                        viewModel.speakEnglish()
                    }

                    actionChip(
                        icon: "checkmark.circle",
                        label: statusLabel(for: viewModel.currentWord?.status ?? .new),
                        tint: statusColor(for: viewModel.currentWord?.status ?? .new)
                    ) {
                        Task { await viewModel.cycleStatus(using: appState) }
                    }

                    actionChip(
                        icon: viewModel.currentWord?.isFavorite == true ? "bookmark.fill" : "bookmark",
                        label: "お気に入り",
                        tint: viewModel.currentWord?.isFavorite == true ? MerkenTheme.accentGreen : MerkenTheme.solidInk
                    ) {
                        MerkenHaptic.medium()
                        Task { await viewModel.toggleFavorite(using: appState) }
                    }

                    actionChip(icon: "trash", label: "削除", tint: MerkenTheme.danger) {
                        showingDeleteConfirm = true
                    }
                }
                .padding(.bottom, 12)

                // Navigation buttons (large) — prev, flip, next
                HStack(spacing: 28) {
                    navButton(icon: "chevron.left", enabled: viewModel.hasPrevious) {
                        viewModel.goPrevious()
                    }

                    navButton(icon: "arrow.trianglehead.2.clockwise", enabled: true) {
                        viewModel.flipCard()
                    }

                    navButton(icon: "chevron.right", enabled: viewModel.hasNext) {
                        viewModel.goNext()
                    }
                }
                .padding(.vertical, 20)

                if viewModel.isAutoPlayEnabled {
                    Text("自動再生モード中")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(MerkenTheme.success)
                        .padding(.bottom, 10)
                }

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.warning)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func actionChip(
        icon: String,
        label: String,
        tint: Color = MerkenTheme.solidInk,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            MerkenHaptic.light()
            action()
        } label: {
            VStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(tint)
                    .frame(width: 42, height: 42)
                    .solidSurface(tone: .surface, depth: .small, cornerRadius: 21)

                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 54)
        }
        .buttonStyle(.plain)
    }

    private func statusLabel(for status: WordStatus) -> String {
        switch status {
        case .new: return "未学習"
        case .review: return "学習中"
        case .mastered: return "習得"
        }
    }

    private func statusColor(for status: WordStatus) -> Color {
        switch status {
        case .new: return MerkenTheme.mutedText
        case .review: return MerkenTheme.chartBlue
        case .mastered: return MerkenTheme.success
        }
    }

    private func navButton(icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            MerkenHaptic.light()
            // Bounce animation
            pressedButton = icon
            withAnimation(MerkenSpring.tap) {
                pressedButton = icon
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(MerkenSpring.bouncy) {
                    pressedButton = nil
                }
            }
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(enabled ? MerkenTheme.solidInk : MerkenTheme.mutedText)
                .frame(width: 56, height: 56)
                .solidSurface(tone: enabled ? .surface : .muted, depth: .small, cornerRadius: 28)
                .scaleEffect(pressedButton == icon ? 0.85 : 1.0)
        }
        .disabled(!enabled)
    }

    // MARK: - Edit Word Sheet

    private var editWordSheet: some View {
        NavigationStack {
            Form {
                Section("英語") {
                    TextField("英単語", text: $editEnglish)
                        .autocapitalization(.none)
                }
                Section("日本語") {
                    TextField("日本語訳", text: $editJapanese)
                }
            }
            .navigationTitle("単語を編集")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { showingEditSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task {
                            await viewModel.editWord(
                                english: editEnglish.trimmingCharacters(in: .whitespaces),
                                japanese: editJapanese.trimmingCharacters(in: .whitespaces),
                                using: appState
                            )
                            showingEditSheet = false
                        }
                    }
                    .disabled(editEnglish.trimmingCharacters(in: .whitespaces).isEmpty ||
                              editJapanese.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
