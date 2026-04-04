import Foundation
import OSLog

@MainActor
final class ProjectDetailViewModel: ObservableObject {
    @Published private(set) var words: [Word] = []
    /// Notionチェックの「学習中2マス目」だけは UserDefaults 依存のため、ここを進めて行を再描画する
    @Published private(set) var notionUIRevision: Int = 0
    @Published private(set) var projectMetadata: Project?
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
            async let projectsTask = state.activeRepository.fetchProjects(userId: state.activeUserId)
            async let wordsTask = state.activeRepository.fetchWords(projectId: projectId)

            let (projects, loadedWords) = try await (projectsTask, wordsTask)
            projectMetadata = projects.first(where: { $0.id == projectId })
            NotionCheckboxProgress.reconcileAfterLoad(words: loadedWords)
            words = loadedWords
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
        projectId: String,
        using state: AppState
    ) async {
        do {
            var input = input
            input.projectId = projectId

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

        // Optimistic update: apply to UI immediately
        var snapshot: Word?
        if let index = words.firstIndex(where: { $0.id == wordId }) {
            snapshot = words[index]
            var updated = words[index]
            apply(effectivePatch, to: &updated)
            words[index] = updated
        }

        do {
            try await state.activeRepository.updateWord(id: wordId, patch: effectivePatch)
            if broadcastChanges {
                state.bumpDataVersion()
            }
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            // Rollback on failure
            if let snapshot, let index = words.firstIndex(where: { $0.id == wordId }) {
                words[index] = snapshot
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

    func renameProject(id: String, title: String, using state: AppState) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        do {
            try await state.activeRepository.updateProject(id: id, title: trimmedTitle)
            if var projectMetadata {
                projectMetadata.title = trimmedTitle
                self.projectMetadata = projectMetadata
            }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project rename failed: \(error.localizedDescription)")
        }
    }

    func updateProjectIcon(id: String, iconImage: String?, using state: AppState) async {
        do {
            try await state.activeRepository.updateProjectIcon(id: id, iconImage: iconImage)
            if var projectMetadata {
                projectMetadata.iconImage = iconImage
                self.projectMetadata = projectMetadata
            }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project icon update failed: \(error.localizedDescription)")
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

    func filledNotionCount(for word: Word) -> Int {
        _ = notionUIRevision
        return NotionCheckboxProgress.filledCount(for: word)
    }

    /// Notionチェック列: 0→1→2→3→2→1→0…（1タップで1マス。3マス目は習得＝`mastered`）
    func advanceNotionCheckbox(word: Word, projectId: String, using state: AppState) async {
        let tier2 = NotionCheckboxProgress.hasReviewSecondFill(word.id)
        let steppedDownFromMastered = NotionCheckboxProgress.hasReviewSecondFromMastered(word.id)
        let firstTierFromWalkback = NotionCheckboxProgress.hasReviewFirstFromWalkback(word.id)
        switch (word.status, tier2, steppedDownFromMastered, firstTierFromWalkback) {
        case (.new, _, _, _):
            NotionCheckboxProgress.setReviewSecondFill(word.id, false)
            NotionCheckboxProgress.setReviewSecondFromMastered(word.id, false)
            NotionCheckboxProgress.setReviewFirstFromWalkback(word.id, false)
            await updateWord(
                wordId: word.id,
                patch: WordPatch(status: .review),
                broadcastChanges: false,
                projectId: projectId,
                using: state
            )
        case (.review, false, _, true):
            NotionCheckboxProgress.setReviewFirstFromWalkback(word.id, false)
            await updateWord(
                wordId: word.id,
                patch: WordPatch(status: .new),
                broadcastChanges: false,
                projectId: projectId,
                using: state
            )
        case (.review, false, _, false):
            NotionCheckboxProgress.setReviewSecondFill(word.id, true)
            NotionCheckboxProgress.setReviewSecondFromMastered(word.id, false)
            notionUIRevision += 1
        case (.review, true, true, _):
            // 習得から戻したあとの2マス目 → 次は1マス目へ（2↔3の往復を防ぐ）
            NotionCheckboxProgress.setReviewSecondFill(word.id, false)
            NotionCheckboxProgress.setReviewSecondFromMastered(word.id, false)
            NotionCheckboxProgress.setReviewFirstFromWalkback(word.id, true)
            notionUIRevision += 1
        case (.review, true, false, _):
            await updateWord(
                wordId: word.id,
                patch: WordPatch(status: .mastered),
                broadcastChanges: false,
                projectId: projectId,
                using: state
            )
            NotionCheckboxProgress.setReviewSecondFill(word.id, false)
            NotionCheckboxProgress.setReviewSecondFromMastered(word.id, false)
            NotionCheckboxProgress.setReviewFirstFromWalkback(word.id, false)
        case (.mastered, _, _, _):
            NotionCheckboxProgress.setReviewSecondFill(word.id, true)
            NotionCheckboxProgress.setReviewSecondFromMastered(word.id, true)
            NotionCheckboxProgress.setReviewFirstFromWalkback(word.id, false)
            await updateWord(
                wordId: word.id,
                patch: WordPatch(status: .review),
                broadcastChanges: false,
                projectId: projectId,
                using: state
            )
        }
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
        if let vocabularyType = patch.vocabularyType {
            word.vocabularyType = vocabularyType
        }
    }
}
