import SwiftUI

struct SentenceQuizQuestionView: View {
    let question: SentenceQuizQuestion
    let questionNumber: Int
    let totalQuestions: Int
    let progress: Double
    let isRevealed: Bool
    let selectedAnswer: String?
    let onAnswer: (String, Bool) -> Void
    let onNext: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                switch question {
                case .fillInBlank(let q):
                    fillInBlankView(q)
                case .multiFillInBlank(let q):
                    multiFillInBlankView(q)
                case .wordOrder(let q):
                    wordOrderView(q)
                }
            }
            .padding(16)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Fill-in-blank

    private func fillInBlankView(_ q: FillInBlankQuestion) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            questionHeader

            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(highlightedSentence(q.sentence))
                        .font(.title3.bold())
                        .foregroundStyle(.white)

                    Text(q.japaneseMeaning)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            if let blank = q.primaryBlank {
                optionsList(
                    options: blank.options,
                    correctAnswer: blank.correctAnswer
                )
            }

            nextButton
        }
    }

    // MARK: - Multi-fill-in-blank (simplified to target blank only)

    private func multiFillInBlankView(_ q: MultiFillInBlankQuestion) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            questionHeader

            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(highlightedSentence(q.sentence))
                        .font(.title3.bold())
                        .foregroundStyle(.white)

                    Text(q.japaneseMeaning)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)

                    Text("「\(q.targetWord)」の意味の空欄を選んでください")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }

            if let blank = q.targetBlank {
                optionsList(
                    options: blank.options,
                    correctAnswer: blank.correctAnswer
                )
            }

            nextButton
        }
    }

    // MARK: - Word-order

    @State private var selectedWords: [String] = []
    @State private var isWordOrderRevealed = false
    @State private var isWordOrderCorrect = false

    private func wordOrderView(_ q: WordOrderQuestion) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            questionHeader

            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("以下の単語を正しい順番に並び替えてください")
                        .font(.headline)
                        .foregroundStyle(.white)

                    Text(q.japaneseMeaning)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }

            // Selected words display
            if !selectedWords.isEmpty {
                GlassPane {
                    FlowLayout(spacing: 8) {
                        ForEach(Array(selectedWords.enumerated()), id: \.offset) { index, word in
                            Text(word)
                                .font(.body.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    Capsule().fill(
                                        isWordOrderRevealed
                                            ? (isWordOrderCorrect
                                               ? MerkenTheme.success.opacity(0.2)
                                               : MerkenTheme.danger.opacity(0.2))
                                            : MerkenTheme.accentBlue.opacity(0.3)
                                    )
                                )
                                .onTapGesture {
                                    guard !isRevealed, !isWordOrderRevealed else { return }
                                    selectedWords.remove(at: index)
                                }
                        }
                    }
                }
            }

            // Available word chips
            if !isWordOrderRevealed {
                let remaining = q.shuffledWords.filter { word in
                    let selectedCount = selectedWords.filter { $0 == word }.count
                    let totalCount = q.shuffledWords.filter { $0 == word }.count
                    return selectedCount < totalCount
                }

                FlowLayout(spacing: 8) {
                    ForEach(Array(remaining.enumerated()), id: \.offset) { _, word in
                        Text(word)
                            .font(.body)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(.white.opacity(0.08)))
                            .onTapGesture {
                                selectedWords.append(word)
                            }
                    }
                }
            }

            // Submit / Result
            if isWordOrderRevealed {
                GlassCard {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Image(systemName: isWordOrderCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(isWordOrderCorrect ? MerkenTheme.success : MerkenTheme.danger)
                            Text(isWordOrderCorrect ? "正解！" : "不正解")
                                .font(.headline)
                                .foregroundStyle(isWordOrderCorrect ? MerkenTheme.success : MerkenTheme.danger)
                        }

                        if !isWordOrderCorrect {
                            Text("正解: \(q.correctOrder.joined(separator: " "))")
                                .font(.subheadline)
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                    }
                }

                Text("次の問題")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 16).fill(MerkenTheme.accentBlue.opacity(0.5)))
                    .onTapGesture { onNext() }
            } else if selectedWords.count == q.shuffledWords.count {
                Text("回答する")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 16).fill(MerkenTheme.accentBlue.opacity(0.5)))
                    .onTapGesture {
                        let correct = selectedWords == q.correctOrder
                        isWordOrderCorrect = correct
                        isWordOrderRevealed = true
                        onAnswer(selectedWords.joined(separator: " "), correct)
                    }
            }
        }
        .onChange(of: question.id) {
            selectedWords = []
            isWordOrderRevealed = false
            isWordOrderCorrect = false
        }
    }

    // MARK: - Shared Components

    private var questionHeader: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("問題 \(questionNumber) / \(totalQuestions)")
                    .foregroundStyle(MerkenTheme.secondaryText)
                ProgressView(value: progress)
                    .tint(MerkenTheme.accentBlue)
            }
        }
    }

    private func optionsList(options: [String], correctAnswer: String) -> some View {
        VStack(spacing: 10) {
            ForEach(options, id: \.self) { option in
                optionButton(option: option, correctAnswer: correctAnswer)
            }
        }
    }

    private func optionButton(option: String, correctAnswer: String) -> some View {
        let isCorrect = option == correctAnswer
        let isSelected = selectedAnswer == option

        let fillColor: Color = {
            guard isRevealed else { return .white.opacity(0.06) }
            if isCorrect { return MerkenTheme.success.opacity(0.15) }
            if isSelected { return MerkenTheme.danger.opacity(0.15) }
            return .white.opacity(0.06)
        }()

        let borderColor: Color = {
            guard isRevealed else { return .white.opacity(0.10) }
            if isCorrect { return MerkenTheme.success.opacity(0.9) }
            if isSelected { return MerkenTheme.danger.opacity(0.9) }
            return .white.opacity(0.10)
        }()

        return HStack(spacing: 10) {
            Text(option)
                .foregroundStyle(.white)
                .lineLimit(3)
                .truncationMode(.tail)
            Spacer()
            if isRevealed && isCorrect {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(MerkenTheme.success)
            }
            if isRevealed && isSelected && !isCorrect {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(MerkenTheme.danger)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14).fill(fillColor))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(borderColor, lineWidth: isRevealed ? 1.5 : 1))
        .onTapGesture {
            guard !isRevealed else { return }
            onAnswer(option, option == correctAnswer)
        }
    }

    @ViewBuilder
    private var nextButton: some View {
        if isRevealed {
            Text("次の問題")
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 16).fill(MerkenTheme.accentBlue.opacity(0.5)))
                .onTapGesture { onNext() }
        }
    }

    // MARK: - Helpers

    private func highlightedSentence(_ sentence: String) -> AttributedString {
        var result = AttributedString(sentence)
        // Highlight ___ portions with accent color
        while let range = result.range(of: "___") {
            result[range].foregroundColor = MerkenTheme.accentBlue
            result[range].underlineStyle = .single
        }
        return result
    }
}

// MARK: - FlowLayout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(subviews: subviews, containerWidth: proposal.width ?? .infinity)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(subviews: subviews, containerWidth: bounds.width)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: ProposedViewSize(result.sizes[index])
            )
        }
    }

    private struct LayoutResult {
        var positions: [CGPoint]
        var sizes: [CGSize]
        var size: CGSize
    }

    private func layout(subviews: Subviews, containerWidth: CGFloat) -> LayoutResult {
        var positions: [CGPoint] = []
        var sizes: [CGSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            sizes.append(size)

            if x + size.width > containerWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }

            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxWidth = max(maxWidth, x)
        }

        return LayoutResult(
            positions: positions,
            sizes: sizes,
            size: CGSize(width: maxWidth, height: y + rowHeight)
        )
    }
}
