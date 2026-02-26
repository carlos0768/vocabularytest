import Foundation
import OSLog

@MainActor
final class ProjectDetailViewModel: ObservableObject {
    @Published private(set) var words: [Word] = []
    @Published var searchText = ""
    @Published var favoritesOnly = false
    @Published var errorMessage: String?
    @Published private(set) var loading = false

    private let logger = Logger(subsystem: "MerkenIOS", category: "ProjectDetailVM")
    private static let insightsDateFormatterWithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let insightsDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    var filteredWords: [Word] {
        words.filter { word in
            let favoritePass = !favoritesOnly || word.isFavorite
            let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !query.isEmpty else { return favoritePass }

            return favoritePass && (
                word.english.localizedCaseInsensitiveContains(query)
                || word.japanese.localizedCaseInsensitiveContains(query)
            )
        }
    }

    func load(projectId: String, using state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            words = try await state.activeRepository.fetchWords(projectId: projectId)
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project detail load failed: \(error.localizedDescription)")
        }
    }

    func addWord(
        input: WordInput,
        projectId _: String,
        using state: AppState
    ) async {
        do {
            let created = try await state.activeRepository.createWords([input])
            if !created.isEmpty {
                words.append(contentsOf: created)
                words.sort { $0.createdAt < $1.createdAt }
            }
            state.bumpDataVersion()
            errorMessage = nil

            if state.isPro, state.isAIEnabled, !created.isEmpty {
                Task { [weak self] in
                    guard let self else { return }
                    await self.generateWordInsights(for: created, force: false, using: state)
                }
            }
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Add word failed: \(error.localizedDescription)")
        }
    }

    func updateWord(
        wordId: String,
        patch: WordPatch,
        broadcastChanges: Bool = true,
        projectId _: String,
        using state: AppState
    ) async {
        do {
            let previousEnglish = words.first(where: { $0.id == wordId })?.english
            let englishChanged = patch.english != nil && patch.english != previousEnglish

            var effectivePatch = patch
            if englishChanged {
                effectivePatch.partOfSpeechTags = .some([])
                effectivePatch.relatedWords = .some([])
                effectivePatch.usagePatterns = .some([])
                effectivePatch.insightsGeneratedAt = .some(nil)
                effectivePatch.insightsVersion = 0
            }

            try await state.activeRepository.updateWord(id: wordId, patch: effectivePatch)
            if let index = words.firstIndex(where: { $0.id == wordId }) {
                var updated = words[index]
                apply(effectivePatch, to: &updated)
                words[index] = updated
            }
            if broadcastChanges {
                state.bumpDataVersion()
            }
            errorMessage = nil

            if state.isPro,
               state.isAIEnabled,
               englishChanged,
               let word = words.first(where: { $0.id == wordId }) {
                Task { [weak self] in
                    guard let self else { return }
                    await self.generateWordInsights(for: [word], force: true, using: state)
                }
            }
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Update word failed: \(error.localizedDescription)")
        }
    }

    func deleteWord(wordId: String, projectId _: String, using state: AppState) async {
        do {
            try await state.activeRepository.deleteWord(id: wordId)
            words.removeAll { $0.id == wordId }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Delete word failed: \(error.localizedDescription)")
        }
    }

    func deleteProject(id: String, using state: AppState) async {
        do {
            try await state.activeRepository.deleteProject(id: id)
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Delete project failed: \(error.localizedDescription)")
        }
    }

    func toggleFavorite(word: Word, projectId: String, using state: AppState) async {
        await updateWord(
            wordId: word.id,
            patch: WordPatch(isFavorite: !word.isFavorite),
            broadcastChanges: false,
            projectId: projectId,
            using: state
        )
    }

    private func apply(_ patch: WordPatch, to word: inout Word) {
        if let english = patch.english {
            word.english = english
        }
        if let japanese = patch.japanese {
            word.japanese = japanese
        }
        if let distractors = patch.distractors {
            word.distractors = distractors
        }
        if let exampleSentence = patch.exampleSentence {
            word.exampleSentence = exampleSentence
        }
        if let exampleSentenceJa = patch.exampleSentenceJa {
            word.exampleSentenceJa = exampleSentenceJa
        }
        if let pronunciation = patch.pronunciation {
            word.pronunciation = pronunciation
        }
        if let partOfSpeechTags = patch.partOfSpeechTags {
            word.partOfSpeechTags = partOfSpeechTags
        }
        if let relatedWords = patch.relatedWords {
            word.relatedWords = relatedWords
        }
        if let usagePatterns = patch.usagePatterns {
            word.usagePatterns = usagePatterns
        }
        if let insightsGeneratedAt = patch.insightsGeneratedAt {
            word.insightsGeneratedAt = insightsGeneratedAt
        }
        if let insightsVersion = patch.insightsVersion {
            word.insightsVersion = insightsVersion
        }
        if let status = patch.status {
            word.status = status
        }
        if let lastReviewedAt = patch.lastReviewedAt {
            word.lastReviewedAt = lastReviewedAt
        }
        if let nextReviewAt = patch.nextReviewAt {
            word.nextReviewAt = nextReviewAt
        }
        if let easeFactor = patch.easeFactor {
            word.easeFactor = easeFactor
        }
        if let intervalDays = patch.intervalDays {
            word.intervalDays = intervalDays
        }
        if let repetition = patch.repetition {
            word.repetition = repetition
        }
        if let isFavorite = patch.isFavorite {
            word.isFavorite = isFavorite
        }
    }

    private func parseInsightsDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        if let date = Self.insightsDateFormatterWithFractional.date(from: value) {
            return date
        }
        return Self.insightsDateFormatter.date(from: value)
    }

    private func generateWordInsights(for words: [Word], force: Bool, using state: AppState) async {
        guard state.isPro else { return }
        guard state.isAIEnabled else { return }
        guard !words.isEmpty else { return }

        do {
            let token = try await state.accessTokenForWebAPI(forceRefresh: false)
            let results = try await state.webAPIClient.generateWordInsights(
                words: words.map { WordInsightRequestWordInput(id: $0.id, english: $0.english, japanese: $0.japanese) },
                force: force,
                bearerToken: token
            )

            guard !results.isEmpty else { return }

            for result in results {
                var patch = WordPatch.empty
                if let tags = result.partOfSpeechTags {
                    patch.partOfSpeechTags = .some(tags)
                }
                if let relatedWords = result.relatedWords {
                    patch.relatedWords = .some(relatedWords)
                }
                if let usagePatterns = result.usagePatterns {
                    patch.usagePatterns = .some(usagePatterns)
                }
                if let generatedAt = parseInsightsDate(result.insightsGeneratedAt) {
                    patch.insightsGeneratedAt = .some(generatedAt)
                }
                if let version = result.insightsVersion {
                    patch.insightsVersion = version
                }

                try? await state.activeRepository.updateWord(id: result.wordId, patch: patch)

                if let index = self.words.firstIndex(where: { $0.id == result.wordId }) {
                    var updated = self.words[index]
                    apply(patch, to: &updated)
                    self.words[index] = updated
                }
            }

            state.bumpDataVersion()
        } catch {
            logger.warning("Word insight generation failed: \(error.localizedDescription)")
        }
    }
}
