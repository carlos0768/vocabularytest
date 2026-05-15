import SwiftUI
import UIKit
import AVFoundation

struct QuizView: View {
    let project: Project
    let preloadedWords: [Word]?
    let skipSetup: Bool

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = QuizViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var speechSynthesizer = AVSpeechSynthesizer()

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
            PaperDotBackground()

            if !canAccessQuizWhenAIOff {
                aiDisabledView
            } else {
                switch viewModel.stage {
                case .setup:
                    if viewModel.loading || viewModel.preparingQuiz {
                        loadingStateView(message: viewModel.loading ? "単語を読み込み中..." : "問題を作成中...")
                    } else {
                        setupView
                    }
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
            let shouldAutoStart = skipSetup || preloadedWords != nil
            if let preloadedWords, !preloadedWords.isEmpty {
                viewModel.setSourceWords(preloadedWords)
                if canAccessQuizWhenAIOff && shouldAutoStart {
                    viewModel.startQuiz()
                }
            } else {
                await viewModel.load(projectId: project.id, using: appState)
                if canAccessQuizWhenAIOff && shouldAutoStart {
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
            SolidSurface(tone: .surface, depth: .small, cornerRadius: 16, padding: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("AI機能がOFFです")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("4択クイズを利用するには設定でAI機能をONにしてください。")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            Button {
                dismiss()
            } label: {
                Text("戻る")
            }
            .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 14))
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func loadingStateView(message: String) -> some View {
        VStack(spacing: 14) {
            ProgressView()
                .tint(MerkenTheme.solidInk)
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Setup

    private var setupView: some View {
        VStack(spacing: 0) {
            HStack {
                SolidIconButton(systemImage: "xmark", size: 36) {
                    dismiss()
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)

            Spacer(minLength: 24)

            VStack(spacing: 18) {
                VStack(spacing: 6) {
                    Text("QUIZ SETUP")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .tracking(1.0)
                        .foregroundStyle(MerkenTheme.mutedText)

                    Text("問題数を入力")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(MerkenTheme.solidInk)

                    Text("利用可能な単語: \(viewModel.sourceWordCount)語")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                .multilineTextAlignment(.center)

                if let errorMessage = viewModel.errorMessage {
                    SolidSurface(
                        tone: .warning,
                        depth: .small,
                        cornerRadius: 14,
                        borderColor: MerkenTheme.warning,
                        shadowColor: MerkenTheme.warning,
                        padding: 12,
                        alignment: .center
                    ) {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.warning)
                            .multilineTextAlignment(.center)
                    }
                }

                SolidSurface(tone: .surface, depth: .small, cornerRadius: 18, padding: 18, alignment: .center) {
                    VStack(spacing: 16) {
                        Text("問題数")
                            .font(.system(size: 13, weight: .bold, design: .monospaced))
                            .tracking(0.8)
                            .foregroundStyle(MerkenTheme.mutedText)

                        HStack(spacing: 8) {
                            ForEach(viewModel.questionLimitOptions, id: \.self) { option in
                                Button {
                                    viewModel.selectedQuestionCount = option
                                } label: {
                                    Text("\(option)")
                                        .monospacedDigit()
                                }
                                .buttonStyle(
                                    SolidButtonStyle(
                                        viewModel.selectedQuestionCount == option ? .inverse : .surface,
                                        size: .small,
                                        cornerRadius: 18
                                    )
                                )
                            }
                        }

                        Button {
                            guard !viewModel.loading, !viewModel.preparingQuiz else { return }
                            viewModel.startQuiz()
                        } label: {
                            Text(viewModel.preparingQuiz ? "問題を作成中..." : "スタート")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 14))
                        .disabled(viewModel.loading || viewModel.preparingQuiz)
                        .accessibilityIdentifier("startQuizAction")
                    }
                }
            }
            .frame(maxWidth: 360)
            .padding(.horizontal, 24)

            Spacer(minLength: 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Play

    private var playView: some View {
        VStack(spacing: 0) {
            if let current = viewModel.currentQuestion {
                quizHeader(current: current)

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(viewModel.isActiveVocab ? "タイプ入力" : "意味を選ぼう")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .tracking(0.8)
                            .foregroundStyle(MerkenTheme.mutedText)

                        questionPlate(current: current)

                        if viewModel.isActiveVocab {
                            activeTypingSection(current: current)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(current.options.indices, id: \.self) { index in
                                    optionButton(index: index, current: current)
                                }
                            }
                        }

                        if viewModel.isRevealed, let example = current.word.exampleSentence, !example.isEmpty {
                            exampleCard(example: example, exampleJa: current.word.exampleSentenceJa)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .disableTopScrollEdgeEffectIfAvailable()

                if viewModel.isRevealed {
                    bottomNextAction
                }
            } else {
                loadingStateView(message: "クイズを準備中...")
            }
        }
    }

    private func quizHeader(current: QuizQuestion) -> some View {
        HStack(spacing: 10) {
            SolidIconButton(systemImage: "xmark", size: 36) {
                dismiss()
            }

            VStack(spacing: 6) {
                HStack(spacing: 3) {
                    ForEach(viewModel.questions.indices, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(progressColor(at: index))
                            .frame(height: 5)
                            .overlay(
                                RoundedRectangle(cornerRadius: 2, style: .continuous)
                                    .stroke(index == viewModel.currentIndex ? MerkenTheme.solidInk.opacity(0.75) : .clear, lineWidth: 0.5)
                            )
                    }
                }

                Text("\(viewModel.currentIndex + 1)/\(max(viewModel.questions.count, 1))")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.solidInk)
            }

            SolidIconButton(
                systemImage: current.word.isFavorite ? "bookmark.fill" : "bookmark",
                foreground: current.word.isFavorite ? MerkenTheme.accentGreen : MerkenTheme.solidInk,
                size: 36
            ) {
                Task {
                    await viewModel.toggleFavorite(projectId: project.id, using: appState)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 4)
    }

    private func progressColor(at index: Int) -> Color {
        if viewModel.answerResults.indices.contains(index), let result = viewModel.answerResults[index] {
            return result ? MerkenTheme.success : MerkenTheme.danger
        }
        if index == viewModel.currentIndex {
            return MerkenTheme.solidInk
        }
        return MerkenTheme.solidInk.opacity(0.1)
    }

    private func questionPlate(current: QuizQuestion) -> some View {
        SolidSurface(tone: .surface, depth: .standard, cornerRadius: 18, padding: 20, alignment: .center) {
            VStack(spacing: 10) {
                if let pronunciation = current.word.pronunciation, !pronunciation.isEmpty {
                    Text(pronunciation)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Text(viewModel.isActiveVocab ? current.word.japanese : current.word.english)
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.55)
                    .frame(maxWidth: .infinity)

                if !viewModel.isActiveVocab {
                    Button {
                        speak(current.word.english)
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.system(size: 11, weight: .bold))
                            Text("読み上げ")
                                .font(.system(size: 11, weight: .bold))
                        }
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(MerkenTheme.solidInk.opacity(0.04), in: .capsule)
                        .overlay(Capsule().stroke(MerkenTheme.borderLight, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func exampleCard(example: String, exampleJa: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("EXAMPLE")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .tracking(0.6)
                .foregroundStyle(MerkenTheme.mutedText)
            Text(example)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(MerkenTheme.solidInk)
                .lineSpacing(3)
            if let exampleJa, !exampleJa.isEmpty {
                Text(exampleJa)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .lineSpacing(3)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(MerkenTheme.borderLight, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
    }

    private var bottomNextAction: some View {
        Button {
            viewModel.moveNext(projectId: project.id, using: appState)
        } label: {
            HStack(spacing: 8) {
                Text("次へ")
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .bold))
            }
            .frame(maxWidth: .infinity, minHeight: 24)
        }
        .buttonStyle(SolidButtonStyle(.inverse, size: .large, expands: true, cornerRadius: 16))
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 16)
        .background(MerkenTheme.paperBackground)
        .accessibilityIdentifier("nextQuestionAction")
    }

    private func speak(_ text: String) {
        speechSynthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.46
        speechSynthesizer.speak(utterance)
    }

    // MARK: - Active Typing

    @ViewBuilder
    private func activeTypingSection(current: QuizQuestion) -> some View {
        if !viewModel.isRevealed {
            VStack(spacing: 12) {
                TypeInField(
                    answer: current.word.english,
                    value: $viewModel.typedAnswer,
                    onSubmit: {
                        guard !viewModel.typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        viewModel.submitTypingAnswer(projectId: project.id, using: appState)
                    }
                )

                Button {
                    viewModel.submitTypingAnswer(projectId: project.id, using: appState)
                } label: {
                    Text("回答する")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 14))
                .disabled(viewModel.typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } else {
            let feedbackFill = viewModel.typingCorrect == true ? quizCorrectFill : quizWrongFill
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: viewModel.typingCorrect == true ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white)

                    Text(viewModel.typingCorrect == true ? "正解" : "不正解")
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                }

                if viewModel.typingCorrect != true {
                    VStack(spacing: 4) {
                        Text("あなたの回答")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.72))
                        Text(viewModel.typedAnswer)
                            .font(.body)
                            .foregroundStyle(.white)
                            .strikethrough()
                    }
                }

                VStack(spacing: 4) {
                    Text("正解")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.72))
                    Text(current.word.english)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 20)
            .background(feedbackFill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(feedbackFill, lineWidth: 1.6)
            )
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(feedbackFill)
                    .offset(x: MerkenSolid.smallOffset.width, y: MerkenSolid.smallOffset.height)
            )
        }
    }

    private let optionLabels = ["A", "B", "C", "D"]
    private let quizCorrectFill = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)
    private let quizWrongFill = Color(red: 239 / 255, green: 68 / 255, blue: 68 / 255)
    private let quizCorrectFace = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 34 / 255, green: 197 / 255, blue: 94 / 255, alpha: 0.18)
            : UIColor(red: 220 / 255, green: 252 / 255, blue: 231 / 255, alpha: 1)
    })
    private let quizWrongFace = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 239 / 255, green: 68 / 255, blue: 68 / 255, alpha: 0.18)
            : UIColor(red: 254 / 255, green: 226 / 255, blue: 226 / 255, alpha: 1)
    })

    private func optionButton(index: Int, current: QuizQuestion) -> some View {
        let isCorrect = index == current.correctIndex
        let isSelected = viewModel.selectedIndex == index
        let revealed = viewModel.isRevealed
        let isCorrectAnswer = revealed && isCorrect
        let isWrongAnswer = revealed && isSelected && !isCorrect
        let isInactive = revealed && !isSelected && !isCorrect
        let isFeedback = isCorrectAnswer || isWrongAnswer
        let faceColor = isCorrectAnswer
            ? quizCorrectFace
            : isWrongAnswer
                ? quizWrongFace
                : MerkenTheme.surface
        let borderColor = isCorrectAnswer
            ? quizCorrectFill
            : isWrongAnswer
                ? quizWrongFill
                : isInactive
                    ? MerkenTheme.borderLight
                    : MerkenTheme.solidInk
        let shadowColor = isCorrectAnswer
            ? quizCorrectFill
            : isWrongAnswer
                ? quizWrongFill
                : isInactive
                    ? MerkenTheme.borderLight
                    : MerkenTheme.solidInk
        let textColor = isFeedback ? MerkenTheme.solidInk : isInactive ? MerkenTheme.mutedText : MerkenTheme.solidInk
        let badgeFill = isCorrectAnswer ? quizCorrectFill : isWrongAnswer ? quizWrongFill : MerkenTheme.surface
        let badgeBorder = isFeedback ? MerkenTheme.solidInk : borderColor
        let badgeText = isFeedback ? Color.white : MerkenTheme.solidInk
        let feedbackIconColor = isCorrectAnswer ? quizCorrectFill : quizWrongFill

        return Button {
            guard !revealed else { return }
            viewModel.answer(index: index, projectId: project.id, using: appState)
        } label: {
            HStack(spacing: 11) {
                Text(optionLabels[index])
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(badgeText)
                    .frame(width: 28, height: 28)
                    .background(badgeFill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(badgeBorder, lineWidth: MerkenSolid.borderWidth)
                    )

                Text(current.options[index])
                    .font(.system(size: 15, weight: isFeedback ? .black : .medium))
                    .foregroundStyle(textColor)
                    .lineLimit(3)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if isCorrectAnswer {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(feedbackIconColor)
                } else if isWrongAnswer {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(feedbackIconColor)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(faceColor, in: .rect(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(borderColor, lineWidth: isFeedback ? 2.2 : MerkenSolid.borderWidth)
            )
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(shadowColor)
                    .offset(x: MerkenSolid.smallOffset.width, y: MerkenSolid.smallOffset.height)
            )
        }
        .buttonStyle(.plain)
        .disabled(revealed)
        .accessibilityIdentifier("quizOption_\(index)")
    }

    // MARK: - Result

    private var resultAccuracy: Double {
        guard !viewModel.questions.isEmpty else { return 0 }
        return Double(viewModel.correctCount) / Double(viewModel.questions.count)
    }

    private var resultPercentage: Int {
        Int(round(resultAccuracy * 100))
    }

    private var incorrectCount: Int {
        max(viewModel.questions.count - viewModel.correctCount, 0)
    }

    private var isReviewSession: Bool {
        skipSetup || preloadedWords != nil
    }

    private var resultHeading: String {
        isReviewSession ? "復習完了" : "クイズ完了"
    }

    private var resultAccentColor: Color {
        if resultAccuracy >= 1 {
            return MerkenTheme.success
        }
        if resultAccuracy >= 0.8 {
            return MerkenTheme.accentBlue
        }
        if resultAccuracy >= 0.6 {
            return MerkenTheme.warning
        }
        return MerkenTheme.danger
    }

    private var resultStatusLabel: String {
        if resultAccuracy >= 1 {
            return "全問正解です。このまま次の復習へ進めます。"
        }
        if resultAccuracy >= 0.8 {
            return "かなり定着しています。もう一度回すとさらに安定します。"
        }
        if resultAccuracy >= 0.6 {
            return "仕上がりは半歩手前です。間違えた語を見直しましょう。"
        }
        return "まだ揺れています。今のうちにもう一度回すのが効きます。"
    }

    private var resultPrimaryActionLabel: String {
        isReviewSession ? "もう一度復習する" : "もう一度挑戦する"
    }

    private func completionMessage(percentage: Int) -> String {
        if percentage == 100 {
            return "パーフェクトです。次の復習までこの感覚を保てます。"
        } else if percentage >= 80 {
            return "かなり良い仕上がりです。このままもう一周で定着します。"
        } else if percentage >= 60 {
            return "あと少しです。間違えた語だけ見直すと伸びます。"
        } else {
            return "今が復習のしどころです。続けて回すと取り戻せます。"
        }
    }

    private var resultMetricColumns: [GridItem] {
        [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10)
        ]
    }

    private var resultView: some View {
        VStack(spacing: 0) {
            HStack {
                SolidIconButton(systemImage: "xmark", size: 36) {
                    dismiss()
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)

            Spacer()

            VStack(spacing: 14) {
                SolidSurface(tone: .surface, depth: .standard, cornerRadius: 18, padding: 24, alignment: .center) {
                    VStack(spacing: 14) {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 34, weight: .bold))
                            .foregroundStyle(MerkenTheme.success)
                            .frame(width: 76, height: 76)
                            .background(MerkenTheme.success.opacity(0.08), in: .circle)

                        VStack(spacing: 5) {
                            Text(resultHeading)
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(MerkenTheme.solidInk)

                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text("\(resultPercentage)")
                                    .font(.system(size: 48, weight: .bold, design: .monospaced))
                                    .foregroundStyle(resultAccentColor)
                                Text("%")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(resultAccentColor)
                            }
                            .accessibilityIdentifier("quizResultScore")

                            Text("\(viewModel.questions.count)問中 \(viewModel.correctCount)問正解")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                        .multilineTextAlignment(.center)

                        Text(completionMessage(percentage: resultPercentage))
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .multilineTextAlignment(.center)
                            .lineSpacing(3)

                        LazyVGrid(columns: resultMetricColumns, spacing: 10) {
                            resultMetricTile(icon: "checkmark.circle.fill", tint: MerkenTheme.success, value: "\(viewModel.correctCount)", label: "正解")
                            resultMetricTile(icon: "xmark.circle.fill", tint: MerkenTheme.danger, value: "\(incorrectCount)", label: "不正解")
                        }
                    }
                }

                if let errorMessage = viewModel.errorMessage {
                    SolidSurface(tone: .warning, depth: .small, cornerRadius: 14, borderColor: MerkenTheme.warning, shadowColor: MerkenTheme.warning, padding: 12) {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.warning)
                    }
                }

                Button {
                    Task {
                        await viewModel.restart(projectId: project.id, using: appState)
                    }
                } label: {
                    Label(resultPrimaryActionLabel, systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SolidButtonStyle(.inverse, size: .medium, expands: true, cornerRadius: 14))
                .accessibilityIdentifier("restartQuizAction")

                Button {
                    dismiss()
                } label: {
                    Text("単語一覧に戻る")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SolidButtonStyle(.surface, size: .medium, expands: true, cornerRadius: 14))
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 390)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            if viewModel.correctCount == viewModel.questions.count && !viewModel.questions.isEmpty {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }

    private var resultHeroCard: some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 14) {
                    resultProgressRing

                    VStack(alignment: .leading, spacing: 4) {
                        Text(resultHeading)
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(viewModel.correctCount)")
                                .font(.system(size: 32, weight: .bold))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.65)
                                .foregroundStyle(resultAccentColor)

                            Text("/ \(viewModel.questions.count) 正解")
                                .font(.system(size: 16, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .foregroundStyle(MerkenTheme.primaryText)
                        }
                        .accessibilityIdentifier("quizResultScore")

                        Text(resultStatusLabel)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 0)
                }

                Text(completionMessage(percentage: resultPercentage))
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(MerkenTheme.primaryText)

                HStack(spacing: 10) {
                    resultHighlightPill(
                        icon: "square.grid.2x2.fill",
                        tint: MerkenTheme.accentBlue,
                        label: "出題 \(viewModel.questions.count)問"
                    )

                    resultHighlightPill(
                        icon: incorrectCount == 0 ? "checkmark.circle.fill" : "arrow.uturn.backward.circle.fill",
                        tint: incorrectCount == 0 ? MerkenTheme.success : MerkenTheme.warning,
                        label: incorrectCount == 0 ? "見直し不要" : "見直し \(incorrectCount)問"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 22)
            .frame(minHeight: 188)
        }
    }

    private var resultBreakdownCard: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("今回の記録")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)

                LazyVGrid(columns: resultMetricColumns, spacing: 10) {
                    resultMetricTile(
                        icon: "checkmark.circle.fill",
                        tint: MerkenTheme.success,
                        value: "\(viewModel.correctCount)",
                        label: "正解"
                    )
                    resultMetricTile(
                        icon: "xmark.circle.fill",
                        tint: MerkenTheme.danger,
                        value: "\(incorrectCount)",
                        label: "不正解"
                    )
                    resultMetricTile(
                        icon: "square.grid.2x2.fill",
                        tint: MerkenTheme.accentBlue,
                        value: "\(viewModel.questions.count)",
                        label: "出題数"
                    )
                    resultMetricTile(
                        icon: "percent",
                        tint: resultAccentColor,
                        value: "\(resultPercentage)%",
                        label: "正答率"
                    )
                }
            }
        }
    }

    private var resultProgressRing: some View {
        ZStack {
            Circle()
                .stroke(MerkenTheme.borderLight, lineWidth: 6)

            Circle()
                .trim(from: 0, to: max(0, min(resultAccuracy, 1)))
                .stroke(
                    resultAccentColor,
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 1) {
                Text("\(resultPercentage)%")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .monospacedDigit()
                Text("正答率")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
        .frame(width: 84, height: 84)
    }

    private func resultMetricTile(icon: String, tint: Color, value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 28, height: 28)
                    .background(tint.opacity(0.12), in: .circle)
                Spacer(minLength: 0)
            }

            Text(value)
                .font(.system(size: 22, weight: .bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(MerkenTheme.primaryText)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.border.opacity(0.7), lineWidth: 1)
        )
    }

    private func resultHighlightPill(icon: String, tint: Color, label: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(MerkenTheme.surfaceAlt, in: .capsule)
        .overlay(
            Capsule()
                .stroke(MerkenTheme.border.opacity(0.7), lineWidth: 1)
        )
    }
}

// MARK: - TypeInField (Web TypeInQuizField parity)

private struct TypeInField: View {
    let answer: String
    @Binding var value: String
    let onSubmit: () -> Void

    @FocusState private var isFocused: Bool

    private let slotFont = Font.system(size: 20, weight: .bold)
    private let slotWidth: CGFloat = 14

    var body: some View {
        let target = Array(answer)
        let n = target.count
        let typed = Array(value.prefix(n))
        let t = typed.count

        ZStack {
            TextField("", text: limitedBinding(max: n))
                .focused($isFocused)
                .font(slotFont)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.done)
                .onSubmit(onSubmit)
                .opacity(0)
                .frame(width: 0, height: 0)
                .allowsHitTesting(false)

            HStack(spacing: 4) {
                ForEach(0..<t, id: \.self) { i in
                    Text(String(typed[i]))
                        .font(slotFont)
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(minWidth: slotWidth)
                }

                if t < n {
                    if isFocused {
                        Rectangle()
                            .fill(MerkenTheme.solidInk)
                            .frame(width: 2, height: 24)
                    }

                    if t == 0, let first = target.first {
                        Text(String(first).lowercased())
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText.opacity(0.5))
                            .frame(minWidth: slotWidth)
                    }

                    let remaining = max(n - t - 1, 0)
                    ForEach(0..<remaining, id: \.self) { _ in
                        Text("_")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText.opacity(0.35))
                            .frame(minWidth: slotWidth)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, minHeight: 56)
        }
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isFocused ? MerkenTheme.solidInk : MerkenTheme.borderLight, lineWidth: MerkenSolid.borderWidth)
        )
        .contentShape(Rectangle())
        .onTapGesture { isFocused = true }
        .onAppear { isFocused = true }
    }

    private func limitedBinding(max n: Int) -> Binding<String> {
        Binding(
            get: { value },
            set: { newValue in
                value = n > 0 ? String(newValue.prefix(n)) : newValue
            }
        )
    }
}
