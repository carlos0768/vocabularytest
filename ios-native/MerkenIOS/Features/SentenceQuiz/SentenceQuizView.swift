import SwiftUI

struct SentenceQuizView: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = SentenceQuizViewModel()

    init(project: Project, preloadedWords: [Word]? = nil) {
        self.project = project
        self.preloadedWords = preloadedWords
    }

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .loading:
                loadingView(message: "単語を読み込み中...")
            case .generating:
                generatingView
            case .playing:
                playView
            case .completed:
                resultView
            case .error:
                errorView
            }
        }
        .navigationTitle("例文クイズ")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: project.id) {
            if let preloadedWords, !preloadedWords.isEmpty {
                viewModel.setSourceWords(preloadedWords)
                await viewModel.generateQuiz(projectId: project.id, using: appState)
            } else {
                await viewModel.load(projectId: project.id, using: appState)
            }
        }
        .onDisappear {
            Task {
                await viewModel.flushPendingUpdates(using: appState)
            }
        }
    }

    // MARK: - Loading

    private func loadingView(message: String) -> some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(MerkenTheme.accentBlue)
            Text(message)
                .foregroundStyle(MerkenTheme.secondaryText)

            Button {
                dismiss()
            } label: {
                Text("キャンセル")
            }
            .buttonStyle(GhostGlassButton())
            .padding(.top, 8)
        }
    }

    // MARK: - Generating

    private var generatingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(MerkenTheme.accentBlue)
                .scaleEffect(1.2)

            Text("AIが問題を生成中...")
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)

            Text("数秒お待ちください")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)

            Button {
                dismiss()
            } label: {
                Text("キャンセル")
            }
            .buttonStyle(GhostGlassButton())
            .padding(.top, 8)
        }
    }

    // MARK: - Playing

    private var playView: some View {
        Group {
            if let question = viewModel.currentQuestion {
                SentenceQuizQuestionView(
                    question: question,
                    questionNumber: viewModel.currentIndex + 1,
                    totalQuestions: viewModel.totalCount,
                    progress: viewModel.progress,
                    isRevealed: viewModel.isRevealed,
                    selectedAnswer: viewModel.selectedAnswer,
                    onAnswer: { selected, isCorrect in
                        viewModel.answer(selected: selected, isCorrect: isCorrect)
                    },
                    onNext: {
                        viewModel.moveNext(using: appState)
                    }
                )
            }
        }
    }

    // MARK: - Result

    private var resultView: some View {
        VStack(spacing: 16) {
            SolidCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text("完了")
                        .font(.title2.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("\(viewModel.correctCount) / \(viewModel.totalCount) 正解")
                        .font(.title3)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            Button {
                Task {
                    await viewModel.restart(projectId: project.id, using: appState)
                }
            } label: {
                Text("もう一度")
            }
            .buttonStyle(PrimaryGlassButton())
        }
        .padding(16)
    }

    // MARK: - Error

    private var errorView: some View {
        VStack(spacing: 16) {
            SolidCard {
                VStack(alignment: .leading, spacing: 8) {
                    Label("エラー", systemImage: "exclamationmark.triangle.fill")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.warning)

                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
            }

            Button {
                Task {
                    await viewModel.load(projectId: project.id, using: appState)
                }
            } label: {
                Text("再試行")
            }
            .buttonStyle(PrimaryGlassButton())
        }
        .padding(16)
    }
}
