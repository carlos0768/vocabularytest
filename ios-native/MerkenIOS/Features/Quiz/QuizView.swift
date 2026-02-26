import SwiftUI
import UIKit

struct QuizView: View {
    let project: Project
    let preloadedWords: [Word]?
    let skipSetup: Bool

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = QuizViewModel()
    @Environment(\.dismiss) private var dismiss

    init(project: Project, preloadedWords: [Word]? = nil, skipSetup: Bool = false) {
        self.project = project
        self.preloadedWords = preloadedWords
        self.skipSetup = skipSetup
    }

    private var canAccessQuizWhenAIOff: Bool {
        if appState.isAIEnabled {
            return true
        }
        if let preloadedWords {
            return preloadedWords.contains { $0.distractors.count >= 3 }
        }
        return viewModel.hasPreparedQuizContent
    }

    var body: some View {
        ZStack {
            AppBackground()

            if !canAccessQuizWhenAIOff {
                aiDisabledView
            } else {
                switch viewModel.stage {
                case .setup:
                    setupView
                case .playing:
                    playView
                case .completed:
                    resultView
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: project.id) {
            if let preloadedWords, !preloadedWords.isEmpty {
                viewModel.setSourceWords(preloadedWords)
                if canAccessQuizWhenAIOff {
                    viewModel.startQuiz()
                }
            } else {
                await viewModel.load(projectId: project.id, using: appState)
                if canAccessQuizWhenAIOff {
                    viewModel.startQuiz()
                }
            }
        }
        .onDisappear {
            Task {
                await viewModel.flushPendingUpdatesIfNeeded(using: appState)
            }
        }
    }

    private var aiDisabledView: some View {
        VStack(spacing: 16) {
            SolidCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text("AI機能がOFFです")
                        .font(.headline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("4択クイズを利用するには設定でAI機能をONにしてください。")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            Button {
                dismiss()
            } label: {
                Text("戻る")
            }
            .buttonStyle(PrimaryGlassButton())
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Setup

    private var setupView: some View {
        VStack(alignment: .leading, spacing: 14) {
            SolidCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text(project.title)
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
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
            }

            if let errorMessage = viewModel.errorMessage {
                SolidCard {
                    Text(errorMessage)
                        .foregroundStyle(MerkenTheme.warning)
                }
            }

            SolidCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("問題数")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                    HStack(spacing: 8) {
                        ForEach(viewModel.questionLimitOptions, id: \.self) { option in
                            let isSelected = viewModel.selectedQuestionCount == option
                            Text("\(option)")
                                .font(.headline)
                                .foregroundStyle(isSelected ? .white : MerkenTheme.primaryText)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(
                                    isSelected ? MerkenTheme.accentBlue : MerkenTheme.surfaceAlt,
                                    in: .capsule
                                )
                                .overlay(
                                    Capsule().stroke(
                                        isSelected ? Color.clear : MerkenTheme.borderLight,
                                        lineWidth: 1
                                    )
                                )
                                .onTapGesture {
                                    viewModel.selectedQuestionCount = option
                                }
                        }
                    }
                }
            }

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
        return VStack(spacing: 0) {
            if let current {
                // Top bar: X + Progress
                HStack(spacing: 12) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.title3)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    ProgressView(value: viewModel.progress)
                        .tint(MerkenTheme.accentBlue)
                        .background(MerkenTheme.borderLight, in: .capsule)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)

                ScrollView {
                    VStack(spacing: 16) {
                        // 英→日 badge
                        Text("英→日")
                            .font(.caption.bold())
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(MerkenTheme.accentBlueLight, in: .capsule)

                        // Word
                        VStack(spacing: 10) {
                            Text(current.word.english)
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .multilineTextAlignment(.center)

                            Button {
                                Task {
                                    await viewModel.toggleFavorite(projectId: project.id, using: appState)
                                }
                            } label: {
                                Image(systemName: current.word.isFavorite ? "flag.fill" : "flag")
                                    .font(.title3)
                                    .foregroundStyle(current.word.isFavorite ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                            }
                        }
                        .padding(.vertical, 12)

                        // Options A/B/C/D
                        VStack(spacing: 10) {
                            ForEach(current.options.indices, id: \.self) { index in
                                optionButton(index: index, current: current)
                            }
                        }

                        // Example sentence (after reveal)
                        if viewModel.isRevealed, let example = current.word.exampleSentence, !example.isEmpty {
                            SolidCard {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 4) {
                                        Text("99")
                                            .font(.caption2.bold())
                                            .foregroundStyle(MerkenTheme.accentBlue)
                                        Text("例文")
                                            .font(.caption.bold())
                                            .foregroundStyle(MerkenTheme.secondaryText)
                                    }
                                    Text(example)
                                        .font(.subheadline)
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    if let exJa = current.word.exampleSentenceJa {
                                        Text(exJa)
                                            .font(.caption)
                                            .foregroundStyle(MerkenTheme.mutedText)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                }

                // Next button (fixed at bottom)
                if viewModel.isRevealed {
                    Button {
                        viewModel.moveNext(projectId: project.id, using: appState)
                    } label: {
                        HStack {
                            Text("次へ")
                                .font(.headline)
                            Image(systemName: "chevron.right")
                                .font(.headline)
                        }
                    }
                    .buttonStyle(PrimaryGlassButton())
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .accessibilityIdentifier("nextQuestionAction")
                }
            }
        }
    }

    private let optionLabels = ["A", "B", "C", "D"]

    private func optionButton(index: Int, current: QuizQuestion) -> some View {
        let isCorrect = index == current.correctIndex
        let isSelected = viewModel.selectedIndex == index
        let revealed = viewModel.isRevealed

        let bgColor: Color = {
            guard revealed else { return MerkenTheme.surface }
            if isCorrect { return MerkenTheme.success }
            if isSelected { return MerkenTheme.danger }
            return MerkenTheme.surface
        }()

        let textColor: Color = {
            guard revealed else { return MerkenTheme.primaryText }
            if isCorrect || isSelected { return .white }
            return MerkenTheme.mutedText
        }()

        let borderCol: Color = {
            guard revealed else { return MerkenTheme.borderLight }
            if isCorrect { return MerkenTheme.success }
            if isSelected { return MerkenTheme.danger }
            return MerkenTheme.borderLight
        }()

        return HStack(spacing: 14) {
            // A/B/C/D circular label badge
            Text(optionLabels[index])
                .font(.subheadline.bold())
                .foregroundStyle(revealed && (isCorrect || isSelected) ? .white : MerkenTheme.secondaryText)
                .frame(width: 36, height: 36)
                .background(
                    (revealed && (isCorrect || isSelected) ? Color.white.opacity(0.25) : MerkenTheme.surfaceAlt),
                    in: .circle
                )
                .overlay(
                    Circle()
                        .stroke(
                            revealed && (isCorrect || isSelected) ? Color.white.opacity(0.3) : MerkenTheme.borderLight,
                            lineWidth: 1.5
                        )
                )

            Text(current.options[index])
                .font(.body)
                .foregroundStyle(textColor)
                .lineLimit(3)
                .truncationMode(.tail)

            Spacer()

            if revealed && isCorrect {
                Image(systemName: "checkmark")
                    .font(.headline.bold())
                    .foregroundStyle(.white)
            }
            if revealed && isSelected && !isCorrect {
                Image(systemName: "xmark")
                    .font(.headline.bold())
                    .foregroundStyle(.white)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .background(bgColor, in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(borderCol, lineWidth: revealed ? 0 : 1.5)
        )
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(MerkenTheme.border)
                .offset(y: 2)
                .opacity(revealed ? 0 : 1)
        )
        .accessibilityIdentifier("quizOption_\(index)")
        .onTapGesture {
            guard !revealed else { return }
            viewModel.answer(index: index, projectId: project.id, using: appState)
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
                    Text("\(viewModel.correctCount) / \(viewModel.questions.count) 正解")
                        .font(.title3)
                        .foregroundStyle(MerkenTheme.success)
                        .accessibilityIdentifier("quizResultScore")
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
            .accessibilityIdentifier("restartQuizAction")

            Button {
                dismiss()
            } label: {
                Text("終了する")
            }
            .buttonStyle(GhostGlassButton())
        }
        .padding(16)
        .onAppear {
            if viewModel.correctCount == viewModel.questions.count && !viewModel.questions.isEmpty {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}
