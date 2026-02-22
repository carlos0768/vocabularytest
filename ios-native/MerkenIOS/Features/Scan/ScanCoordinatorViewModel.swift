import Foundation
import UIKit
import OSLog

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

    private let quizPrefillBatchSize = 30
    private let quizPrefillMaxAttempts = 3
    private let sentenceQuizSize = 15
    private let quiz2PrefillBatchSize = 200

    @Published private(set) var currentStep: FlowStep = .modeSelection
    @Published var editableWords: [EditableExtractedWord] = []
    @Published var projectTitle: String = ""
    @Published private(set) var currentWordCount: Int = 0

    private let logger = Logger(subsystem: "MerkenIOS", category: "ScanCoordinator")

    // State
    private var selectedMode: ScanMode = .all
    private var selectedEikenLevel: EikenLevel?
    private(set) var capturedImage: UIImage?
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

    func selectMode(_ mode: ScanMode, eikenLevel: EikenLevel?, source: ScanSource) {
        selectedMode = mode
        selectedEikenLevel = eikenLevel
        switch source {
        case .camera:
            currentStep = .camera
        case .photoLibrary:
            currentStep = .photoLibrary
        }
    }

    func captureImage(_ image: UIImage) {
        capturedImage = image
        currentStep = .preview
    }

    func retakePhoto() {
        capturedImage = nil
        currentStep = .camera
    }

    func processImage(using appState: AppState) {
        guard let image = capturedImage else {
            currentStep = .error("撮影画像がありません。")
            return
        }

        guard let session = appState.session else {
            currentStep = .error("ログインが必要です。設定画面からログインしてください。")
            return
        }

        currentStep = .processing
        stepBeforeError = .preview

        Task {
            do {
                guard let jpegData = ImageCompressor.compress(image) else {
                    currentStep = .error("画像の圧縮に失敗しました。")
                    return
                }

                let base64 = ImageCompressor.toBase64DataURL(jpegData)
                logger.info("Compressed image: \(jpegData.count) bytes, base64 length: \(base64.count)")

                let words = try await appState.webAPIClient.extractWords(
                    imageBase64: base64,
                    mode: selectedMode,
                    eikenLevel: selectedEikenLevel,
                    bearerToken: session.accessToken
                )

                editableWords = words.map { EditableExtractedWord(from: $0) }

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

                currentStep = .confirm
            } catch let error as WebAPIError {
                logger.error("Extract failed: \(error.localizedDescription)")
                currentStep = .error(error.localizedDescription)
            } catch {
                logger.error("Extract failed: \(error.localizedDescription)")
                currentStep = .error("予期しないエラー: \(error.localizedDescription)")
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

                    if let image = capturedImage,
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
                        guard let image = capturedImage else { return nil }
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
        capturedImage = nil
        editableWords = []
        currentWordCount = 0
        currentStep = .modeSelection
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
}
