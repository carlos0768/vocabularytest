import SwiftUI

struct TinderSortView: View {
    let project: Project
    let words: [Word]
    var onFlashcardUnknown: (([Word]) -> Void)?

    @StateObject private var viewModel = TinderSortViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .sorting:
                sortingView
            case .results:
                resultsView
            }
        }
        .navigationTitle("仕分け")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.setup(words: words)
        }
    }

    // MARK: - Sorting View

    private var sortingView: some View {
        VStack(spacing: 16) {
            // Progress header
            VStack(spacing: 8) {
                HStack {
                    Text("残り \(viewModel.remainingCount) 語")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                    Spacer()
                    HStack(spacing: 12) {
                        Label("\(viewModel.knownWords.count)", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Label("\(viewModel.unknownWords.count)", systemImage: "xmark.circle.fill")
                            .foregroundStyle(MerkenTheme.danger)
                    }
                    .font(.system(size: 13, weight: .medium))
                }

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(MerkenTheme.border)
                            .frame(height: 3)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(MerkenTheme.accentBlue)
                            .frame(width: geo.size.width * viewModel.progress, height: 3)
                            .animation(MerkenSpring.gentle, value: viewModel.progress)
                    }
                }
                .frame(height: 3)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            // Card stack
            ZStack {
                // Background cards (stack effect)
                ForEach(Array(viewModel.upcomingWords.enumerated().reversed()), id: \.element.id) { offset, word in
                    TinderCardPlaceholder(word: word)
                        .scaleEffect(1.0 - CGFloat(offset + 1) * 0.05)
                        .offset(y: CGFloat(offset + 1) * 8)
                        .zIndex(Double(-offset))
                }

                // Active card
                if let word = viewModel.currentWord {
                    TinderCard(
                        word: word,
                        onSwipeRight: {
                            MerkenHaptic.success()
                            viewModel.markKnown()
                        },
                        onSwipeLeft: {
                            MerkenHaptic.light()
                            viewModel.markUnknown()
                        }
                    )
                    .zIndex(10)
                    .id(word.id)
                }
            }
            .padding(.horizontal, 24)

            Spacer(minLength: 0)

            // Hint
            HStack(spacing: 32) {
                VStack(spacing: 4) {
                    Image(systemName: "arrow.left")
                        .foregroundStyle(MerkenTheme.danger)
                    Text("知らない")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
                VStack(spacing: 4) {
                    Image(systemName: "arrow.right")
                        .foregroundStyle(.green)
                    Text("知ってる")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
            .padding(.bottom, 24)
        }
    }

    // MARK: - Results View

    private var resultsView: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("仕分け完了！")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            // Stats
            HStack(spacing: 32) {
                resultStat(
                    count: viewModel.knownWords.count,
                    label: "知ってる",
                    color: .green,
                    icon: "checkmark.circle.fill"
                )
                resultStat(
                    count: viewModel.unknownWords.count,
                    label: "知らない",
                    color: MerkenTheme.danger,
                    icon: "xmark.circle.fill"
                )
            }

            // Percentage
            if viewModel.totalCount > 0 {
                let pct = Int(Double(viewModel.knownWords.count) / Double(viewModel.totalCount) * 100)
                Text("理解度: \(pct)%")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer()

            // Action buttons
            VStack(spacing: 12) {
                if !viewModel.unknownWords.isEmpty {
                    Button {
                        onFlashcardUnknown?(viewModel.unknownWords)
                    } label: {
                        Label("知らない単語でフラッシュカード", systemImage: "rectangle.on.rectangle")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(MerkenTheme.accentBlue, in: RoundedRectangle(cornerRadius: 14))
                    }
                }

                Button {
                    viewModel.restart()
                } label: {
                    Label("もう一度", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(MerkenTheme.border, lineWidth: 1.5))
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

    private func resultStat(count: Int, label: String, color: Color, icon: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 36))
                .foregroundStyle(color)
            Text("\(count)")
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundStyle(MerkenTheme.primaryText)
            Text(label)
                .font(.caption)
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }
}

// MARK: - Tinder Card

struct TinderCard: View {
    let word: Word
    let onSwipeRight: () -> Void
    let onSwipeLeft: () -> Void

    @State private var offset: CGFloat = 0
    @State private var exitOffset: CGFloat = 0
    @State private var opacity: Double = 1

    private let threshold: CGFloat = 80

    private var rotationAngle: Double {
        Double(offset) * 0.06
    }

    private var swipeProgress: CGFloat {
        min(abs(offset) / threshold, 1.0)
    }

    var body: some View {
        ZStack {
            // Card content
            VStack(spacing: 16) {
                Spacer()

                Text(word.english)
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)

                if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                    Text(pronunciation)
                        .font(.system(.callout, design: .monospaced))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(MerkenTheme.border, lineWidth: 2))

            // Swipe overlay
            if offset > 10 {
                // Right = known (green)
                RoundedRectangle(cornerRadius: 24)
                    .fill(.green.opacity(0.15 * swipeProgress))
                    .overlay(
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.green.opacity(swipeProgress))
                    )
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
            } else if offset < -10 {
                // Left = unknown (red)
                RoundedRectangle(cornerRadius: 24)
                    .fill(MerkenTheme.danger.opacity(0.15 * swipeProgress))
                    .overlay(
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(MerkenTheme.danger.opacity(swipeProgress))
                    )
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
            }
        }
        .offset(x: exitOffset != 0 ? exitOffset : offset)
        .opacity(opacity)
        .rotationEffect(.degrees(rotationAngle))
        .gesture(
            DragGesture()
                .onChanged { value in
                    offset = value.translation.width
                }
                .onEnded { value in
                    let velocity = value.predictedEndTranslation.width - value.translation.width
                    if offset > threshold || velocity > 400 {
                        swipeAway(direction: 1, action: onSwipeRight)
                    } else if offset < -threshold || velocity < -400 {
                        swipeAway(direction: -1, action: onSwipeLeft)
                    } else {
                        withAnimation(MerkenSpring.snappy) {
                            offset = 0
                        }
                    }
                }
        )
    }

    private func swipeAway(direction: CGFloat, action: @escaping () -> Void) {
        withAnimation(.easeOut(duration: 0.25)) {
            exitOffset = direction * 500
            opacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            action()
        }
    }
}

// MARK: - Placeholder card for stack

struct TinderCardPlaceholder: View {
    let word: Word

    var body: some View {
        VStack {
            Spacer()
            Text(word.english)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(MerkenTheme.mutedText)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .background(MerkenTheme.surface.opacity(0.8), in: .rect(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(MerkenTheme.border, lineWidth: 1))
    }
}
