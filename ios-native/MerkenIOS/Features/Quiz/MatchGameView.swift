import SwiftUI

struct MatchGameView: View {
    let project: Project
    let words: [Word]

    @StateObject private var viewModel = MatchGameViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .start:
                startView
            case .playing:
                playingView
            case .roundComplete:
                roundCompleteView
            case .results:
                resultsView
            }
        }
        .navigationTitle("マッチ")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.setup(words: words, projectId: project.id)
        }
    }

    // MARK: - Start

    private var startView: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "square.grid.2x2")
                .font(.system(size: 60))
                .foregroundStyle(.purple)

            Text("マッチ")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            Text("英単語と日本語訳のペアを\nできるだけ速くマッチさせよう！")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)

            VStack(spacing: 8) {
                Text("\(words.count)語 → \(viewModel.totalRounds)ラウンド")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)

                if viewModel.bestTime > 0 {
                    Text("ベストタイム: \(formatTime(viewModel.bestTime))")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
            }

            Spacer()

            Button {
                MerkenHaptic.medium()
                viewModel.startGame()
            } label: {
                Text("スタート")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(.purple, in: RoundedRectangle(cornerRadius: 16))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Playing

    private var playingView: some View {
        VStack(spacing: 0) {
            // Timer header
            HStack {
                // Close / back handled by nav

                Spacer()

                // Timer (centered)
                Text(formatTime(viewModel.totalTime))
                    .font(.system(size: 20, weight: .bold, design: .monospaced))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .contentTransition(.numericText())

                Spacer()

                // Floating penalty or round info
                ZStack {
                    if viewModel.floatingPenalty {
                        Text("+1.0秒")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(MerkenTheme.danger)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    } else if viewModel.totalRounds > 1 {
                        Text("R\(viewModel.currentRound + 1)/\(viewModel.totalRounds)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
                .frame(width: 60)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .animation(MerkenSpring.snappy, value: viewModel.floatingPenalty)

            // Card grid — fill remaining screen
            GeometryReader { geo in
                let totalCards = viewModel.cards.count
                let cols = gridColumns(for: totalCards)
                let rows = Int(ceil(Double(totalCards) / Double(cols)))
                let hSpacing: CGFloat = 8
                let vSpacing: CGFloat = 8
                let cardWidth = (geo.size.width - CGFloat(cols + 1) * hSpacing) / CGFloat(cols)
                let cardHeight = (geo.size.height - CGFloat(rows + 1) * vSpacing) / CGFloat(rows)

                let columns = Array(repeating: GridItem(.flexible(), spacing: hSpacing), count: cols)

                LazyVGrid(columns: columns, spacing: vSpacing) {
                    ForEach(viewModel.cards) { card in
                        MatchCardView(
                            card: card,
                            isSelected: viewModel.selectedCardId == card.id,
                            isMismatch: viewModel.mismatchIds.contains(card.id),
                            cardHeight: cardHeight
                        ) {
                            viewModel.tapCard(card)
                        }
                    }
                }
                .padding(.horizontal, hSpacing)
            }
        }
    }

    private func gridColumns(for count: Int) -> Int {
        if count <= 8 { return 2 }
        return 3
    }

    // MARK: - Round Complete

    private var roundCompleteView: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("ラウンド\(viewModel.currentRound + 1) クリア！")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            Text("タイム: \(formatTime(viewModel.totalTime))")
                .font(.system(size: 18, weight: .medium, design: .monospaced))
                .foregroundStyle(MerkenTheme.secondaryText)

            Spacer()

            Button {
                MerkenHaptic.medium()
                viewModel.nextRound()
            } label: {
                Text("次のラウンド →")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(.purple, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Results

    private var resultsView: some View {
        VStack(spacing: 24) {
            Spacer()

            if viewModel.isNewBest {
                Text("🎉")
                    .font(.system(size: 60))
                Text("新記録！")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.orange)
            }

            Text("完了！")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            // Total time (big)
            Text(formatTime(viewModel.totalTime))
                .font(.system(size: 48, weight: .bold, design: .monospaced))
                .foregroundStyle(.purple)

            // Breakdown
            VStack(spacing: 8) {
                HStack {
                    Text("実タイム")
                        .foregroundStyle(MerkenTheme.secondaryText)
                    Spacer()
                    Text(formatTime(viewModel.elapsedTime))
                        .foregroundStyle(MerkenTheme.primaryText)
                }
                HStack {
                    Text("ペナルティ")
                        .foregroundStyle(MerkenTheme.secondaryText)
                    Spacer()
                    Text("+\(formatTime(viewModel.penaltyTime))（\(viewModel.penaltyCount)回ミス）")
                        .foregroundStyle(viewModel.penaltyCount > 0 ? MerkenTheme.danger : MerkenTheme.secondaryText)
                }
            }
            .font(.system(size: 15, weight: .medium))
            .padding(.horizontal, 32)

            Spacer()

            VStack(spacing: 12) {
                Button {
                    MerkenHaptic.medium()
                    viewModel.setup(words: words, projectId: project.id)
                    viewModel.startGame()
                } label: {
                    Label("もう一度", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(.purple, in: RoundedRectangle(cornerRadius: 14))
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

    // MARK: - Helpers

    private func formatTime(_ time: Double) -> String {
        String(format: "%.1f秒", time)
    }
}

// MARK: - Match Card View

struct MatchCardView: View {
    let card: MatchGameViewModel.Card
    let isSelected: Bool
    let isMismatch: Bool
    var cardHeight: CGFloat = 56
    let onTap: () -> Void

    @State private var shakeOffset: CGFloat = 0

    var body: some View {
        Button {
            onTap()
        } label: {
            Text(card.text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(
                    card.isMatched ? .clear :
                    isMismatch ? .white :
                    isSelected ? .white :
                    MerkenTheme.primaryText
                )
                .minimumScaleFactor(0.5)
                .lineLimit(3)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity)
                .frame(height: cardHeight)
                .background(
                    card.isMatched ? Color.clear :
                    isMismatch ? MerkenTheme.danger :
                    isSelected ? MerkenTheme.accentBlue :
                    card.isEnglish ? MerkenTheme.surface : MerkenTheme.surface,
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            card.isMatched ? Color.clear :
                            isMismatch ? MerkenTheme.danger :
                            isSelected ? MerkenTheme.accentBlue :
                            card.isEnglish ? MerkenTheme.accentBlue.opacity(0.3) : MerkenTheme.border,
                            lineWidth: isSelected ? 2.5 : 1.5
                        )
                )
                .shadow(
                    color: card.isMatched ? .clear : MerkenTheme.border.opacity(0.4),
                    radius: 0, y: 2
                )
                .scaleEffect(card.isMatched ? 0.01 : isSelected ? 1.05 : 1.0)
                .opacity(card.isMatched ? 0 : 1)
                .offset(x: shakeOffset)
        }
        .disabled(card.isMatched)
        .animation(MerkenSpring.tap, value: isSelected)
        .animation(MerkenSpring.bouncy, value: card.isMatched)
        .onChange(of: isMismatch) {
            if isMismatch {
                shake()
            }
        }
    }

    private func shake() {
        let duration = 0.06
        withAnimation(.linear(duration: duration)) { shakeOffset = 8 }
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            withAnimation(.linear(duration: duration)) { shakeOffset = -8 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 2) {
            withAnimation(.linear(duration: duration)) { shakeOffset = 6 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 3) {
            withAnimation(.linear(duration: duration)) { shakeOffset = -4 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 4) {
            withAnimation(.linear(duration: duration)) { shakeOffset = 0 }
        }
    }
}
