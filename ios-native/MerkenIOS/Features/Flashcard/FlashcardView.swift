import SwiftUI

struct FlashcardView: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: FlashcardViewModel
    @State private var dictionaryURL: URL?
    @State private var showingDeleteConfirm = false
    @State private var showingEditSheet = false
    @State private var editEnglish = ""
    @State private var editJapanese = ""

    init(project: Project, preloadedWords: [Word]? = nil) {
        self.project = project
        self.preloadedWords = preloadedWords
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
        .task(id: project.id) {
            guard preloadedWords == nil || preloadedWords?.isEmpty == true else { return }
            await viewModel.load(projectId: project.id, using: appState)
        }
        .sheet(item: $dictionaryURL) { url in
            SafariView(url: url)
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
            // Header
            HStack {
                Text("\(viewModel.currentIndex + 1) / \(viewModel.wordCount)")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.secondaryText)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 4)

            // Card
            if let word = viewModel.currentWord {
                FlashcardCardView(
                    word: word,
                    isFlipped: viewModel.isFlipped,
                    japaneseFirst: viewModel.japaneseFirst,
                    onTap: { viewModel.flipCard() },
                    onSwipeLeft: { viewModel.goNext() },
                    onSwipeRight: { viewModel.goPrevious() }
                )
                .padding(.horizontal, 24)
            }

            Spacer(minLength: 0)

            // Action buttons (matches web version)
            HStack(spacing: 12) {
                // 日→英 / 英→日 toggle
                actionButton(
                    icon: "textformat.abc",
                    active: viewModel.japaneseFirst,
                    label: viewModel.japaneseFirst ? "日→英" : "英→日"
                ) {
                    viewModel.toggleDirection()
                }

                // Favorite toggle
                actionButton(
                    icon: viewModel.currentWord?.isFavorite == true ? "heart.fill" : "heart",
                    active: viewModel.currentWord?.isFavorite == true,
                    label: "苦手"
                ) {
                    Task { await viewModel.toggleFavorite(using: appState) }
                }

                // Dictionary
                actionButton(icon: "book", label: "辞書") {
                    dictionaryURL = viewModel.dictionaryURL
                }

                // Edit
                actionButton(icon: "pencil", label: "編集") {
                    if let word = viewModel.currentWord {
                        editEnglish = word.english
                        editJapanese = word.japanese
                        showingEditSheet = true
                    }
                }

                // Delete
                actionButton(icon: "trash", label: "削除", destructive: true) {
                    showingDeleteConfirm = true
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            // Navigation toolbar
            HStack(spacing: 32) {
                toolbarButton(icon: "chevron.left", enabled: viewModel.hasPrevious) {
                    viewModel.goPrevious()
                }

                toolbarButton(icon: "speaker.wave.2", enabled: true) {
                    viewModel.speak()
                }

                toolbarButton(icon: "arrow.trianglehead.2.clockwise", enabled: true) {
                    viewModel.flipCard()
                }

                toolbarButton(icon: "chevron.right", enabled: viewModel.hasNext) {
                    viewModel.goNext()
                }
            }
            .padding(.vertical, 16)

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.warning)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }
        }
    }

    private func actionButton(icon: String, active: Bool = false, label: String, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                Text(label)
                    .font(.system(size: 10, design: .serif))
            }
            .foregroundStyle(
                destructive ? MerkenTheme.danger :
                active ? MerkenTheme.accentBlue :
                MerkenTheme.secondaryText
            )
            .frame(width: 52, height: 48)
            .background(
                active ? MerkenTheme.accentBlue.opacity(0.1) : Color.clear,
                in: .rect(cornerRadius: 10)
            )
        }
    }

    private func toolbarButton(icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(enabled ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                .frame(width: 44, height: 44)
                .background(MerkenTheme.surface, in: .circle)
                .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.5))
                .background(
                    Circle()
                        .fill(MerkenTheme.border)
                        .offset(y: 2)
                )
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
