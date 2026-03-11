import SwiftUI

struct FlashcardCardView: View {
    let word: Word
    let isFlipped: Bool
    var japaneseFirst: Bool = false
    let onTap: () -> Void
    let onSwipeLeft: () -> Void
    let onSwipeRight: () -> Void

    @State private var dragOffset: CGFloat = 0
    @State private var exitOffset: CGFloat = 0
    @State private var exitOpacity: Double = 1
    @State private var cardAppearScale: CGFloat = 0.85
    @State private var cardAppearOpacity: Double = 0

    private let swipeThreshold: CGFloat = 50

    var body: some View {
        ZStack {
            // Back face
            Group {
                if japaneseFirst { englishRichFace } else { japaneseRichFace }
            }
            .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            .opacity(isFlipped ? 1 : 0)

            // Front face
            Group {
                if japaneseFirst { japaneseFrontFace } else { englishFrontFace }
            }
            .opacity(isFlipped ? 0 : 1)
        }
        .rotation3DEffect(
            .degrees(isFlipped ? 180 : 0),
            axis: (x: 0, y: 1, z: 0),
            perspective: 0.5
        )
        .offset(x: exitOffset != 0 ? exitOffset : dragOffset)
        .opacity(exitOpacity)
        .rotationEffect(.degrees(Double(dragOffset) * 0.03))
        .scaleEffect(dragOffset == 0 ? 1.0 : 0.97)
        .gesture(isFlipped ? nil : swipeGesture)
        .onTapGesture {
            MerkenHaptic.light()
            onTap()
        }
        .animation(MerkenSpring.flip, value: isFlipped)
        .animation(MerkenSpring.snappy, value: dragOffset != 0)
        .scaleEffect(cardAppearScale)
        .opacity(cardAppearOpacity)
        .onAppear {
            withAnimation(MerkenSpring.bouncy) {
                cardAppearScale = 1.0
                cardAppearOpacity = 1.0
            }
        }
        .onChange(of: word.id) {
            // Reset card entrance
            cardAppearScale = 0.9
            cardAppearOpacity = 0.3
            withAnimation(MerkenSpring.snappy) {
                cardAppearScale = 1.0
                cardAppearOpacity = 1.0
            }
            dragOffset = 0
            exitOffset = 0
            exitOpacity = 1
        }
    }

    // MARK: - Mastery Level

    private var masteryInfo: (level: Int, label: String, color: Color) {
        let rep = word.repetition
        if rep == 0 { return (0, "新規", MerkenTheme.mutedText) }
        if rep <= 2 { return (1, "学習中", .orange) }
        if rep <= 5 { return (2, "定着中", MerkenTheme.accentBlue) }
        return (3, "マスター", .green)
    }

    // MARK: - Front: English

    private var englishFrontFace: some View {
        cardBase {
            VStack(spacing: 12) {
                Spacer()

                // Mastery dots
                masteryDots

                Text(word.english)
                    .font(.largeTitle.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.5)

                if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                    Text(pronunciation)
                        .font(.system(.callout, design: .monospaced))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                // Part of speech tags
                if let tags = word.partOfSpeechTags, !tags.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(tags, id: \.self) { tag in
                            Text(tag)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(MerkenTheme.accentBlue)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(MerkenTheme.accentBlue.opacity(0.12), in: Capsule())
                        }
                    }
                }

                Spacer()

                Text("タップして裏面を見る")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(24)
        }
    }

    // MARK: - Front: Japanese

    private var japaneseFrontFace: some View {
        cardBase {
            VStack(spacing: 12) {
                Spacer()

                Text(word.japanese)
                    .font(.title.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.5)

                Spacer()

                Text("タップして英語を表示")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(24)
        }
    }

    // MARK: - Rich Back: Japanese (default back)

    private var japaneseRichFace: some View {
        richCardBase {
            GeometryReader { geo in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        VStack(spacing: 12) {
                            Text(word.japanese)
                                .font(.title.bold())
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.center)
                                .staggerIn(index: 0, isVisible: true)

                            VStack(spacing: 4) {
                                Text(word.english)
                                    .font(.callout)
                                    .foregroundStyle(.white.opacity(0.5))

                                if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                                    Text(pronunciation)
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundStyle(.white.opacity(0.4))
                                }
                            }
                            .staggerIn(index: 1, isVisible: true)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: max(geo.size.height * 0.42, 220), alignment: .center)

                        // Supplemental info below
                        dividerLine
                            .staggerIn(index: 1, isVisible: true)

                    // Example sentence
                    if let example = word.exampleSentence, !example.isEmpty {
                        infoSection(title: "例文", index: 2) {
                            Text(highlightedExample(example))
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.9))
                                .lineSpacing(4)

                            if let exJa = word.exampleSentenceJa, !exJa.isEmpty {
                                Text(exJa)
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.5))
                                    .padding(.top, 2)
                            }
                        }
                    }

                    // Related words
                    if let related = word.relatedWords, !related.isEmpty {
                        infoSection(title: "関連語", index: 3) {
                            FlashcardFlowLayout(spacing: 8) {
                                ForEach(related.prefix(6), id: \.term) { rw in
                                    HStack(spacing: 4) {
                                        Text(rw.term)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.9))
                                        if !rw.relation.isEmpty {
                                            Text("(\(rw.relation))")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white.opacity(0.4))
                                        }
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(.white.opacity(0.15), in: Capsule())
                                }
                            }
                        }
                    }

                    // Usage patterns
                    if let patterns = word.usagePatterns, !patterns.isEmpty {
                        infoSection(title: "用法", index: 4) {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(patterns.prefix(3), id: \.pattern) { up in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(up.pattern)
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(.white.opacity(0.9))
                                        Text(up.meaningJa)
                                            .font(.system(size: 12))
                                            .foregroundStyle(.white.opacity(0.5))
                                    }
                                }
                            }
                        }
                    }

                    // Learning stats
                    if word.lastReviewedAt != nil || word.repetition > 0 {
                        learningStats
                            .staggerIn(index: 5, isVisible: true)
                    }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .top)
                }
                .simultaneousGesture(swipeGesture)
            }
        }
    }

    // MARK: - Rich Back: English (for jp-first mode)

    private var englishRichFace: some View {
        richCardBase {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    Text(word.english)
                        .font(.largeTitle.bold())
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .staggerIn(index: 0, isVisible: true)

                    if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                        Text(pronunciation)
                            .font(.system(.callout, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.6))
                            .staggerIn(index: 1, isVisible: true)
                    }

                    Text(word.japanese)
                        .font(.callout)
                        .foregroundStyle(.white.opacity(0.5))
                        .staggerIn(index: 1, isVisible: true)

                    dividerLine
                        .staggerIn(index: 1, isVisible: true)

                    // Same rich content as japanese back
                    if let example = word.exampleSentence, !example.isEmpty {
                        infoSection(title: "例文", index: 2) {
                            Text(highlightedExample(example))
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.9))
                                .lineSpacing(4)

                            if let exJa = word.exampleSentenceJa, !exJa.isEmpty {
                                Text(exJa)
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.5))
                                    .padding(.top, 2)
                            }
                        }
                    }

                    if let related = word.relatedWords, !related.isEmpty {
                        infoSection(title: "関連語", index: 3) {
                            FlashcardFlowLayout(spacing: 8) {
                                ForEach(related.prefix(6), id: \.term) { rw in
                                    HStack(spacing: 4) {
                                        Text(rw.term)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.9))
                                        if !rw.relation.isEmpty {
                                            Text("(\(rw.relation))")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white.opacity(0.4))
                                        }
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(.white.opacity(0.15), in: Capsule())
                                }
                            }
                        }
                    }

                    if let patterns = word.usagePatterns, !patterns.isEmpty {
                        infoSection(title: "用法", index: 4) {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(patterns.prefix(3), id: \.pattern) { up in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(up.pattern)
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(.white.opacity(0.9))
                                        Text(up.meaningJa)
                                            .font(.system(size: 12))
                                            .foregroundStyle(.white.opacity(0.5))
                                    }
                                }
                            }
                        }
                    }

                    if word.lastReviewedAt != nil || word.repetition > 0 {
                        learningStats
                            .staggerIn(index: 5, isVisible: true)
                    }

                    Spacer(minLength: 8)
                }
                .padding(24)
                .padding(.top, 4)
            }
            .simultaneousGesture(swipeGesture)
        }
    }

    // MARK: - Shared Components

    private var masteryDots: some View {
        let info = masteryInfo
        return HStack(spacing: 4) {
            ForEach(0..<4, id: \.self) { i in
                Circle()
                    .fill(i <= info.level ? info.color : MerkenTheme.border)
                    .frame(width: 6, height: 6)
            }
            Text(info.label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(info.color)
                .padding(.leading, 2)
        }
    }

    private var dividerLine: some View {
        RoundedRectangle(cornerRadius: 1)
            .fill(.white.opacity(0.2))
            .frame(width: 40, height: 2)
    }

    private var learningStats: some View {
        HStack(spacing: 12) {
            Label("\(word.repetition)回正答", systemImage: "checkmark.circle")
            if let lastReview = word.lastReviewedAt {
                Label(formatDate(lastReview), systemImage: "clock")
            }
        }
        .font(.system(size: 11))
        .foregroundStyle(.white.opacity(0.35))
    }

    private func infoSection<Content: View>(title: String, index: Int, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.4))
                .textCase(.uppercase)
                .tracking(1.5)

            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .staggerIn(index: index, isVisible: true)
    }

    // MARK: - Card Bases

    private func cardBase<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(MerkenTheme.border, lineWidth: 2))
            .background(
                RoundedRectangle(cornerRadius: 24)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
    }

    private func richCardBase<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .background(
                LinearGradient(
                    colors: [MerkenTheme.accentBlue, MerkenTheme.accentBlue.opacity(0.85)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: .rect(cornerRadius: 24)
            )
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.15), lineWidth: 1))
            .shadow(color: MerkenTheme.accentBlue.opacity(0.3), radius: 12, y: 6)
    }

    // MARK: - Helpers

    private func highlightedExample(_ text: String) -> AttributedString {
        var attributed = AttributedString(text)
        if let range = attributed.range(of: word.english, options: .caseInsensitive) {
            attributed[range].font = .system(size: 15, weight: .bold)
            attributed[range].foregroundColor = .white
        }
        return attributed
    }

    private func formatDate(_ date: Date) -> String {
        let df = DateFormatter()
        df.dateFormat = "M/d"
        return df.string(from: date)
    }

    private var swipeGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard abs(value.translation.width) >= abs(value.translation.height) else { return }
                dragOffset = value.translation.width
            }
            .onEnded { value in
                let translation = value.translation.width
                let vertical = value.translation.height
                let velocity = value.predictedEndTranslation.width - translation

                guard abs(translation) >= abs(vertical) else {
                    withAnimation(MerkenSpring.snappy) {
                        dragOffset = 0
                    }
                    return
                }

                if translation > swipeThreshold || velocity > 300 {
                    MerkenHaptic.light()
                    swipeAway(direction: 1, action: onSwipeRight)
                } else if translation < -swipeThreshold || velocity < -300 {
                    MerkenHaptic.light()
                    swipeAway(direction: -1, action: onSwipeLeft)
                } else {
                    withAnimation(MerkenSpring.snappy) {
                        dragOffset = 0
                    }
                }
            }
    }

    // MARK: - Swipe animation

    private func swipeAway(direction: CGFloat, action: @escaping () -> Void) {
        withAnimation(.easeOut(duration: 0.2)) {
            exitOffset = direction * 400
            exitOpacity = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            exitOffset = 0
            exitOpacity = 1
            dragOffset = 0
            action()
        }
    }
}

// MARK: - Flow Layout (for tags/chips)

struct FlashcardFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
        }

        return (CGSize(width: maxX, height: y + rowHeight), positions)
    }
}
