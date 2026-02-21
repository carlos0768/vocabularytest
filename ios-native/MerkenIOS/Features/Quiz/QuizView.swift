import SwiftUI

struct QuizView: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = QuizViewModel()

    init(project: Project, preloadedWords: [Word]? = nil) {
        self.project = project
        self.preloadedWords = preloadedWords
    }

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .setup:
                setupView
            case .playing:
                playView
            case .completed:
                resultView
            }

        }
        .navigationTitle("4択クイズ")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: project.id) {
            if let preloadedWords, !preloadedWords.isEmpty {
                viewModel.setSourceWords(preloadedWords)
            } else {
                await viewModel.load(projectId: project.id, using: appState)
            }
        }
        .onDisappear {
            Task {
                await viewModel.flushPendingUpdatesIfNeeded(using: appState)
            }
        }
    }

    // MARK: - Setup

    private var setupView: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text(project.title)
                    .font(.title3.bold())
                Text("問題数を選択して開始")
                    .foregroundStyle(MerkenTheme.secondaryText)
                if viewModel.loading {
                    ProgressView("単語を読み込み中...")
                        .tint(MerkenTheme.accentBlue)
                } else if viewModel.preparingQuiz {
                    ProgressView("問題を作成中...")
                        .tint(MerkenTheme.accentBlue)
                } else {
                    Text("利用可能な単語: \(viewModel.sourceWordCount)")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular, in: .rect(cornerRadius: 24))

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(MerkenTheme.warning)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glassEffect(.regular, in: .rect(cornerRadius: 24))
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("問題数")
                    .font(.headline)
                HStack(spacing: 8) {
                    ForEach(viewModel.questionLimitOptions, id: \.self) { option in
                        Text("\(option)")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(
                                    viewModel.selectedQuestionCount == option
                                        ? MerkenTheme.accentBlue.opacity(0.5)
                                        : .white.opacity(0.08)
                                )
                            )
                            .onTapGesture {
                                viewModel.selectedQuestionCount = option
                            }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular, in: .rect(cornerRadius: 24))

            Button {
                guard !viewModel.loading, !viewModel.preparingQuiz else { return }
                viewModel.startQuiz()
            } label: {
                Text(viewModel.preparingQuiz ? "問題を作成中..." : "クイズ開始")
            }
            .buttonStyle(PrimaryGlassButton())
            .opacity((viewModel.loading || viewModel.preparingQuiz) ? 0.6 : 1)
            .disabled(viewModel.loading || viewModel.preparingQuiz)
            .accessibilityIdentifier("startQuizAction")

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Play

    private var playView: some View {
        let current = viewModel.currentQuestion
        return VStack(alignment: .leading, spacing: 14) {
            if let current {
                // Question header
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("問題 \(viewModel.currentIndex + 1) / \(viewModel.questions.count)")
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Spacer()
                        Image(systemName: current.word.isFavorite ? "heart.fill" : "heart")
                            .foregroundStyle(current.word.isFavorite ? MerkenTheme.danger : MerkenTheme.secondaryText)
                            .onTapGesture {
                                Task {
                                    await viewModel.toggleFavorite(projectId: project.id, using: appState)
                                }
                            }
                    }

                    ProgressView(value: viewModel.progress)
                        .tint(MerkenTheme.accentBlue)

                    Text("\"\(current.word.english)\" の意味は？")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .truncationMode(.tail)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassEffect(.regular, in: .rect(cornerRadius: 24))

                // Options
                VStack(spacing: 10) {
                    ForEach(current.options.indices, id: \.self) { index in
                        optionButton(index: index, current: current)
                    }
                }

                // Next button
                if viewModel.isRevealed {
                    Button {
                        viewModel.moveNext(projectId: project.id, using: appState)
                    } label: {
                        Text("次の問題")
                    }
                    .buttonStyle(PrimaryGlassButton())
                    .accessibilityIdentifier("nextQuestionAction")
                }
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func optionButton(index: Int, current: QuizQuestion) -> some View {
        let isCorrect = index == current.correctIndex
        let isSelected = viewModel.selectedIndex == index
        let revealed = viewModel.isRevealed

        let fillColor: Color = {
            guard revealed else { return .white.opacity(0.06) }
            if isCorrect { return MerkenTheme.success.opacity(0.15) }
            if isSelected { return MerkenTheme.danger.opacity(0.15) }
            return .white.opacity(0.06)
        }()

        let borderColor: Color = {
            guard revealed else { return .white.opacity(0.10) }
            if isCorrect { return MerkenTheme.success.opacity(0.9) }
            if isSelected { return MerkenTheme.danger.opacity(0.9) }
            return .white.opacity(0.10)
        }()

        return HStack(spacing: 10) {
            Text(current.options[index])
                .foregroundStyle(.white)
                .lineLimit(3)
                .truncationMode(.tail)
            Spacer()
            if revealed && isCorrect {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(MerkenTheme.success)
            }
            if revealed && isSelected && !isCorrect {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(MerkenTheme.danger)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14).fill(fillColor))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: revealed ? 1.5 : 1))
        .accessibilityIdentifier("quizOption_\(index)")
        .onTapGesture {
            guard !revealed else { return }
            viewModel.answer(index: index, projectId: project.id, using: appState)
        }
    }

    // MARK: - Result

    private var resultView: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("完了")
                    .font(.title2.bold())
                Text("\(viewModel.correctCount) / \(viewModel.questions.count) 正解")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .accessibilityIdentifier("quizResultScore")
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular, in: .rect(cornerRadius: 24))

            Button {
                Task {
                    await viewModel.restart(projectId: project.id, using: appState)
                }
            } label: {
                Text("もう一度")
            }
            .buttonStyle(PrimaryGlassButton())
            .accessibilityIdentifier("restartQuizAction")
        }
        .padding(16)
    }
}
