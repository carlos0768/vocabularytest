import SwiftUI

struct TimeAttackView: View {
    let project: Project
    let words: [Word]

    @StateObject private var viewModel = TimeAttackViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .setup:
                setupView
            case .playing:
                playingView
            case .results:
                resultsView
            }
        }
        .navigationTitle("タイムアタック")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.setup(words: words)
        }
    }

    // MARK: - Setup

    private var setupView: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon
            Image(systemName: "timer")
                .font(.system(size: 60))
                .foregroundStyle(MerkenTheme.accentBlue)

            Text("タイムアタック")
                .font(.system(size: 28, weight: .bold, design: .serif))
                .foregroundStyle(MerkenTheme.primaryText)

            Text("制限時間内にできるだけ多く正解しよう！")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)

            // Duration picker
            VStack(spacing: 12) {
                Text("制限時間")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)

                HStack(spacing: 12) {
                    ForEach(TimeAttackViewModel.TimerDuration.allCases, id: \.rawValue) { duration in
                        Button {
                            MerkenHaptic.light()
                            viewModel.selectedDuration = duration
                        } label: {
                            Text(duration.label)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(
                                    viewModel.selectedDuration == duration ? .white : MerkenTheme.secondaryText
                                )
                                .frame(width: 80, height: 44)
                                .background(
                                    viewModel.selectedDuration == duration
                                        ? MerkenTheme.accentBlue
                                        : MerkenTheme.surface,
                                    in: RoundedRectangle(cornerRadius: 12)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(MerkenTheme.border, lineWidth: 1.5)
                                )
                        }
                    }
                }
            }

            if viewModel.bestScore > 0 {
                Text("ベストスコア: \(viewModel.bestScore)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer()

            // Start button
            Button {
                MerkenHaptic.medium()
                viewModel.start()
            } label: {
                Text("スタート")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(MerkenTheme.accentBlue, in: RoundedRectangle(cornerRadius: 16))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Playing

    private var playingView: some View {
        VStack(spacing: 20) {
            // Timer
            ZStack {
                // Background circle
                Circle()
                    .stroke(MerkenTheme.border, lineWidth: 8)
                    .frame(width: 100, height: 100)

                // Progress circle
                Circle()
                    .trim(from: 0, to: viewModel.progress)
                    .stroke(
                        viewModel.timerColor,
                        style: StrokeStyle(lineWidth: 8, lineCap: .round)
                    )
                    .frame(width: 100, height: 100)
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.05), value: viewModel.progress)

                // Time text
                Text("\(Int(ceil(viewModel.timeRemaining)))")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(viewModel.timerColor)
                    .contentTransition(.numericText())
            }

            // Score
            Text("スコア: \(viewModel.score)")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(MerkenTheme.primaryText)

            Spacer()

            // Question card
            if let word = viewModel.currentWord {
                VStack(spacing: 24) {
                    Text(word.english)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)

                    // 4 choices in 2x2 grid
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(viewModel.choices, id: \.self) { choice in
                            let isAnswered = viewModel.lastAnsweredChoice == choice
                            let isCorrectAnswer = choice == word.japanese
                            let showCorrect = viewModel.lastAnsweredChoice != nil && isCorrectAnswer
                            let showWrong = isAnswered && !viewModel.lastAnswerCorrect

                            Button {
                                guard viewModel.lastAnsweredChoice == nil else { return }
                                MerkenHaptic.light()
                                viewModel.answer(choice)
                            } label: {
                                Text(choice)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(
                                        showCorrect ? .white :
                                        showWrong ? .white :
                                        MerkenTheme.primaryText
                                    )
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(
                                        showCorrect ? Color.green :
                                        showWrong ? MerkenTheme.danger :
                                        MerkenTheme.surface,
                                        in: RoundedRectangle(cornerRadius: 14)
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(
                                                showCorrect ? Color.green :
                                                showWrong ? MerkenTheme.danger :
                                                MerkenTheme.border,
                                                lineWidth: 1.5
                                            )
                                    )
                                    .shadow(color: MerkenTheme.border.opacity(0.5), radius: 0, y: 2)
                                    .scaleEffect(isAnswered ? 0.95 : 1.0)
                            }
                            .animation(MerkenSpring.tap, value: viewModel.lastAnsweredChoice)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }

            Spacer()
        }
        .padding(.top, 16)
    }

    // MARK: - Results

    private var resultsView: some View {
        VStack(spacing: 24) {
            Spacer()

            if viewModel.isNewBest {
                // Celebration
                Text("🎉")
                    .font(.system(size: 60))
                Text("新記録！")
                    .font(.system(size: 24, weight: .bold, design: .serif))
                    .foregroundStyle(.orange)
            }

            Text("タイムアップ！")
                .font(.system(size: 28, weight: .bold, design: .serif))
                .foregroundStyle(MerkenTheme.primaryText)

            // Stats
            VStack(spacing: 16) {
                HStack(spacing: 32) {
                    statItem(value: "\(viewModel.score)", label: "正解数", color: .green)
                    statItem(value: "\(viewModel.totalAnswered)", label: "出題数", color: MerkenTheme.accentBlue)
                }

                HStack(spacing: 32) {
                    statItem(
                        value: String(format: "%.1f秒", viewModel.averageTime),
                        label: "平均回答",
                        color: MerkenTheme.secondaryText
                    )
                    if viewModel.totalAnswered > 0 {
                        let pct = Int(Double(viewModel.score) / Double(viewModel.totalAnswered) * 100)
                        statItem(value: "\(pct)%", label: "正答率", color: .orange)
                    }
                }
            }
            .padding(.vertical, 16)

            Spacer()

            // Actions
            VStack(spacing: 12) {
                Button {
                    MerkenHaptic.medium()
                    viewModel.restart()
                } label: {
                    Label("もう一度", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(MerkenTheme.accentBlue, in: RoundedRectangle(cornerRadius: 14))
                }

                Button {
                    dismiss()
                } label: {
                    Text("閉じる")
                        .font(.system(size: 15))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }

    private func statItem(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(color)
            Text(label)
                .font(.caption)
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }
}
