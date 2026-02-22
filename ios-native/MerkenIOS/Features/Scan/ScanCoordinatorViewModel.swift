import Foundation
import UIKit
import OSLog

struct SelectedScanImage: Identifiable {
    let id: UUID
    var image: UIImage

    init(id: UUID = UUID(), image: UIImage) {
        self.id = id
        self.image = image
    }
}

enum ScanPageStatus: String, Equatable {
    case pending
    case processing
    case success
    case failed
    case skippedLimit
}

struct ScanPageProgress: Identifiable, Equatable {
    let id: UUID
    let pageIndex: Int
    var status: ScanPageStatus
    var message: String?
    var extractedCount: Int

    init(
        id: UUID = UUID(),
        pageIndex: Int,
        status: ScanPageStatus,
        message: String? = nil,
        extractedCount: Int = 0
    ) {
        self.id = id
        self.pageIndex = pageIndex
        self.status = status
        self.message = message
        self.extractedCount = extractedCount
    }
}

struct ScanProcessingSummary: Equatable {
    let total: Int
    let successPages: Int
    let failedPages: Int
    let skippedPages: Int
    let warnings: [String]
    let extractedWordCount: Int
    let dedupedWordCount: Int
}

@MainActor
final class ScanCoordinatorViewModel: ObservableObject {

    enum FlowStep: Equatable {
        case modeSelection
        case camera
        case photoLibrary
        case preview
        case processing
        case confirm
        case saving
        case complete(projectId: String)
        case error(String)

        static func == (lhs: FlowStep, rhs: FlowStep) -> Bool {
            switch (lhs, rhs) {
            case (.modeSelection, .modeSelection),
                 (.camera, .camera),
                 (.photoLibrary, .photoLibrary),
                 (.preview, .preview),
                 (.processing, .processing),
                 (.confirm, .confirm),
                 (.saving, .saving):
                return true
            case (.complete(let a), .complete(let b)):
                return a == b
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }

    // Must match Web FREE_WORD_LIMIT (src/lib/utils.ts)
    static let freeWordLimit = 100
    static let maxPhotoSelection = 10

    private let quizPrefillBatchSize = 30
    private let quizPrefillMaxAttempts = 3
    private let sentenceQuizSize = 15
    private let quiz2PrefillBatchSize = 200

    @Published private(set) var currentStep: FlowStep = .modeSelection
    @Published var editableWords: [EditableExtractedWord] = []
    @Published var projectTitle: String = ""
    @Published private(set) var currentWordCount: Int = 0
    @Published private(set) var selectedImages: [SelectedScanImage] = []
    @Published private(set) var processingPages: [ScanPageProgress] = []
    @Published private(set) var processingSummary: ScanProcessingSummary?

    private let logger = Logger(subsystem: "MerkenIOS", category: "ScanCoordinator")

    // State
    private var selectedMode: ScanMode = .all
    private var selectedEikenLevel: EikenLevel?
    private var selectedSource: ScanSource = .camera
    private var stepBeforeError: FlowStep = .modeSelection

    // For adding words to an existing project
    let targetProjectId: String?
    let targetProjectTitle: String?

    init(targetProjectId: String? = nil, targetProjectTitle: String? = nil) {
        self.targetProjectId = targetProjectId
        self.targetProjectTitle = targetProjectTitle
        if targetProjectTitle != nil {
            self.projectTitle = targetProjectTitle!
        }
    }

    // MARK: - Flow Actions

    var capturedImage: UIImage? {
        selectedImages.first?.image
    }

    var isPhotoLibrarySelection: Bool {
        selectedSource == .photoLibrary
    }

    func selectMode(_ mode: ScanMode, eikenLevel: EikenLevel?, source: ScanSource) {
        selectedMode = mode
        selectedEikenLevel = eikenLevel
        selectedSource = source
        resetSelectionData()
        switch source {
        case .camera:
            currentStep = .camera
        case .photoLibrary:
            currentStep = .photoLibrary
        }
    }

    func captureImage(_ image: UIImage) {
        selectedSource = .camera
        setSelectedImages([image])
    }

    func setSelectedImages(_ images: [UIImage]) {
        let limited = Array(images.prefix(Self.maxPhotoSelection))
        selectedImages = limited.map { SelectedScanImage(image: $0) }
        editableWords = []
        currentWordCount = 0
        processingPages = []
        processingSummary = nil

        if selectedImages.isEmpty {
            currentStep = (selectedSource == .photoLibrary) ? .photoLibrary : .camera
            return
        }

        currentStep = .preview
    }

    func removeSelectedImage(id: UUID) {
        selectedImages.removeAll { $0.id == id }
        processingPages = []
        processingSummary = nil

        if selectedImages.isEmpty {
            currentStep = (selectedSource == .photoLibrary) ? .photoLibrary : .camera
        }
    }

    func moveSelectedImages(from source: IndexSet, to destination: Int) {
        guard !source.isEmpty else { return }

        var reordered = selectedImages
        let sourceIndexes = source.sorted()
        let moving = sourceIndexes.map { reordered[$0] }

        for index in sourceIndexes.reversed() {
            reordered.remove(at: index)
        }

        let removedBeforeDestination = sourceIndexes.filter { $0 < destination }.count
        let insertionIndex = max(0, min(destination - removedBeforeDestination, reordered.count))
        reordered.insert(contentsOf: moving, at: insertionIndex)
        selectedImages = reordered
    }

    func retakePhoto() {
        resetSelectionData()
        currentStep = .camera
    }

    func selectPhotosAgain() {
        resetSelectionData()
        currentStep = .photoLibrary
    }

    func processImage(using appState: AppState) {
        processSelectedImages(using: appState)
    }

    func processSelectedImages(using appState: AppState) {
        guard !selectedImages.isEmpty else {
            currentStep = .error("解析する画像がありません。")
            return
        }

        guard let session = appState.session else {
            currentStep = .error("ログインが必要です。設定画面からログインしてください。")
            return
        }

        stepBeforeError = .preview
        currentStep = .processing
        processingSummary = nil
        processingPages = selectedImages.enumerated().map { index, item in
            ScanPageProgress(
                id: item.id,
                pageIndex: index + 1,
                status: .pending
            )
        }

        Task {
            let snapshot = selectedImages
            var allExtractedWords: [ExtractedWord] = []
            var warnings: [String] = []
            var limitMessage: String?
            var stopAfterIndex: Int?

            for index in snapshot.indices {
                if let stopAfterIndex, index >= stopAfterIndex {
                    updateProgress(
                        at: index,
                        status: .skippedLimit,
                        message: "上限到達のためスキップ",
                        extractedCount: 0
                    )
                    continue
                }

                updateProgress(
                    at: index,
                    status: .processing,
                    message: "解析中...",
                    extractedCount: 0
                )

                guard let payload = await preparePayload(for: snapshot[index].image) else {
                    let message = "画像の圧縮に失敗しました。"
                    updateProgress(at: index, status: .failed, message: message, extractedCount: 0)
                    warnings.append("ページ\(index + 1): \(message)")
                    continue
                }

                logger.info("Prepared page \(index + 1, privacy: .public): \(payload.byteCount, privacy: .public) bytes")

                do {
                    let words = try await appState.webAPIClient.extractWords(
                        imageBase64: payload.base64,
                        mode: selectedMode,
                        eikenLevel: selectedEikenLevel,
                        bearerToken: session.accessToken
                    )

                    allExtractedWords.append(contentsOf: words)
                    updateProgress(
                        at: index,
                        status: .success,
                        message: "\(words.count)語を抽出",
                        extractedCount: words.count
                    )
                } catch let error as WebAPIError {
                    switch error {
                    case .scanLimitReached(let message):
                        limitMessage = message
                        stopAfterIndex = index + 1
                        updateProgress(at: index, status: .failed, message: message, extractedCount: 0)
                        warnings.append("ページ\(index + 1): \(message)")
                    default:
                        let message = error.localizedDescription
                        updateProgress(at: index, status: .failed, message: message, extractedCount: 0)
                        warnings.append("ページ\(index + 1): \(message)")
                    }
                } catch {
                    let message = "予期しないエラー: \(error.localizedDescription)"
                    updateProgress(at: index, status: .failed, message: message, extractedCount: 0)
                    warnings.append("ページ\(index + 1): \(message)")
                }
            }

            let dedupedWords = Self.dedupeWords(allExtractedWords)
            editableWords = dedupedWords.map { EditableExtractedWord(from: $0) }

            if !appState.isPro {
                do {
                    currentWordCount = try await fetchCurrentWordCount(using: appState)
                } catch {
                    currentWordCount = 0
                    logger.warning("Word count preload failed: \(error.localizedDescription)")
                }
            } else {
                currentWordCount = 0
            }

            if projectTitle.isEmpty && targetProjectTitle == nil {
                let dateFormatter = DateFormatter()
                dateFormatter.dateFormat = "M/d"
                projectTitle = "スキャン \(dateFormatter.string(from: .now))"
            }

            let summary = Self.makeProcessingSummary(
                from: processingPages,
                warnings: warnings,
                extractedWordCount: allExtractedWords.count,
                dedupedWordCount: dedupedWords.count
            )
            processingSummary = summary

            if !editableWords.isEmpty {
                if summary.skippedPages > 0, let limitMessage {
                    logger.warning("Scan limit reached in batch flow: \(limitMessage)")
                }
                currentStep = .confirm
                return
            }

            if let limitMessage {
                currentStep = .error(limitMessage)
            } else {
                currentStep = .error("単語を抽出できませんでした。別の画像をお試しください。")
            }
        }
    }

    func saveWords(using appState: AppState) {
        let trimmedTitle = projectTitle.trimmingCharacters(in: .whitespaces)
        guard !editableWords.isEmpty else {
            currentStep = .error("保存する単語がありません。")
            return
        }

        stepBeforeError = .confirm

        Task {
            do {
                if !appState.isPro {
                    let latestCount = try await fetchCurrentWordCount(using: appState)
                    currentWordCount = latestCount
                    let projectedTotal = latestCount + editableWords.count
                    if projectedTotal > Self.freeWordLimit {
                        let available = max(0, Self.freeWordLimit - latestCount)
                        currentStep = .error("保存できる単語はあと\(available)語までです。単語を減らしてください。")
                        return
                    }
                }

                currentStep = .saving

                let projectId: String

                if let existingId = targetProjectId {
                    try await ensureProjectOwnership(projectId: existingId, appState: appState)
                    projectId = existingId

                    if let image = selectedImages.first?.image,
                       let thumbnail = ImageCompressor.generateThumbnailBase64(image) {
                        try? await appState.activeRepository.updateProjectIcon(
                            id: existingId,
                            iconImage: thumbnail
                        )
                    }
                } else {
                    guard !trimmedTitle.isEmpty else {
                        currentStep = .error("プロジェクト名を入力してください。")
                        return
                    }

                    let thumbnail: String? = {
                        guard let image = selectedImages.first?.image else { return nil }
                        return ImageCompressor.generateThumbnailBase64(image)
                    }()

                    let project = try await appState.activeRepository.createProject(
                        title: trimmedTitle,
                        userId: appState.activeUserId,
                        iconImage: thumbnail
                    )
                    projectId = project.id
                }

                let inputs = editableWords.map { word in
                    WordInput(
                        projectId: projectId,
                        english: word.english,
                        japanese: word.japanese,
                        distractors: word.distractors,
                        exampleSentence: word.exampleSentence,
                        exampleSentenceJa: word.exampleSentenceJa,
                        pronunciation: nil
                    )
                }

                let createdWords = try await appState.activeRepository.createWords(inputs)
                let token = appState.session?.accessToken

                let quizReadyWords = await prefillQuizData(
                    createdWords: createdWords,
                    appState: appState,
                    bearerToken: token
                )

                await preGenerateSentenceQuiz(
                    projectId: projectId,
                    wordsForQuiz: quizReadyWords,
                    appState: appState,
                    bearerToken: token
                )

                await prefillQuiz2Data(
                    createdWords: quizReadyWords,
                    appState: appState,
                    bearerToken: token
                )

                appState.bumpDataVersion()
                logger.info("Saved \(inputs.count) words to project \(projectId)")

                currentStep = .complete(projectId: projectId)
            } catch {
                logger.error("Save failed: \(error.localizedDescription)")
                currentStep = .error("保存に失敗しました: \(error.localizedDescription)")
            }
        }
    }

    func retryFromError() {
        currentStep = stepBeforeError
    }

    func goBackToModeSelection() {
        resetSelectionData()
        editableWords = []
        currentWordCount = 0
        currentStep = .modeSelection
    }

    static func dedupeWords(_ words: [ExtractedWord]) -> [ExtractedWord] {
        guard !words.isEmpty else { return [] }

        var deduped: [ExtractedWord] = []
        var indexByKey: [String: Int] = [:]

        for source in words {
            let normalizedEnglish = normalizeText(source.english)
            let normalizedJapanese = normalizeText(source.japanese)
            let key = dedupeKey(english: normalizedEnglish, japanese: normalizedJapanese)

            if let existingIndex = indexByKey[key] {
                let existing = deduped[existingIndex]
                let mergedWord = ExtractedWord(
                    id: existing.id,
                    english: existing.english,
                    japanese: existing.japanese,
                    distractors: mergeDistractors(existing: existing.distractors, incoming: source.distractors),
                    exampleSentence: mergeFirstNonEmpty(existing.exampleSentence, source.exampleSentence),
                    exampleSentenceJa: mergeFirstNonEmpty(existing.exampleSentenceJa, source.exampleSentenceJa)
                )
                deduped[existingIndex] = mergedWord
                continue
            }

            let newWord = ExtractedWord(
                id: source.id,
                english: normalizedEnglish,
                japanese: normalizedJapanese,
                distractors: mergeDistractors(existing: [], incoming: source.distractors),
                exampleSentence: firstNonEmpty(source.exampleSentence),
                exampleSentenceJa: firstNonEmpty(source.exampleSentenceJa)
            )

            indexByKey[key] = deduped.count
            deduped.append(newWord)
        }

        return deduped
    }

    static func makeProcessingSummary(
        from pages: [ScanPageProgress],
        warnings: [String],
        extractedWordCount: Int,
        dedupedWordCount: Int
    ) -> ScanProcessingSummary {
        let successPages = pages.filter { $0.status == .success }.count
        let failedPages = pages.filter { $0.status == .failed }.count
        let skippedPages = pages.filter { $0.status == .skippedLimit }.count

        var orderedWarnings: [String] = []
        var seen: Set<String> = []
        for warning in warnings {
            guard !warning.isEmpty, seen.insert(warning).inserted else { continue }
            orderedWarnings.append(warning)
        }

        if skippedPages > 0 {
            let message = "上限到達のため\(skippedPages)ページをスキップしました。"
            if seen.insert(message).inserted {
                orderedWarnings.append(message)
            }
        }

        return ScanProcessingSummary(
            total: pages.count,
            successPages: successPages,
            failedPages: failedPages,
            skippedPages: skippedPages,
            warnings: orderedWarnings,
            extractedWordCount: extractedWordCount,
            dedupedWordCount: dedupedWordCount
        )
    }

    private func fetchCurrentWordCount(using appState: AppState) async throws -> Int {
        let allWords = try await appState.activeRepository.fetchAllWords(userId: appState.activeUserId)
        return allWords.count
    }

    private func ensureProjectOwnership(projectId: String, appState: AppState) async throws {
        let projects = try await appState.activeRepository.fetchProjects(userId: appState.activeUserId)
        guard projects.contains(where: { $0.id == projectId }) else {
            throw RepositoryError.unauthorized
        }
    }

    private func prefillQuizData(
        createdWords: [Word],
        appState: AppState,
        bearerToken: String?
    ) async -> [Word] {
        guard !createdWords.isEmpty else { return createdWords }
        guard let bearerToken else {
            logger.warning("Skipping quiz prefill: missing access token")
            return createdWords
        }

        let seedWords = createdWords
            .filter {
                !$0.english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !$0.japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            .map {
                QuizPrefillWordInput(id: $0.id, english: $0.english, japanese: $0.japanese)
            }

        guard !seedWords.isEmpty else { return createdWords }

        var resultMap: [String: QuizPrefillResult] = [:]
        let batches = chunkArray(seedWords, size: quizPrefillBatchSize)

        for batch in batches {
            var pending = batch

            for attempt in 1 ... quizPrefillMaxAttempts where !pending.isEmpty {
                do {
                    let results = try await appState.webAPIClient.generateQuizPrefill(
                        words: pending,
                        bearerToken: bearerToken
                    )

                    var succeededIds = Set<String>()
                    for result in results {
                        guard !result.wordId.isEmpty, !result.distractors.isEmpty else { continue }
                        succeededIds.insert(result.wordId)
                        resultMap[result.wordId] = result
                    }

                    pending.removeAll { succeededIds.contains($0.id) }

                    if !pending.isEmpty, attempt < quizPrefillMaxAttempts {
                        await sleep(milliseconds: 250 * attempt)
                    }
                } catch {
                    if attempt >= quizPrefillMaxAttempts {
                        logger.warning("Quiz prefill failed after max retries: \(error.localizedDescription)")
                        break
                    }
                    await sleep(milliseconds: 250 * attempt)
                }
            }
        }

        for word in createdWords {
            guard let generated = resultMap[word.id] else { continue }

            var patch = WordPatch(distractors: generated.distractors)
            let trimmedExample = generated.exampleSentence?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmedExample.isEmpty {
                let trimmedExampleJa = generated.exampleSentenceJa?.trimmingCharacters(in: .whitespacesAndNewlines)
                patch.exampleSentence = .some(trimmedExample)
                patch.exampleSentenceJa = .some((trimmedExampleJa?.isEmpty == true) ? nil : trimmedExampleJa)
            }

            do {
                try await appState.activeRepository.updateWord(id: word.id, patch: patch)
            } catch {
                logger.warning("Failed to apply quiz prefill update for \(word.id): \(error.localizedDescription)")
            }
        }

        return createdWords.map { word in
            guard let generated = resultMap[word.id] else { return word }
            var updated = word
            updated.distractors = generated.distractors
            let trimmedExample = generated.exampleSentence?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmedExample.isEmpty {
                updated.exampleSentence = trimmedExample
                let trimmedExampleJa = generated.exampleSentenceJa?.trimmingCharacters(in: .whitespacesAndNewlines)
                updated.exampleSentenceJa = (trimmedExampleJa?.isEmpty == true) ? nil : trimmedExampleJa
            }
            return updated
        }
    }

    private func preGenerateSentenceQuiz(
        projectId: String,
        wordsForQuiz: [Word],
        appState: AppState,
        bearerToken: String?
    ) async {
        guard appState.isPro else { return }
        guard wordsForQuiz.count >= 10 else { return }
        guard let bearerToken else {
            logger.warning("Skipping sentence quiz pre-generation: missing access token")
            return
        }

        if appState.sentenceQuizProgressStore.hasInProgress(projectId: projectId) {
            return
        }

        let selectedWords = selectWordsForSentenceQuiz(wordsForQuiz)
        let inputs = selectedWords.map {
            SentenceQuizWordInput(
                id: $0.id,
                english: $0.english,
                japanese: $0.japanese,
                status: $0.status.rawValue
            )
        }

        do {
            let generated = try await appState.webAPIClient.generateSentenceQuizWithRawResponse(
                words: inputs,
                bearerToken: bearerToken
            )
            appState.sentenceQuizProgressStore.saveInitial(
                projectId: projectId,
                rawResponseData: generated.rawResponseData
            )
            logger.info("Pre-generated sentence quiz for project \(projectId)")
        } catch {
            logger.warning("Sentence quiz pre-generation failed (non-critical): \(error.localizedDescription)")
        }
    }

    private func prefillQuiz2Data(
        createdWords: [Word],
        appState: AppState,
        bearerToken: String?
    ) async {
        guard appState.isPro else { return }
        guard !createdWords.isEmpty else { return }
        guard let bearerToken else {
            logger.warning("Skipping quiz2 warmup: missing access token")
            return
        }

        let wordIds = createdWords.map(\.id)

        do {
            try await appState.webAPIClient.syncEmbeddings(
                wordIds: wordIds,
                limit: min(wordIds.count, 50),
                bearerToken: bearerToken
            )
        } catch {
            logger.warning("Embedding sync failed (non-critical): \(error.localizedDescription)")
        }

        let batches = chunkArray(wordIds, size: quiz2PrefillBatchSize)
        for batch in batches {
            do {
                try await appState.webAPIClient.warmQuiz2Similar(
                    sourceWordIds: batch,
                    limit: 3,
                    bearerToken: bearerToken
                )
            } catch {
                logger.warning("Quiz2 warmup batch failed (non-critical): \(error.localizedDescription)")
            }
        }
    }

    private func selectWordsForSentenceQuiz(_ words: [Word]) -> [Word] {
        let shuffled = words.shuffled()
        if shuffled.count >= sentenceQuizSize {
            return Array(shuffled.prefix(sentenceQuizSize))
        }

        var selected: [Word] = []
        while selected.count < sentenceQuizSize {
            selected.append(contentsOf: shuffled)
        }
        return Array(selected.prefix(sentenceQuizSize)).shuffled()
    }

    private func chunkArray<T>(_ values: [T], size: Int) -> [[T]] {
        guard size > 0, !values.isEmpty else { return [] }
        var chunks: [[T]] = []
        var index = 0
        while index < values.count {
            let end = min(index + size, values.count)
            chunks.append(Array(values[index ..< end]))
            index = end
        }
        return chunks
    }

    private func sleep(milliseconds: Int) async {
        guard milliseconds > 0 else { return }
        try? await Task.sleep(nanoseconds: UInt64(milliseconds) * 1_000_000)
    }

    private func resetSelectionData() {
        selectedImages = []
        processingPages = []
        processingSummary = nil
    }

    private func updateProgress(
        at index: Int,
        status: ScanPageStatus,
        message: String?,
        extractedCount: Int
    ) {
        guard processingPages.indices.contains(index) else { return }
        var page = processingPages[index]
        page.status = status
        page.message = message
        page.extractedCount = extractedCount
        processingPages[index] = page
    }

    private func preparePayload(for image: UIImage) async -> (base64: String, byteCount: Int)? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                guard let jpegData = ImageCompressor.compress(image) else {
                    continuation.resume(returning: nil)
                    return
                }
                let base64 = ImageCompressor.toBase64DataURL(jpegData)
                continuation.resume(returning: (base64: base64, byteCount: jpegData.count))
            }
        }
    }

    private static func dedupeKey(english: String, japanese: String) -> String {
        "\(english.lowercased())||\(japanese)"
    }

    private static func normalizeText(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func mergeDistractors(existing: [String], incoming: [String]) -> [String] {
        var merged: [String] = []
        var seen: Set<String> = []

        for candidate in existing + incoming {
            let normalized = normalizeText(candidate)
            guard !normalized.isEmpty else { continue }
            let dedupeToken = normalized.lowercased()
            guard seen.insert(dedupeToken).inserted else { continue }
            merged.append(normalized)
            if merged.count == 3 {
                break
            }
        }

        return merged
    }

    private static func mergeFirstNonEmpty(_ current: String?, _ incoming: String?) -> String? {
        if let current = firstNonEmpty(current) {
            return current
        }
        return firstNonEmpty(incoming)
    }

    private static func firstNonEmpty(_ value: String?) -> String? {
        let normalized = normalizeText(value ?? "")
        return normalized.isEmpty ? nil : normalized
    }
}
