import SwiftUI

struct ScanCoordinatorView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: ScanCoordinatorViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var thumbnailImage: UIImage?

    let onComplete: ((String) -> Void)?
    let onDismissRequest: (() -> Void)?

    init(
        targetProjectId: String? = nil,
        targetProjectTitle: String? = nil,
        preselectedMode: ScanMode? = nil,
        preselectedEikenLevel: EikenLevel? = nil,
        preselectedSource: ScanSource? = nil,
        onComplete: ((String) -> Void)? = nil,
        onDismissRequest: (() -> Void)? = nil
    ) {
        _viewModel = StateObject(wrappedValue: ScanCoordinatorViewModel(
            targetProjectId: targetProjectId,
            targetProjectTitle: targetProjectTitle,
            preselectedMode: preselectedMode,
            preselectedEikenLevel: preselectedEikenLevel,
            preselectedSource: preselectedSource
        ))
        self.onComplete = onComplete
        self.onDismissRequest = onDismissRequest
    }

    private func closeScanFlow() {
        if let onDismissRequest {
            onDismissRequest()
        } else {
            dismiss()
        }
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
            if !appState.isLoggedIn {
                loginRequiredView
            } else {
                scanContent
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
            .ignoresSafeArea()
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

    @ViewBuilder
    private var scanContent: some View {
        switch viewModel.currentStep {
        case .modeSelection, .camera, .photoLibrary:
                ScanModeSheet(
                    isPro: appState.subscription?.isActivePro ?? false,
                    onSelect: { mode, eikenLevel, source in
                        viewModel.selectMode(mode, eikenLevel: eikenLevel, source: source)
                    },
                    onCancel: { closeScanFlow() }
                )

        case .preview, .projectSetup:
            if viewModel.shouldAutoProcessOnSetup {
                // Adding to existing project — skip setup, auto-process
                Color.clear.onAppear {
                    viewModel.shouldAutoProcessOnSetup = false
                    viewModel.processSelectedImages(using: appState)
                }
            } else {
                ProjectSetupView(
                    images: viewModel.selectedImages,
                    projectTitle: $viewModel.projectTitle,
                    thumbnailImage: $thumbnailImage,
                    onBack: {
                        if viewModel.isPhotoLibrarySelection {
                            viewModel.selectPhotosAgain()
                        } else {
                            viewModel.retakePhoto()
                        }
                    },
                    onStart: {
                        viewModel.projectThumbnail = thumbnailImage
                        viewModel.processSelectedImages(using: appState)
                    }
                )
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
                onCancel: { closeScanFlow() }
            )

        case .saving:
            savingView

        case .complete(let projectId):
            completeView(projectId: projectId)

        case .error(let message):
            errorView(message: message)
        }
    }

    private var loginRequiredView: some View {
        ZStack {
            LoginGateView(
                icon: "person.crop.circle.badge.exclamationmark",
                title: "ログインが必要です",
                message: "スキャン機能を利用するには、アカウントにログインしてください。"
            ) {
                closeScanFlow()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    appState.selectedTab = 4
                }
            }
            .overlay(alignment: .topTrailing) {
                Button {
                    closeScanFlow()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: Circle())
                        .overlay(
                            Circle()
                                .stroke(MerkenTheme.border, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
                .padding(.trailing, 16)
            }
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
                    closeScanFlow()
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
                    closeScanFlow()
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
                        closeScanFlow()
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
