import Foundation
import AVFoundation

@MainActor
final class TinderSortViewModel: ObservableObject {
    enum Stage { case sorting, results }

    @Published private(set) var stage: Stage = .sorting
    @Published private(set) var currentIndex = 0
    @Published private(set) var knownWords: [Word] = []
    @Published private(set) var unknownWords: [Word] = []

    private var words: [Word] = []
    private let synthesizer = AVSpeechSynthesizer()

    var totalCount: Int { words.count }
    var processedCount: Int { knownWords.count + unknownWords.count }
    var remainingCount: Int { totalCount - processedCount }
    var progress: Double { totalCount > 0 ? Double(processedCount) / Double(totalCount) : 0 }

    var currentWord: Word? {
        currentIndex < words.count ? words[currentIndex] : nil
    }

    /// Next 2 cards for stack preview
    var upcomingWords: [Word] {
        let start = currentIndex + 1
        let end = min(start + 2, words.count)
        guard start < end else { return [] }
        return Array(words[start..<end])
    }

    func setup(words: [Word]) {
        self.words = words.shuffled()
        currentIndex = 0
        knownWords = []
        unknownWords = []
        stage = .sorting
    }

    func markKnown() {
        guard let word = currentWord else { return }
        knownWords.append(word)
        advance()
    }

    func markUnknown() {
        guard let word = currentWord else { return }
        unknownWords.append(word)
        advance()
    }

    func speak() {
        guard let word = currentWord else { return }
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: word.english)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        synthesizer.speak(utterance)
    }

    func restart() {
        setup(words: words)
    }

    private func advance() {
        currentIndex += 1
        if currentIndex >= words.count {
            stage = .results
        }
    }
}
