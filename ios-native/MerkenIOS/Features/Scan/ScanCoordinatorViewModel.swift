import Foundation
import UIKit
import OSLog

@MainActor
final class ScanCoordinatorViewModel: ObservableObject {

    enum FlowStep: Equatable {
        case modeSelection
        case camera
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

    @Published private(set) var currentStep: FlowStep = .modeSelection
    @Published var editableWords: [EditableExtractedWord] = []
    @Published var projectTitle: String = ""

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

    func selectMode(_ mode: ScanMode, eikenLevel: EikenLevel?) {
        selectedMode = mode
        selectedEikenLevel = eikenLevel
        currentStep = .camera
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
                // 1. Compress
                guard let jpegData = ImageCompressor.compress(image) else {
                    currentStep = .error("画像の圧縮に失敗しました。")
                    return
                }

                let base64 = ImageCompressor.toBase64DataURL(jpegData)
                logger.info("Compressed image: \(jpegData.count) bytes, base64 length: \(base64.count)")

                // 2. API call
                let words = try await appState.webAPIClient.extractWords(
                    imageBase64: base64,
                    mode: selectedMode,
                    eikenLevel: selectedEikenLevel,
                    bearerToken: session.accessToken
                )

                // 3. Convert to editable
                editableWords = words.map { EditableExtractedWord(from: $0) }

                // Auto-generate project title if not set
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

        currentStep = .saving
        stepBeforeError = .confirm

        Task {
            do {
                let projectId: String

                if let existingId = targetProjectId {
                    // Adding to existing project — also set thumbnail if missing
                    projectId = existingId
                    if let image = capturedImage,
                       let thumbnail = ImageCompressor.generateThumbnailBase64(image) {
                        try? await appState.activeRepository.updateProjectIcon(
                            id: existingId,
                            iconImage: thumbnail
                        )
                    }
                } else {
                    // Create new project
                    guard !trimmedTitle.isEmpty else {
                        currentStep = .error("プロジェクト名を入力してください。")
                        return
                    }

                    // Generate thumbnail from captured image
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

                // Create words
                let inputs = editableWords.map { word in
                    WordInput(
                        projectId: projectId,
                        english: word.english,
                        japanese: word.japanese,
                        distractors: word.distractors
                    )
                }
                _ = try await appState.activeRepository.createWords(inputs)

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
        currentStep = .modeSelection
    }
}
