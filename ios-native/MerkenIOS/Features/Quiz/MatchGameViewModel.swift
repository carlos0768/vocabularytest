import Foundation
import Combine
import OSLog
import SwiftUI

@MainActor
final class MatchGameViewModel: ObservableObject {
    enum Stage { case start, playing, roundComplete, results }

    struct Card: Identifiable {
        let id = UUID()
        let text: String
        let wordId: String
        let isEnglish: Bool
        var isMatched = false
    }

    // ── State ──
    @Published private(set) var stage: Stage = .start
    @Published private(set) var cards: [Card] = []
    @Published private(set) var selectedCardId: UUID? = nil
    @Published private(set) var mismatchIds: Set<UUID> = []
    @Published private(set) var elapsedTime: Double = 0
    @Published private(set) var penaltyTime: Double = 0
    @Published private(set) var penaltyCount = 0
    @Published private(set) var currentRound = 0
    @Published private(set) var totalRounds = 0
    @Published private(set) var matchedPairs = 0
    @Published private(set) var totalPairsInRound = 0
    @Published private(set) var bestTime: Double = 0
    @Published private(set) var floatingPenalty = false

    private var rounds: [[Word]] = []
    private var projectId: String = ""
    private var timer: AnyCancellable?
    private var words: [Word] = []
    private var wordsById: [String: Word] = [:]
    private var mismatchCounts: [String: Int] = [:]
    private var quizStatsStore: QuizStatsStore?
    private var persistWordPatch: (@Sendable (String, WordPatch) async throws -> Void)?
    private var notifyDataChange: (@MainActor @Sendable () -> Void)?
    private var hasBroadcastDataChange = false
    private let logger = Logger(subsystem: "MerkenIOS", category: "MatchGameVM")

    var totalTime: Double { elapsedTime + penaltyTime }
    var isNewBest: Bool { bestTime == 0 || totalTime < bestTime }

    // MARK: - Setup

    func setup(
        words: [Word],
        projectId: String,
        quizStatsStore: QuizStatsStore? = nil,
        persistWordPatch: (@Sendable (String, WordPatch) async throws -> Void)? = nil,
        notifyDataChange: (@MainActor @Sendable () -> Void)? = nil
    ) {
        self.words = words
        self.wordsById = Dictionary(uniqueKeysWithValues: words.map { ($0.id, $0) })
        self.projectId = projectId
        self.quizStatsStore = quizStatsStore
        self.persistWordPatch = persistWordPatch
        self.notifyDataChange = notifyDataChange
        self.hasBroadcastDataChange = false
        loadBestTime()
        prepareRounds()
    }

    func restartGame() {
        prepareRounds()
        startGame()
    }

    private func prepareRounds() {
        // Shuffle and chunk into rounds of 6
        let shuffled = words.shuffled()
        rounds = stride(from: 0, to: shuffled.count, by: 6).map {
            Array(shuffled[$0..<min($0 + 6, shuffled.count)])
        }
        // Filter out rounds with < 2 pairs (not playable)
        rounds = rounds.filter { $0.count >= 2 }
        totalRounds = rounds.count
        currentRound = 0
        stage = .start
    }

    func startGame() {
        elapsedTime = 0
        penaltyTime = 0
        penaltyCount = 0
        currentRound = 0
        matchedPairs = 0
        mismatchCounts = [:]
        loadRound(index: 0)
        startTimer()
        stage = .playing
    }

    func nextRound() {
        currentRound += 1
        if currentRound < rounds.count {
            loadRound(index: currentRound)
            stage = .playing
        } else {
            endGame()
        }
    }

    // MARK: - Card Tap

    func tapCard(_ card: Card) {
        guard stage == .playing else { return }
        guard !card.isMatched else { return }
        guard !mismatchIds.contains(card.id) else { return }

        if let selectedId = selectedCardId {
            // Second tap
            if selectedId == card.id {
                // Deselect
                selectedCardId = nil
                return
            }

            guard let first = cards.first(where: { $0.id == selectedId }) else {
                selectedCardId = card.id
                return
            }

            // Check match: same wordId but different type (en vs jp)
            if first.wordId == card.wordId && first.isEnglish != card.isEnglish {
                // Correct match!
                MerkenHaptic.success()
                markMatched(first.id, card.id)
                applyMatchReviewSignal(for: card.wordId)
                selectedCardId = nil
                matchedPairs += 1

                // Check round complete
                if cards.allSatisfy({ $0.isMatched }) {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                        self?.roundComplete()
                    }
                }
            } else {
                // Wrong match
                MerkenHaptic.error()
                penaltyTime += 1.0
                penaltyCount += 1
                mismatchCounts[first.wordId, default: 0] += 1
                mismatchCounts[card.wordId, default: 0] += 1
                showMismatch(first.id, card.id)
                selectedCardId = nil
            }
        } else {
            // First tap
            MerkenHaptic.selection()
            selectedCardId = card.id
        }
    }

    // MARK: - Private

    private func loadRound(index: Int) {
        guard index < rounds.count else { return }
        let roundWords = rounds[index]
        totalPairsInRound = roundWords.count
        selectedCardId = nil
        mismatchIds = []

        // Create card pairs: 1 english + 1 japanese per word
        var newCards: [Card] = []
        for word in roundWords {
            newCards.append(Card(text: word.english, wordId: word.id, isEnglish: true))
            newCards.append(Card(text: word.japanese, wordId: word.id, isEnglish: false))
        }
        cards = newCards.shuffled()
    }

    private func applyMatchReviewSignal(for wordId: String) {
        guard let word = wordsById[wordId] else { return }

        let mismatchCount = mismatchCounts[wordId, default: 0]
        let patch = QuizEngine.statusPatchForMatch(for: word, mismatchCount: mismatchCount)
        apply(patch, to: wordId)

        guard let persistWordPatch else { return }

        Task { [weak self] in
            guard let self else { return }

            do {
                try await persistWordPatch(wordId, patch)
                if !self.hasBroadcastDataChange {
                    self.hasBroadcastDataChange = true
                    self.notifyDataChange?()
                }
            } catch {
                if error.isCancellationError { return }
                self.logger.error("Match review patch persist failed: \(error.localizedDescription)")
            }
        }
    }

    private func apply(_ patch: WordPatch, to wordId: String) {
        guard let index = words.firstIndex(where: { $0.id == wordId }) else { return }

        var updated = words[index]
        if let status = patch.status {
            updated.status = status
        }
        if let lastReviewedAt = patch.lastReviewedAt {
            updated.lastReviewedAt = lastReviewedAt
        }
        if let nextReviewAt = patch.nextReviewAt {
            updated.nextReviewAt = nextReviewAt
        }
        if let easeFactor = patch.easeFactor {
            updated.easeFactor = easeFactor
        }
        if let intervalDays = patch.intervalDays {
            updated.intervalDays = intervalDays
        }
        if let repetition = patch.repetition {
            updated.repetition = repetition
        }

        words[index] = updated
        wordsById[wordId] = updated
    }

    private func markMatched(_ id1: UUID, _ id2: UUID) {
        if let i = cards.firstIndex(where: { $0.id == id1 }) {
            cards[i].isMatched = true
        }
        if let i = cards.firstIndex(where: { $0.id == id2 }) {
            cards[i].isMatched = true
        }
    }

    private func showMismatch(_ id1: UUID, _ id2: UUID) {
        mismatchIds = [id1, id2]
        floatingPenalty = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.mismatchIds = []
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.floatingPenalty = false
        }
    }

    private func roundComplete() {
        if currentRound + 1 >= rounds.count {
            endGame()
        } else {
            stage = .roundComplete
        }
    }

    private func startTimer() {
        timer?.cancel()
        timer = Timer.publish(every: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.elapsedTime += 0.1
            }
    }

    private func endGame() {
        timer?.cancel()
        timer = nil
        stage = .results
        if bestTime == 0 || totalTime < bestTime {
            bestTime = totalTime
            saveBestTime()
        }

        // Record match game stats: each pair = 1 answer, each mismatch penalty = 1 wrong
        let totalPairs = words.count
        let correctPairs = totalPairs  // all pairs are eventually matched
        let wrongAttempts = penaltyCount
        quizStatsStore?.record(
            totalAnswered: correctPairs + wrongAttempts,
            correctAnswered: correctPairs
        )
    }

    // MARK: - Persistence

    private var bestTimeKey: String { "matchGame_bestTime_\(projectId)" }

    private func loadBestTime() {
        bestTime = UserDefaults.standard.double(forKey: bestTimeKey)
    }

    private func saveBestTime() {
        UserDefaults.standard.set(totalTime, forKey: bestTimeKey)
    }
}
