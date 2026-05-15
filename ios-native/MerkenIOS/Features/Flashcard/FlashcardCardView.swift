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
        if rep == 0 { return (0, "新規", MerkenTheme.success) }
        if rep <= 2 { return (1, "学習中", MerkenTheme.success) }
        if rep <= 5 { return (2, "定着中", MerkenTheme.success) }
        return (3, "マスター", MerkenTheme.success)
    }

    // MARK: - Front: English

    private var englishFrontFace: some View {
        frontFace(
            primary: word.english,
            pronunciation: word.pronunciation,
            showsSpeakButton: true,
            hint: "タップで意味を見る"
        )
    }

    // MARK: - Front: Japanese

    private var japaneseFrontFace: some View {
        frontFace(
            primary: word.japanese,
            pronunciation: nil,
            showsSpeakButton: false,
            hint: "タップで英語を見る"
        )
    }

    // MARK: - Rich Back: Japanese (default back)

    private var japaneseRichFace: some View {
        backFace(primary: word.japanese, secondary: word.english, pronunciation: word.pronunciation)
    }

    // MARK: - Rich Back: English (for jp-first mode)

    private var englishRichFace: some View {
        backFace(primary: word.english, secondary: word.japanese, pronunciation: word.pronunciation)
    }

    // MARK: - Shared Components

    private var primaryPartOfSpeech: String? {
        guard let first = word.partOfSpeechTags?.first?.trimmingCharacters(in: .whitespacesAndNewlines),
              !first.isEmpty else {
            return nil
        }
        return first.uppercased()
    }

    private var statusLabel: String {
        switch word.status {
        case .new: return "未学習"
        case .review: return "学習中"
        case .mastered: return "習得"
        }
    }

    private var statusColor: Color {
        switch word.status {
        case .new: return MerkenTheme.mutedText
        case .review: return MerkenTheme.chartBlue
        case .mastered: return MerkenTheme.success
        }
    }

    private func frontFace(
        primary: String,
        pronunciation: String?,
        showsSpeakButton: Bool,
        hint: String
    ) -> some View {
        cardBase {
            VStack(spacing: 0) {
                HStack(alignment: .top) {
                    posBadge
                    Spacer(minLength: 12)
                    favoriteIndicator
                }

                Spacer(minLength: 18)

                VStack(spacing: 10) {
                    Text(pronunciation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "")
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(height: 16)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Text(primary)
                        .font(.system(size: primary.count > 16 ? 34 : 40, weight: .black, design: .rounded))
                        .foregroundStyle(MerkenTheme.solidInk)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .minimumScaleFactor(0.55)

                    if showsSpeakButton {
                        speakPill
                            .padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity)

                Spacer(minLength: 18)

                Rectangle()
                    .fill(MerkenTheme.border.opacity(0.65))
                    .frame(height: 1)
                    .padding(.bottom, 12)

                HStack(alignment: .center) {
                    masteryDots(onDark: false)
                    Spacer(minLength: 10)
                    statusBadge
                }

                Text(hint)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .padding(.top, 10)
            }
            .padding(.horizontal, 18)
            .padding(.top, 22)
            .padding(.bottom, 18)
        }
    }

    private func backFace(primary: String, secondary: String, pronunciation: String?) -> some View {
        richCardBase {
            GeometryReader { geo in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        Spacer(minLength: 10)

                        VStack(spacing: 12) {
                            Text(primary)
                                .font(.system(size: 30, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.center)
                                .lineLimit(4)
                                .minimumScaleFactor(0.62)

                            Text(secondary)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.6))
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .minimumScaleFactor(0.75)

                            if let pronunciation = trimmed(pronunciation) {
                                Text(pronunciation)
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundStyle(.white.opacity(0.5))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }

                            if let example = trimmed(word.exampleSentence) {
                                exampleBox(example: example, exampleJa: trimmed(word.exampleSentenceJa))
                                    .padding(.top, 4)
                            }
                        }
                        .frame(maxWidth: .infinity)

                        Spacer(minLength: 18)

                        Rectangle()
                            .fill(.white.opacity(0.1))
                            .frame(height: 1)
                            .padding(.bottom, 12)

                        HStack {
                            masteryDots(onDark: true)
                        }
                        .frame(maxWidth: .infinity)

                        Text("タップで戻る")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.5))
                            .padding(.top, 10)
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 22)
                    .padding(.bottom, 18)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .center)
                }
                .simultaneousGesture(swipeGesture)
            }
        }
    }

    private var posBadge: some View {
        Group {
            if let primaryPartOfSpeech {
                Text(primaryPartOfSpeech)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .tracking(0.35)
                    .foregroundStyle(MerkenTheme.solidInk)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .stroke(MerkenTheme.solidBorder, lineWidth: 1)
                    )
            } else {
                Color.clear.frame(width: 1, height: 22)
            }
        }
    }

    private var favoriteIndicator: some View {
        Image(systemName: word.isFavorite ? "bookmark.fill" : "bookmark")
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(word.isFavorite ? MerkenTheme.accentGreen : MerkenTheme.mutedText)
            .frame(width: 30, height: 28, alignment: .topTrailing)
    }

    private var speakPill: some View {
        HStack(spacing: 6) {
            Image(systemName: "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
            Text("発音")
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(MerkenTheme.solidInk)
        .padding(.horizontal, 13)
        .padding(.vertical, 7)
        .solidSurface(tone: .surface, depth: .small, cornerRadius: 18)
    }

    private var statusBadge: some View {
        Text(statusLabel)
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .foregroundStyle(statusColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(MerkenTheme.surface, in: Capsule())
            .overlay(Capsule().stroke(statusColor, lineWidth: 1))
    }

    private func masteryDots(onDark: Bool) -> some View {
        let info = masteryInfo
        return HStack(spacing: 5) {
            Text("MASTERY")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .tracking(0.35)
                .foregroundStyle(onDark ? .white.opacity(0.5) : MerkenTheme.mutedText)
                .padding(.trailing, 2)

            ForEach(0..<4, id: \.self) { i in
                Circle()
                    .fill(i < info.level ? info.color : (onDark ? .white.opacity(0.16) : MerkenTheme.solidInk.opacity(0.08)))
                    .frame(width: 10, height: 10)
                    .overlay(
                        Circle()
                            .stroke(i < info.level ? info.color : (onDark ? .white.opacity(0.2) : MerkenTheme.border), lineWidth: 1)
                    )
            }
        }
    }

    // MARK: - Card Bases

    private func cardBase<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)

        return content()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .background(MerkenTheme.notebookPaper, in: shape)
            .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.5))
            .background(shape.fill(MerkenTheme.solidShadow).offset(x: 4, y: 4))
    }

    private func richCardBase<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)

        return content()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .background(MerkenTheme.solidShadow, in: shape)
            .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.5))
            .background(shape.fill(.black.opacity(0.3)).offset(x: 4, y: 4))
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

    private func exampleBox(example: String, exampleJa: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("例文")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(.white.opacity(0.5))
                .textCase(.uppercase)

            Text(highlightedExample(example))
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(.white.opacity(0.9))
                .lineSpacing(4)

            if let exampleJa {
                Text(exampleJa)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineSpacing(3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
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
