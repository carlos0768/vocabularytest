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
        case queued(jobId: String)
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
            case (.queued(let a), .queued(let b)):
                return a == b
            case (.complete(let a), .complete(let b)):
                return a == b
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }

    enum ScanCompletionSource {
        case foregroundManual
        case backgroundAuto
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
    private var completionSource: ScanCompletionSource = .foregroundManual
    private var shouldAutoSaveAfterProcessingDismiss = false
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

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
        let userId = session.userId

        stepBeforeError = .preview
        currentStep = .processing
        processingSummary = nil
        beginBackgroundTask()
        processingPages = selectedImages.enumerated().map { index, item in
            ScanPageProgress(
                id: item.id,
                pageIndex: index + 1,
                status: .pending
            )
        }

        Task {
            func callWebAPIWithAuthRetry<T>(
                _ operation: @escaping (String) async throws -> T
            ) async throws -> T {
                try await appState.performWebAPIRequest(operation)
            }

            let snapshot = selectedImages
            var warnings: [String] = []
            var uploadPayloads: [ScanUploadImage] = []
            var uploadIndexMap: [Int] = []
            uploadPayloads.reserveCapacity(snapshot.count)
            uploadIndexMap.reserveCapacity(snapshot.count)

            for index in snapshot.indices {
                updateProgress(
                    at: index,
                    status: .processing,
                    message: "画像を準備中...",
                    extractedCount: 0
                )

                guard let payload = await preparePayload(for: snapshot[index].image) else {
                    let message = "画像の圧縮に失敗しました。"
                    updateProgress(at: index, status: .failed, message: message, extractedCount: 0)
                    warnings.append("ページ\(index + 1): \(message)")
                    continue
                }

                logger.info("Prepared page \(index + 1, privacy: .public): \(payload.byteCount, privacy: .public) bytes")
                uploadPayloads.append(
                    ScanUploadImage(
                        data: payload.data,
                        contentType: "image/jpeg",
                        fileExtension: "jpg"
                    )
                )
                uploadIndexMap.append(index)
                updateProgress(
                    at: index,
                    status: .pending,
                    message: "アップロード待機中...",
                    extractedCount: 0
                )
            }

            guard !uploadPayloads.isEmpty else {
                let summary = Self.makeProcessingSummary(
                    from: processingPages,
                    warnings: warnings,
                    extractedWordCount: 0,
                    dedupedWordCount: 0
                )
                processingSummary = summary
                currentStep = .error("アップロードできる画像がありません。")
                endBackgroundTask()
                return
            }

            let uploadedPaths: [String]
            do {
                for index in uploadIndexMap {
                    updateProgress(
                        at: index,
                        status: .processing,
                        message: "アップロード中...",
                        extractedCount: 0
                    )
                }
                uploadedPaths = try await callWebAPIWithAuthRetry { token in
                    try await appState.webAPIClient.uploadScanImages(
                        uploadPayloads,
                        userId: userId,
                        bearerToken: token
                    )
                }

                for index in uploadIndexMap {
                    updateProgress(
                        at: index,
                        status: .success,
                        message: "アップロード完了",
                        extractedCount: 0
                    )
                }
            } catch {
                let message = error.localizedDescription
                for index in uploadIndexMap where processingPages[index].status != .failed {
                    updateProgress(at: index, status: .failed, message: message, extractedCount: 0)
                }
                warnings.append(message)

                let summary = Self.makeProcessingSummary(
                    from: processingPages,
                    warnings: warnings,
                    extractedWordCount: 0,
                    dedupedWordCount: 0
                )
                processingSummary = summary
                currentStep = .error(message)
                endBackgroundTask()
                return
            }

            let resolvedProjectTitle: String = {
                let raw = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                if !raw.isEmpty { return raw }
                if let targetProjectTitle, !targetProjectTitle.isEmpty { return targetProjectTitle }
                return Self.defaultProjectTitle()
            }()
            projectTitle = resolvedProjectTitle

            let thumbnail: String? = {
                guard let image = snapshot.first?.image else { return nil }
                return ImageCompressor.generateThumbnailBase64(image)
            }()

            do {
                let response = try await callWebAPIWithAuthRetry { token in
                    try await appState.webAPIClient.createScanJob(
                        imagePaths: uploadedPaths,
                        projectTitle: resolvedProjectTitle,
                        projectIcon: thumbnail,
                        scanMode: self.selectedMode,
                        eikenLevel: self.selectedEikenLevel,
                        targetProjectId: appState.canUseCloud ? self.targetProjectId : nil,
                        clientPlatform: "ios",
                        bearerToken: token
                    )
                }

                let summary = Self.makeProcessingSummary(
                    from: processingPages,
                    warnings: warnings,
                    extractedWordCount: 0,
                    dedupedWordCount: 0
                )
                processingSummary = summary

                let context = PendingScanImportContext(
                    jobId: response.jobId,
                    source: targetProjectId == nil ? .homeOrProjectList : .projectDetail,
                    localTargetProjectId: response.saveMode == .clientLocal ? targetProjectId : nil,
                    requestedProjectTitle: resolvedProjectTitle,
                    requestedProjectIconImage: thumbnail,
                    createdAt: .now
                )
                appState.registerPendingScanImport(context)

                currentStep = .queued(jobId: response.jobId)
                completionSource = .foregroundManual
                shouldAutoSaveAfterProcessingDismiss = false
                endBackgroundTask()
            } catch {
                do {
                    let cleanupToken = try await appState.accessTokenForWebAPI(forceRefresh: false)
                    await appState.webAPIClient.removeScanImages(paths: uploadedPaths, bearerToken: cleanupToken)
                } catch {
                    logger.warning("Failed to cleanup uploaded scan images: \(error.localizedDescription)")
                }
                let summary = Self.makeProcessingSummary(
                    from: processingPages,
                    warnings: warnings,
                    extractedWordCount: 0,
                    dedupedWordCount: 0
                )
                processingSummary = summary
                currentStep = .error(error.localizedDescription)
                endBackgroundTask()
            }
        }
    }

    func saveWords(using appState: AppState) {
        completionSource = .foregroundManual
        stepBeforeError = .confirm
        Task {
            await performSave(using: appState)
        }
    }

    func continueProcessingAfterDismissIfNeeded() {
        guard currentStep == .processing else { return }
        beginBackgroundTask()
        logger.info("Scan view disappeared while processing. Background continuation enabled.")
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

    static func defaultProjectTitle() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d HH:mm"
        return "スキャン \(formatter.string(from: .now))"
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
        completionSource = .foregroundManual
        shouldAutoSaveAfterProcessingDismiss = false
        endBackgroundTask()
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

    private var compressionProfile: ImageCompressor.Profile {
        selectedMode == .highlighted ? .highlighted : .default
    }

    private func preparePayload(for image: UIImage) async -> (data: Data, byteCount: Int)? {
        let profile = compressionProfile
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                guard let jpegData = ImageCompressor.compress(image, profile: profile) else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: (data: jpegData, byteCount: jpegData.count))
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

    private func performSave(using appState: AppState) async {
        let trimmedTitle = projectTitle.trimmingCharacters(in: .whitespaces)
        guard !editableWords.isEmpty else {
            let message = "保存する単語がありません。"
            currentStep = .error(message)
            if completionSource == .backgroundAuto {
                appState.postScanFailure(message: message)
            }
            endBackgroundTask()
            return
        }

        do {
            if !appState.isPro {
                let latestCount = try await fetchCurrentWordCount(using: appState)
                currentWordCount = latestCount
                let projectedTotal = latestCount + editableWords.count
                if projectedTotal > Self.freeWordLimit {
                    let available = max(0, Self.freeWordLimit - latestCount)
                    let message = "保存できる単語はあと\(available)語までです。単語を減らしてください。"
                    currentStep = .error(message)
                    if completionSource == .backgroundAuto {
                        appState.postScanFailure(message: message)
                    }
                    endBackgroundTask()
                    return
                }
            }

            currentStep = .saving

            let projectId: String
            let projectDisplayTitle: String

            if let existingId = targetProjectId {
                try await ensureProjectOwnership(projectId: existingId, appState: appState)
                projectId = existingId
                projectDisplayTitle = targetProjectTitle ?? "単語帳"

                if let image = selectedImages.first?.image,
                   let thumbnail = ImageCompressor.generateThumbnailBase64(image) {
                    try? await appState.activeRepository.updateProjectIcon(
                        id: existingId,
                        iconImage: thumbnail
                    )
                }
            } else {
                guard !trimmedTitle.isEmpty else {
                    let message = "プロジェクト名を入力してください。"
                    currentStep = .error(message)
                    if completionSource == .backgroundAuto {
                        appState.postScanFailure(message: message)
                    }
                    endBackgroundTask()
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
                projectDisplayTitle = project.title
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

            appState.bumpDataVersion()
            logger.info("Saved \(inputs.count) words to project \(projectId)")

            currentStep = .complete(projectId: projectId)
            if completionSource == .backgroundAuto {
                appState.postScanSuccess(projectTitle: projectDisplayTitle, wordCount: inputs.count)
            }
            completionSource = .foregroundManual
            shouldAutoSaveAfterProcessingDismiss = false

            // Run prefill operations in the background (fire-and-forget)
            Task { [weak self] in
                guard let self else { return }
                let token = try? await appState.accessTokenForWebAPI(forceRefresh: false)
                let quizReadyWords = await self.prefillQuizData(
                    createdWords: createdWords,
                    appState: appState,
                    bearerToken: token
                )

                await self.preGenerateSentenceQuiz(
                    projectId: projectId,
                    wordsForQuiz: quizReadyWords,
                    appState: appState,
                    bearerToken: token
                )

                await self.prefillQuiz2Data(
                    createdWords: quizReadyWords,
                    appState: appState,
                    bearerToken: token
                )

                self.endBackgroundTask()
            }
        } catch {
            let message = "保存に失敗しました: \(error.localizedDescription)"
            logger.error("Save failed: \(error.localizedDescription)")
            currentStep = .error(message)
            if completionSource == .backgroundAuto {
                appState.postScanFailure(message: message)
            }
            completionSource = .foregroundManual
            endBackgroundTask()
        }
    }

    private func beginBackgroundTask() {
        guard backgroundTaskId == .invalid else { return }
        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "MerkenScanProcessing") { [weak self] in
            Task { @MainActor [weak self] in
                self?.logger.warning("Background task expired while scan/save was running.")
                self?.endBackgroundTask()
            }
        }
    }

    private func endBackgroundTask() {
        guard backgroundTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskId)
        backgroundTaskId = .invalid
    }
}
