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

    private let swipeThreshold: CGFloat = 50

    var body: some View {
        ZStack {
            // Back face
            (japaneseFirst ? englishFace : japaneseFace)
                .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                .opacity(isFlipped ? 1 : 0)

            // Front face
            (japaneseFirst ? japaneseFace : englishFace)
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
        .gesture(
            DragGesture()
                .onChanged { value in
                    dragOffset = value.translation.width
                }
                .onEnded { value in
                    let translation = value.translation.width
                    if translation > swipeThreshold {
                        swipeAway(direction: 1, action: onSwipeRight)
                    } else if translation < -swipeThreshold {
                        swipeAway(direction: -1, action: onSwipeLeft)
                    } else {
                        withAnimation(.spring(response: 0.3)) {
                            dragOffset = 0
                        }
                    }
                }
        )
        .onTapGesture {
            onTap()
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: isFlipped)
        .onChange(of: word.id) {
            dragOffset = 0
            exitOffset = 0
            exitOpacity = 1
        }
    }

    // MARK: - English face

    private var englishFace: some View {
        VStack(spacing: 12) {
            Spacer()
            Text(word.english)
                .font(.largeTitle.bold())
                .foregroundStyle(MerkenTheme.primaryText)
                .multilineTextAlignment(.center)

            if let pronunciation = word.pronunciation, !pronunciation.isEmpty {
                Text(pronunciation)
                    .font(.callout)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Text("タップして裏面を見る")
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
                .padding(.top, 4)
            Spacer()
        }
        .padding(24)
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

    // MARK: - Japanese face

    private var japaneseFace: some View {
        VStack(spacing: 12) {
            Spacer()
            Text(word.japanese)
                .font(.title.bold())
                .foregroundStyle(MerkenTheme.primaryText)
                .multilineTextAlignment(.center)

            if let example = word.exampleSentence, !example.isEmpty {
                VStack(spacing: 6) {
                    Text(example)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)

                    if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                        Text(exampleJa)
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.top, 8)
            }

            Text(word.english)
                .font(.callout)
                .foregroundStyle(MerkenTheme.mutedText)
                .padding(.top, 4)
            Spacer()
        }
        .padding(24)
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

    // MARK: - Swipe animation

    private func swipeAway(direction: CGFloat, action: @escaping () -> Void) {
        withAnimation(.easeOut(duration: 0.25)) {
            exitOffset = direction * 400
            exitOpacity = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            exitOffset = 0
            exitOpacity = 1
            dragOffset = 0
            action()
        }
    }
}
