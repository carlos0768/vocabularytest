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
            try await state.activeRepository.updateWord(id: wordId, patch: patch)
            if let index = words.firstIndex(where: { $0.id == wordId }) {
                var updated = words[index]
                apply(patch, to: &updated)
                words[index] = updated
            }
            if broadcastChanges {
                state.bumpDataVersion()
            }
            errorMessage = nil
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
}
