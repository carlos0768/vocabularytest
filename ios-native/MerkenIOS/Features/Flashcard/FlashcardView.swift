import SwiftUI

struct FlashcardView: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = FlashcardViewModel()

    init(project: Project, preloadedWords: [Word]? = nil) {
        self.project = project
        self.preloadedWords = preloadedWords
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
            if let preloadedWords, !preloadedWords.isEmpty {
                viewModel.setWords(preloadedWords)
            } else {
                await viewModel.load(projectId: project.id, using: appState)
            }
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

                if let word = viewModel.currentWord {
                    Image(systemName: word.isFavorite ? "heart.fill" : "heart")
                        .font(.title3)
                        .foregroundStyle(word.isFavorite ? MerkenTheme.danger : MerkenTheme.secondaryText)
                        .onTapGesture {
                            Task {
                                await viewModel.toggleFavorite(using: appState)
                            }
                        }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 4)

            // Card
            if let word = viewModel.currentWord {
                FlashcardCardView(
                    word: word,
                    isFlipped: viewModel.isFlipped,
                    onTap: { viewModel.flipCard() },
                    onSwipeLeft: { viewModel.goNext() },
                    onSwipeRight: { viewModel.goPrevious() }
                )
                .padding(.horizontal, 24)
            }

            Spacer(minLength: 0)

            // Toolbar
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

    private func toolbarButton(icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(enabled ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                .frame(width: 44, height: 44)
                .background(MerkenTheme.surface, in: .circle)
                .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.5))
                .shadow(color: MerkenTheme.border.opacity(0.3), radius: 0, x: 0, y: 2)
        }
        .disabled(!enabled)
    }
}
