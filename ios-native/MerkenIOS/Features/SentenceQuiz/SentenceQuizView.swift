import SwiftUI

struct SentenceQuizView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = SentenceQuizViewModel()

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
            await viewModel.load(projectId: project.id, using: appState)
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
                .foregroundStyle(.white)

            Text("30秒〜1分ほどかかる場合があります")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
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
            GlassCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text("完了")
                        .font(.title2.bold())
                    Text("\(viewModel.correctCount) / \(viewModel.totalCount) 正解")
                        .font(.title3)
                        .foregroundStyle(.white)
                }
            }

            Text("もう一度")
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 16).fill(MerkenTheme.accentBlue.opacity(0.5)))
                .onTapGesture {
                    Task {
                        await viewModel.restart(projectId: project.id, using: appState)
                    }
                }
        }
        .padding(16)
    }

    // MARK: - Error

    private var errorView: some View {
        VStack(spacing: 16) {
            GlassCard {
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

            Text("再試行")
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 16).fill(MerkenTheme.accentBlue.opacity(0.5)))
                .onTapGesture {
                    Task {
                        await viewModel.load(projectId: project.id, using: appState)
                    }
                }
        }
        .padding(16)
    }
}
