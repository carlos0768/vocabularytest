import SwiftUI

struct ScanCoordinatorView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: ScanCoordinatorViewModel
    @Environment(\.dismiss) private var dismiss

    let onComplete: ((String) -> Void)?

    init(
        targetProjectId: String? = nil,
        targetProjectTitle: String? = nil,
        onComplete: ((String) -> Void)? = nil
    ) {
        _viewModel = StateObject(wrappedValue: ScanCoordinatorViewModel(
            targetProjectId: targetProjectId,
            targetProjectTitle: targetProjectTitle
        ))
        self.onComplete = onComplete
    }

    private var showCamera: Binding<Bool> {
        Binding(
            get: { viewModel.currentStep == .camera },
            set: { if !$0 && viewModel.currentStep == .camera {
                viewModel.goBackToModeSelection()
            }}
        )
    }

    private var showPhotoPicker: Binding<Bool> {
        Binding(
            get: { viewModel.currentStep == .photoLibrary },
            set: { if !$0 && viewModel.currentStep == .photoLibrary {
                viewModel.goBackToModeSelection()
            }}
        )
    }

    var body: some View {
        Group {
            switch viewModel.currentStep {
            case .modeSelection, .camera, .photoLibrary:
                ScanModeSheet(
                    isPro: appState.subscription?.isActivePro ?? false,
                    onSelect: { mode, eikenLevel, source in
                        viewModel.selectMode(mode, eikenLevel: eikenLevel, source: source)
                    },
                    onCancel: { dismiss() }
                )

            case .preview:
                if let image = viewModel.capturedImage {
                    ImagePreviewView(
                        image: image,
                        onRetake: { viewModel.retakePhoto() },
                        onUseImage: { viewModel.processImage(using: appState) }
                    )
                }

            case .processing:
                ScanProcessingView()

            case .confirm:
                ScanConfirmView(
                    words: $viewModel.editableWords,
                    projectTitle: $viewModel.projectTitle,
                    targetProjectTitle: viewModel.targetProjectTitle,
                    onSave: { viewModel.saveWords(using: appState) },
                    onCancel: { dismiss() }
                )

            case .saving:
                savingView

            case .complete(let projectId):
                completeView(projectId: projectId)

            case .error(let message):
                errorView(message: message)
            }
        }
        .fullScreenCover(isPresented: showCamera) {
            CameraView(
                onCapture: { image in
                    viewModel.captureImage(image)
                },
                onCancel: {
                    viewModel.goBackToModeSelection()
                }
            )
        }
        .sheet(isPresented: showPhotoPicker) {
            PhotoPickerView { images in
                if let first = images.first {
                    viewModel.captureImage(first)
                }
            }
        }
    }

    private var savingView: some View {
        ZStack {
            AppBackground()
            VStack(spacing: 20) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(MerkenTheme.accentBlue)
                    .scaleEffect(1.2)
                Text("保存中...")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
            }
        }
    }

    private func completeView(projectId: String) -> some View {
        ZStack {
            AppBackground()
            VStack(spacing: 24) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(MerkenTheme.success)

                Text("保存しました!")
                    .font(.title2.bold())
                    .foregroundStyle(MerkenTheme.primaryText)

                Text("\(viewModel.editableWords.count)語を単語帳に追加しました")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)

                Button {
                    onComplete?(projectId)
                    dismiss()
                } label: {
                    Label("閉じる", systemImage: "checkmark")
                        .frame(maxWidth: 200)
                }
                .buttonStyle(PrimaryGlassButton())
            }
        }
    }

    private func errorView(message: String) -> some View {
        ZStack {
            AppBackground()
            VStack(spacing: 20) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(MerkenTheme.warning)

                Text("エラー")
                    .font(.title2.bold())
                    .foregroundStyle(MerkenTheme.primaryText)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                VStack(spacing: 12) {
                    Button {
                        viewModel.retryFromError()
                    } label: {
                        Label("もう一度試す", systemImage: "arrow.clockwise")
                            .frame(maxWidth: 200)
                    }
                    .buttonStyle(PrimaryGlassButton())

                    Button {
                        dismiss()
                    } label: {
                        Text("閉じる")
                            .frame(maxWidth: 200)
                    }
                    .buttonStyle(GhostGlassButton())
                }
            }
        }
    }
}
