import Foundation
import AVFoundation
import OSLog

@MainActor
final class FlashcardViewModel: ObservableObject {
    enum Stage {
        case loading
        case viewing
        case empty
    }

    // ── UI-driving state ──
    @Published private(set) var stage: Stage = .loading
    @Published private(set) var currentIndex = 0
    @Published private(set) var isFlipped = false
    @Published private(set) var wordCount = 0
    @Published var japaneseFirst = false
    @Published var slowSpeed = false
    @Published var errorMessage: String?

    // ── Non-published backing store ──
    private var words: [Word] = []
    private let logger = Logger(subsystem: "MerkenIOS", category: "FlashcardVM")
    private let synthesizer = AVSpeechSynthesizer()

    init(initialWords: [Word]? = nil) {
        if let initialWords, !initialWords.isEmpty {
            setWords(initialWords)
        } else {
            stage = .loading
        }
    }

    var currentWord: Word? {
        words.indices.contains(currentIndex) ? words[currentIndex] : nil
    }

    var hasNext: Bool {
        currentIndex + 1 < words.count
    }

    var hasPrevious: Bool {
        currentIndex > 0
    }

    func setWords(_ preloaded: [Word]) {
        let prioritized = QuizEngine.sortByStudyPriority(preloaded)
        words = prioritized
        wordCount = prioritized.count
        currentIndex = 0
        isFlipped = false
        stage = prioritized.isEmpty ? .empty : .viewing
    }

    func load(projectId: String, using state: AppState) async {
        if words.isEmpty {
            stage = .loading
        }
        errorMessage = nil

        do {
            let fetched = try await state.activeRepository.fetchWords(projectId: projectId)
            let prioritized = QuizEngine.sortByStudyPriority(fetched)
            words = prioritized
            wordCount = prioritized.count
            currentIndex = 0
            isFlipped = false
            stage = prioritized.isEmpty ? .empty : .viewing
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            stage = words.isEmpty ? .empty : .viewing
            logger.error("Flashcard load failed: \(error.localizedDescription)")
        }
    }

    func goNext() {
        guard hasNext else { return }
        currentIndex += 1
        isFlipped = false
    }

    func goPrevious() {
        guard hasPrevious else { return }
        currentIndex -= 1
        isFlipped = false
    }

    func flipCard() {
        isFlipped.toggle()
    }

    func speak() {
        guard let word = currentWord else { return }
        synthesizer.stopSpeaking(at: .immediate)

        let utterance = AVSpeechUtterance(string: word.english)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = slowSpeed
            ? AVSpeechUtteranceDefaultSpeechRate * 0.5
            : AVSpeechUtteranceDefaultSpeechRate * 0.9
        synthesizer.speak(utterance)
    }

    func toggleSpeed() {
        slowSpeed.toggle()
    }

    func toggleFavorite(using state: AppState) async {
        guard let word = currentWord else { return }
        let newValue = !word.isFavorite

        do {
            try await state.activeRepository.updateWord(
                id: word.id,
                patch: WordPatch(isFavorite: newValue)
            )

            // Update in-memory
            words[currentIndex] = Word(
                id: word.id,
                projectId: word.projectId,
                english: word.english,
                japanese: word.japanese,
                distractors: word.distractors,
                exampleSentence: word.exampleSentence,
                exampleSentenceJa: word.exampleSentenceJa,
                pronunciation: word.pronunciation,
                status: word.status,
                createdAt: word.createdAt,
                lastReviewedAt: word.lastReviewedAt,
                nextReviewAt: word.nextReviewAt,
                easeFactor: word.easeFactor,
                intervalDays: word.intervalDays,
                repetition: word.repetition,
                isFavorite: newValue
            )
            // Trigger re-render by bumping wordCount (same value but objectWillChange fires)
            objectWillChange.send()
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Toggle favorite failed: \(error.localizedDescription)")
        }
    }

    func toggleDirection() {
        japaneseFirst.toggle()
        isFlipped = false
    }

    func shuffle() {
        words.shuffle()
        currentIndex = 0
        isFlipped = false
        wordCount = words.count
    }

    func editWord(english: String, japanese: String, using state: AppState) async {
        guard let word = currentWord else { return }
        do {
            try await state.activeRepository.updateWord(
                id: word.id,
                patch: WordPatch(english: english, japanese: japanese)
            )
            words[currentIndex] = Word(
                id: word.id,
                projectId: word.projectId,
                english: english,
                japanese: japanese,
                distractors: word.distractors,
                exampleSentence: word.exampleSentence,
                exampleSentenceJa: word.exampleSentenceJa,
                pronunciation: word.pronunciation,
                status: word.status,
                createdAt: word.createdAt,
                lastReviewedAt: word.lastReviewedAt,
                nextReviewAt: word.nextReviewAt,
                easeFactor: word.easeFactor,
                intervalDays: word.intervalDays,
                repetition: word.repetition,
                isFavorite: word.isFavorite
            )
            objectWillChange.send()
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Edit word failed: \(error.localizedDescription)")
        }
    }

    var dictionaryURL: URL? {
        guard let word = currentWord else { return nil }
        let encoded = word.english.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word.english
        return URL(string: "https://eow.alc.co.jp/search?q=\(encoded)")
    }

    func deleteWord(using state: AppState) async {
        guard let word = currentWord else { return }

        do {
            try await state.activeRepository.deleteWord(id: word.id)
            words.remove(at: currentIndex)
            wordCount = words.count

            if words.isEmpty {
                stage = .empty
            } else if currentIndex >= words.count {
                currentIndex = words.count - 1
            }
            isFlipped = false
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("Delete word failed: \(error.localizedDescription)")
        }
    }
}
