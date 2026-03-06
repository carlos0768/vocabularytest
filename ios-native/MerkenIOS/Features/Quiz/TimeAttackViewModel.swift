import Foundation
import Combine

@MainActor
final class TimeAttackViewModel: ObservableObject {
    enum Stage { case setup, playing, results }
    enum TimerDuration: Int, CaseIterable {
        case thirty = 30
        case sixty = 60
        case ninety = 90
        var label: String { "\(rawValue)秒" }
    }

    // ── State ──
    @Published private(set) var stage: Stage = .setup
    @Published private(set) var timeRemaining: Double = 60
    @Published private(set) var totalTime: Double = 60
    @Published private(set) var score = 0
    @Published private(set) var totalAnswered = 0
    @Published private(set) var currentWord: Word?
    @Published private(set) var choices: [String] = []
    @Published private(set) var feedbackColor: Color? = nil
    @Published private(set) var bestScore: Int = 0
    @Published private(set) var lastAnsweredChoice: String? = nil
    @Published private(set) var lastAnswerCorrect: Bool = false
    @Published var selectedDuration: TimerDuration = .sixty

    private var words: [Word] = []
    private var usedIndices: Set<Int> = []
    private var timer: AnyCancellable?
    private var questionStartTime: Date = .now
    private var totalResponseTime: Double = 0
    private var quizStatsStore: QuizStatsStore?

    var progress: Double {
        totalTime > 0 ? timeRemaining / totalTime : 0
    }

    var timerColor: Color {
        if progress > 0.5 { return MerkenTheme.accentBlue }
        if progress > 0.2 { return .orange }
        return MerkenTheme.danger
    }

    var averageTime: Double {
        totalAnswered > 0 ? totalResponseTime / Double(totalAnswered) : 0
    }

    var isNewBest: Bool {
        score > 0 && score >= bestScore
    }

    func setup(words: [Word], quizStatsStore: QuizStatsStore? = nil) {
        self.words = words
        self.quizStatsStore = quizStatsStore
        stage = .setup
        loadBestScore()
    }

    func start() {
        let duration = Double(selectedDuration.rawValue)
        totalTime = duration
        timeRemaining = duration
        score = 0
        totalAnswered = 0
        totalResponseTime = 0
        usedIndices = []
        feedbackColor = nil
        stage = .playing
        nextQuestion()
        startTimer()
    }

    func answer(_ choice: String) {
        guard let word = currentWord else { return }
        let responseTime = Date.now.timeIntervalSince(questionStartTime)
        totalResponseTime += responseTime
        totalAnswered += 1

        let isCorrect = choice == word.japanese
        lastAnsweredChoice = choice
        lastAnswerCorrect = isCorrect

        if isCorrect {
            score += 1
        }

        // Next question after brief delay
        let delay = isCorrect ? 0.4 : 0.7
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.lastAnsweredChoice = nil
            self?.nextQuestion()
        }
    }

    func restart() {
        start()
    }

    // MARK: - Private

    private func nextQuestion() {
        guard stage == .playing else { return }

        // Find unused word
        var attempts = 0
        var index: Int
        repeat {
            index = Int.random(in: 0..<words.count)
            attempts += 1
            if attempts > words.count {
                usedIndices = [] // Reset if all used
            }
        } while usedIndices.contains(index) && attempts <= words.count

        usedIndices.insert(index)
        let word = words[index]
        currentWord = word

        // Build choices: correct + 3 distractors
        var options = [word.japanese]
        let distractors = word.distractors.prefix(3)
        options.append(contentsOf: distractors)

        // If not enough distractors, pick random japanese from other words
        while options.count < 4 {
            let randomWord = words.randomElement()
            if let rw = randomWord, !options.contains(rw.japanese) {
                options.append(rw.japanese)
            }
        }

        choices = options.shuffled()
        questionStartTime = .now
    }

    private func startTimer() {
        timer?.cancel()
        timer = Timer.publish(every: 0.05, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self else { return }
                self.timeRemaining -= 0.05
                if self.timeRemaining <= 0 {
                    self.timeRemaining = 0
                    self.endGame()
                }
            }
    }

    private func endGame() {
        timer?.cancel()
        timer = nil
        stage = .results
        if score > bestScore {
            bestScore = score
            saveBestScore()
        }

        // Record time attack stats
        if totalAnswered > 0 {
            quizStatsStore?.record(
                totalAnswered: totalAnswered,
                correctAnswered: score
            )
        }
    }

    private func flashFeedback(_ color: Color, duration: Double) {
        feedbackColor = color
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.feedbackColor = nil
        }
    }

    // MARK: - Best Score Persistence

    private var bestScoreKey: String { "timeAttack_bestScore" }

    private func loadBestScore() {
        bestScore = UserDefaults.standard.integer(forKey: bestScoreKey)
    }

    private func saveBestScore() {
        UserDefaults.standard.set(bestScore, forKey: bestScoreKey)
    }
}

// Make Color available
import SwiftUI
