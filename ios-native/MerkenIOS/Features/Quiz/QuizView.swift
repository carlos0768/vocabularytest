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
                    if viewModel.loading || viewModel.preparingQuiz {
                        ProgressView()
                    } else {
                        playView
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
                        // Mode badge
                        if viewModel.isActiveVocab {
                            Text("Active — タイプ入力")
                                .font(.caption.bold())
                                .foregroundStyle(MerkenTheme.accentBlue)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 4)
                                .background(MerkenTheme.accentBlueLight, in: .capsule)
                        } else {
                            Text("英→日")
                                .font(.caption.bold())
                                .foregroundStyle(MerkenTheme.accentBlue)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 4)
                                .background(MerkenTheme.accentBlueLight, in: .capsule)
                        }

                        // Word (Active shows japanese, passive shows english)
                        VStack(spacing: 10) {
                            Text(viewModel.isActiveVocab ? current.word.japanese : current.word.english)
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .multilineTextAlignment(.center)

                            Button {
                                Task {
                                    await viewModel.toggleFavorite(projectId: project.id, using: appState)
                                }
                            } label: {
                                Image(systemName: current.word.isFavorite ? "bookmark.fill" : "bookmark")
                                    .font(.title3)
                                    .foregroundStyle(current.word.isFavorite ? MerkenTheme.danger : MerkenTheme.mutedText)
                            }
                        }
                        .padding(.vertical, 12)

                        // Active: typing input / Passive: 4-choice options
                        if viewModel.isActiveVocab {
                            activeTypingSection(current: current)
                        } else {
                            VStack(spacing: 10) {
                                ForEach(current.options.indices, id: \.self) { index in
                                    optionButton(index: index, current: current)
                                }
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

                if viewModel.isRevealed {
                    Button {
                        viewModel.moveNext(projectId: project.id, using: appState)
                    } label: {
                        HStack(spacing: 8) {
                            Text("次へ")
                                .font(.system(size: 19, weight: .semibold, design: .serif))
                            Image(systemName: "chevron.right")
                                .font(.system(size: 19, weight: .semibold, design: .serif))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 19)
                        .padding(.vertical, 14)
                        .background(
                            MerkenTheme.accentBlue,
                            in: .rect(cornerRadius: 20)
                        )
                        .overlay(alignment: .bottom) {
                            UnevenRoundedRectangle(bottomLeadingRadius: 20, bottomTrailingRadius: 20)
                                .fill(MerkenTheme.accentBlueStrong)
                                .frame(height: 3)
                        }
                        .clipShape(.rect(cornerRadius: 20))
                        .contentShape(.rect(cornerRadius: 20))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .accessibilityIdentifier("nextQuestionAction")
                }
            }
        }
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
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            viewModel.typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? MerkenTheme.border
                                : MerkenTheme.accentBlue,
                            in: .rect(cornerRadius: 16)
                        )
                }
                .disabled(viewModel.typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } else {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: viewModel.typingCorrect == true ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(viewModel.typingCorrect == true ? MerkenTheme.success : MerkenTheme.danger)

                    Text(viewModel.typingCorrect == true ? "正解" : "不正解")
                        .font(.headline.bold())
                        .foregroundStyle(viewModel.typingCorrect == true ? MerkenTheme.success : MerkenTheme.danger)
                }

                if viewModel.typingCorrect != true {
                    VStack(spacing: 4) {
                        Text("あなたの回答")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text(viewModel.typedAnswer)
                            .font(.body)
                            .foregroundStyle(MerkenTheme.danger)
                            .strikethrough()
                    }
                }

                VStack(spacing: 4) {
                    Text("正解")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                    Text(current.word.english)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(MerkenTheme.success)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 20)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        viewModel.typingCorrect == true ? MerkenTheme.success : MerkenTheme.danger,
                        lineWidth: 2
                    )
            )
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
        VStack {
            Spacer()

            VStack(spacing: 16) {
                resultBreakdownCard

                if let errorMessage = viewModel.errorMessage {
                    SolidCard {
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.warning)
                    }
                }

                HStack(spacing: 10) {
                    Button {
                        dismiss()
                    } label: {
                        Text("終了する")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GhostGlassButton())

                    Button {
                        Task {
                            await viewModel.restart(projectId: project.id, using: appState)
                        }
                    } label: {
                        Text("次へ行く")
                    }
                    .buttonStyle(PrimaryGlassButton())
                    .accessibilityIdentifier("restartQuizAction")
                }
            }
            .padding(16)

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

    private let slotFont = Font.system(size: 20, weight: .black)
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
                            .fill(Color.blue)
                            .frame(width: 2, height: 24)
                    }

                    if t == 0, let first = target.first {
                        Text(String(first).lowercased())
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText.opacity(0.5))
                            .frame(minWidth: slotWidth)
                    }

                    let remaining = t == 0 ? max(n - 1, 0) : max(n - t - 1, 0)
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
                .stroke(isFocused ? MerkenTheme.primaryText : MerkenTheme.borderLight, lineWidth: 2)
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
