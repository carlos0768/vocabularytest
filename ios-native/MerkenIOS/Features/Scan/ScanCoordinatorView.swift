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
                if viewModel.selectedImages.count > 1 {
                    MultiImagePreviewView(
                        images: viewModel.selectedImages,
                        onDelete: { id in viewModel.removeSelectedImage(id: id) },
                        onMove: { source, destination in
                            viewModel.moveSelectedImages(from: source, to: destination)
                        },
                        onRepick: { viewModel.selectPhotosAgain() },
                        onUseImages: { viewModel.processSelectedImages(using: appState) }
                    )
                } else if let image = viewModel.capturedImage {
                    ImagePreviewView(
                        image: image,
                        retakeButtonTitle: viewModel.isPhotoLibrarySelection ? "選び直し" : "撮り直す",
                        onRetake: {
                            if viewModel.isPhotoLibrarySelection {
                                viewModel.selectPhotosAgain()
                            } else {
                                viewModel.retakePhoto()
                            }
                        },
                        onUseImage: { viewModel.processSelectedImages(using: appState) }
                    )
                } else {
                    errorView(message: "画像が選択されていません。")
                }

            case .processing:
                ScanProcessingView(
                    pages: viewModel.processingPages,
                    summary: viewModel.processingSummary
                )

            case .queued(let jobId):
                queuedView(jobId: jobId)

            case .confirm:
                ScanConfirmView(
                    words: $viewModel.editableWords,
                    projectTitle: $viewModel.projectTitle,
                    targetProjectTitle: viewModel.targetProjectTitle,
                    isPro: appState.isPro,
                    currentWordCount: viewModel.currentWordCount,
                    freeWordLimit: ScanCoordinatorViewModel.freeWordLimit,
                    processingSummary: viewModel.processingSummary,
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
            PhotoPickerView(maxSelectionLimit: ScanCoordinatorViewModel.maxPhotoSelection) { images in
                viewModel.setSelectedImages(images)
            }
        }
        .onDisappear {
            viewModel.continueProcessingAfterDismissIfNeeded()
        }
    }

    private func queuedView(jobId: String) -> some View {
        ZStack {
            AppBackground()

            VStack(spacing: 24) {
                Image(systemName: "clock.badge.checkmark")
                    .font(.system(size: 56))
                    .foregroundStyle(MerkenTheme.accentBlue)

                VStack(spacing: 8) {
                    Text("バックグラウンド解析を開始しました")
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)

                    Text("画面を閉じても解析は継続されます。完了後に自動で単語帳へ反映します。")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)

                    Text("Job ID: \(jobId)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Button {
                    dismiss()
                } label: {
                    Label("閉じる", systemImage: "checkmark")
                        .frame(maxWidth: 220)
                }
                .buttonStyle(PrimaryGlassButton())
            }
            .padding(.horizontal, 20)
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
