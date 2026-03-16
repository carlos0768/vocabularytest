import SwiftUI

struct ScanCoordinatorView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: ScanCoordinatorViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var isLaunchingGeneration = false
    @State private var isClosingAfterLaunch = false
    @State private var launchAnimationTrigger = 0

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
            set: { _ in }
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
        .opacity(isClosingAfterLaunch ? 0 : 1)
        .fullScreenCover(isPresented: showCamera) {
            ScanCameraView(
                images: viewModel.selectedImages,
                projectTitle: viewModel.projectTitle,
                isGenerating: isLaunchingGeneration,
                launchTrigger: launchAnimationTrigger,
                startWithPhotoPicker: viewModel.shouldOpenPhotoPickerOnCameraEntry,
                onCapture: { image in
                    viewModel.captureImage(image)
                },
                onPickPhotos: { images in
                    viewModel.setSelectedImages(images)
                },
                onStartGeneration: {
                    startGenerationAnimation()
                },
                onDismiss: {
                    closeScanFlow()
                }
            )
            .ignoresSafeArea()
        }
        .onDisappear {
            viewModel.continueProcessingAfterDismissIfNeeded()
        }
        .onChange(of: viewModel.currentStep) { _, step in
            guard viewModel.targetProjectId == nil else { return }
            if step == .preview {
                appState.selectedTab = 0
            }
        }
    }

    @ViewBuilder
    private var scanContent: some View {
        switch viewModel.currentStep {
        case .modeSelection:
            ScanModeOverlay(
                isPro: appState.subscription?.isActivePro ?? false,
                onSelectMode: { mode, eikenLevel in
                    withAnimation(MerkenSpring.snappy) {
                        viewModel.selectMode(mode, eikenLevel: eikenLevel)
                    }
                },
                onDismiss: { closeScanFlow() }
            )

        case .preview:
            ScanInlinePreviewStage(
                images: viewModel.selectedImages,
                projectTitle: viewModel.projectTitle,
                isGenerating: isLaunchingGeneration,
                launchTrigger: launchAnimationTrigger,
                onStart: {
                    startGenerationAnimation()
                },
                onDismiss: {
                    closeScanFlow()
                }
            )

        case .camera, .photoLibrary, .projectSetup:
            Color.clear

        case .processing:
            ScanProcessingView(
                projectTitle: viewModel.projectTitle,
                projectImage: viewModel.projectThumbnail ?? viewModel.selectedImages.first?.image,
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

    private func startGenerationAnimation() {
        guard !isLaunchingGeneration else { return }
        MerkenHaptic.selection()
        if viewModel.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            viewModel.projectTitle = ScanCoordinatorViewModel.defaultProjectTitle()
        }
        viewModel.projectThumbnail = viewModel.selectedImages.first?.image
        withAnimation(.spring(response: 0.48, dampingFraction: 0.86)) {
            isLaunchingGeneration = true
        }
        launchAnimationTrigger += 1

        DispatchQueue.main.asyncAfter(deadline: .now() + ScanLaunchHeroView.animationDuration) {
            isClosingAfterLaunch = true
            viewModel.processSelectedImages(using: appState)
            if viewModel.targetProjectId == nil {
                appState.selectedTab = 0
            }
            closeScanFlow()
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

private struct ScanInlinePreviewStage: View {
    let images: [SelectedScanImage]
    let projectTitle: String
    let isGenerating: Bool
    let launchTrigger: Int
    let onStart: () -> Void
    let onDismiss: () -> Void
    @State private var dragOffsetY: CGFloat = 0

    var body: some View {
        ZStack {
            Color.black.opacity(isGenerating ? 0.34 : 0.24)
                .ignoresSafeArea()
                .transition(.opacity)

            Color.clear
                .contentShape(Rectangle())
                .ignoresSafeArea()
                .onTapGesture {
                    guard !isGenerating else { return }
                    onDismiss()
                }

            ScanLaunchHeroView(
                images: images,
                projectTitle: projectTitle,
                dragOffsetY: dragOffsetY,
                launchTrigger: launchTrigger,
                surface: .preview
            )
            .padding(.horizontal, 24)
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 18)
                .onChanged { value in
                    guard !isGenerating else { return }
                    guard abs(value.translation.height) > abs(value.translation.width) else { return }
                    dragOffsetY = min(0, value.translation.height)
                }
                .onEnded { value in
                    guard !isGenerating else { return }
                    guard abs(value.translation.height) > abs(value.translation.width) else {
                        dragOffsetY = 0
                        return
                    }
                    if value.translation.height < -ScanLaunchHeroView.swipeThreshold {
                        dragOffsetY = -132
                        onStart()
                    } else {
                        dragOffsetY = 0
                    }
                }
        )
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: dragOffsetY)
    }
}

enum ScanLaunchHeroSurface {
    case preview
    case camera
}

struct ScanLaunchHeroView: View {
    static let animationDuration: TimeInterval = 0.96
    static let swipeThreshold: CGFloat = 92

    let images: [SelectedScanImage]
    let projectTitle: String
    let dragOffsetY: CGFloat
    let launchTrigger: Int
    let surface: ScanLaunchHeroSurface

    init(
        images: [SelectedScanImage],
        projectTitle: String,
        dragOffsetY: CGFloat,
        launchTrigger: Int,
        surface: ScanLaunchHeroSurface
    ) {
        self.images = images
        self.projectTitle = projectTitle
        self.dragOffsetY = dragOffsetY
        self.launchTrigger = launchTrigger
        self.surface = surface
    }

    private var previewImages: [SelectedScanImage] {
        Array(images.prefix(3))
    }

    private var dragProgress: CGFloat {
        min(max(-dragOffsetY / 160, 0), 1)
    }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let topInset = proxy.safeAreaInsets.top
            let targetCenter = CGPoint(
                x: size.width / 2,
                y: surface == .preview
                    ? max(10, topInset * 0.18)
                    : max(12, topInset * 0.22)
            )

            PhaseAnimator(ScanLaunchAbsorptionPhase.allCases, trigger: launchTrigger) { phase in
                let metrics = ScanLaunchPhaseMetrics(
                    phase: phase,
                    dragProgress: dragProgress,
                    size: size,
                    targetCenter: targetCenter,
                    surface: surface
                )

                ZStack {
                    ForEach(Array(previewImages.enumerated()), id: \.element.id) { index, item in
                        let layout = layoutForImage(at: index, total: previewImages.count)
                        let cardPosition = cardPosition(
                            for: layout,
                            index: index,
                            metrics: metrics,
                            targetCenter: targetCenter,
                            size: size
                        )

                        Image(uiImage: item.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: metrics.cardWidth, height: metrics.cardHeight)
                            .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 30, style: .continuous)
                                    .stroke(Color.white.opacity(0.82), lineWidth: 2)
                            )
                            .shadow(
                                color: .black.opacity(0.26 * metrics.clusterOpacity),
                                radius: 24,
                                x: 0,
                                y: 14
                            )
                            .scaleEffect(max(0.08, layout.scale * metrics.cardScale))
                            .rotationEffect(.degrees(layout.rotation * metrics.rotationBlend))
                            .opacity(metrics.clusterOpacity)
                            .position(cardPosition)
                    }

                    if images.count > previewImages.count {
                        extraCountBadge(metrics: metrics)
                            .opacity(metrics.extraCountOpacity)
                    }

                    ScanLaunchCopyPanel(
                        projectTitle: projectTitle,
                        instruction: "上にスワイプして解析開始",
                        metrics: metrics
                    )
                    .position(x: size.width / 2, y: metrics.copyCenterY)
                    .opacity(metrics.copyOpacity)
                    .scaleEffect(metrics.copyScale)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } animation: { phase in
                switch phase {
                case .idle:
                    .smooth(duration: 0.001)
                case .locked:
                    .spring(duration: 0.20, bounce: 0.18)
                case .travel:
                    .spring(duration: 0.38, bounce: 0.10)
                case .impact:
                    .spring(duration: 0.16, bounce: 0.12)
                case .settle:
                    .easeOut(duration: 0.20)
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func cardPosition(
        for layout: (x: CGFloat, y: CGFloat, rotation: Double, scale: CGFloat),
        index: Int,
        metrics: ScanLaunchPhaseMetrics,
        targetCenter: CGPoint,
        size: CGSize
    ) -> CGPoint {
        let baseX = size.width / 2 + layout.x * (1 - metrics.cardConvergence)
        let baseY = metrics.heroCenterY + layout.y * (1 - metrics.cardConvergence)
        let resolvedX = baseX + (targetCenter.x - baseX) * metrics.travelBlend
        let resolvedY = baseY + (targetCenter.y - baseY) * metrics.travelBlend
        return CGPoint(x: resolvedX, y: resolvedY + CGFloat(index) * metrics.stackCompression)
    }

    private func extraCountBadge(metrics: ScanLaunchPhaseMetrics) -> some View {
        Text("+\(images.count - previewImages.count)")
            .font(.system(size: 13, weight: .black))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.78), in: Capsule())
            .position(x: metrics.badgeX, y: metrics.heroCenterY + metrics.cardHeight * 0.20)
    }

    private func layoutForImage(at index: Int, total: Int) -> (x: CGFloat, y: CGFloat, rotation: Double, scale: CGFloat) {
        switch total {
        case 1:
            return (0, 0, 0, 1)
        case 2:
            return index == 0
                ? (-24, 10, -6, 0.96)
                : (24, -2, 6, 1)
        default:
            switch index {
            case 0:
                return (-34, 14, -8, 0.92)
            case 1:
                return (0, 0, 0, 1)
            default:
                return (34, 12, 8, 0.92)
            }
        }
    }
}

private enum ScanLaunchAbsorptionPhase: Int, CaseIterable {
    case idle
    case locked
    case travel
    case impact
    case settle
}

private enum ScanLaunchHeroState: Equatable {
    case idle
    case dragging(CGFloat)
    case locked
    case absorbing(ScanLaunchAbsorptionPhase)
}

private struct ScanLaunchPhaseMetrics {
    let heroCenterY: CGFloat
    let copyCenterY: CGFloat
    let cardWidth: CGFloat
    let cardHeight: CGFloat
    let badgeX: CGFloat
    let badgeY: CGFloat
    let cardConvergence: CGFloat
    let travelBlend: CGFloat
    let cardScale: CGFloat
    let clusterOpacity: CGFloat
    let copyOpacity: CGFloat
    let copyScale: CGFloat
    let rotationBlend: CGFloat
    let targetGlow: CGFloat
    let targetPulse: CGFloat
    let rippleScale: CGFloat
    let rippleOpacity: CGFloat
    let overlayPulse: CGFloat
    let chamberOpacity: CGFloat
    let chevronAlpha: CGFloat
    let chevronTravel: CGFloat
    let stackCompression: CGFloat
    let extraCountOpacity: CGFloat

    init(
        phase: ScanLaunchAbsorptionPhase,
        dragProgress: CGFloat,
        size: CGSize,
        targetCenter: CGPoint,
        surface: ScanLaunchHeroSurface
    ) {
        let baseHeroCenterY = size.height * (surface == .preview ? 0.56 : 0.50)
        let idleLift = -dragProgress * 22
        let cardWidth = min(size.width * 0.68, surface == .preview ? 266 : 252)
        let cardHeight = cardWidth * 1.34
        let badgeX = size.width / 2 + cardWidth * 0.28
        let badgeY = baseHeroCenterY + cardHeight * 0.20 + idleLift

        self.cardWidth = cardWidth
        self.cardHeight = cardHeight
        self.badgeX = badgeX
        self.badgeY = badgeY

        let phaseState = Self.heroState(for: phase, dragProgress: dragProgress)
        switch phaseState {
        case .idle:
            heroCenterY = baseHeroCenterY + idleLift
            copyCenterY = heroCenterY + 4
            cardConvergence = dragProgress * 0.10
            travelBlend = 0
            cardScale = 1 - dragProgress * 0.03
            clusterOpacity = 1
            copyOpacity = 1
            copyScale = 1
            rotationBlend = 1 - dragProgress * 0.10
            targetGlow = dragProgress * 0.12
            targetPulse = 0.08 + dragProgress * 0.08
            rippleScale = 0.82 + dragProgress * 0.14
            rippleOpacity = dragProgress * 0.08
            overlayPulse = dragProgress * 0.06
            chamberOpacity = 0
            chevronAlpha = 0
            chevronTravel = 0
            stackCompression = 0
            extraCountOpacity = 1

        case .dragging(let progress):
            heroCenterY = baseHeroCenterY - progress * 22
            copyCenterY = heroCenterY + 4
            cardConvergence = progress * 0.10
            travelBlend = 0
            cardScale = 1 - progress * 0.03
            clusterOpacity = 1
            copyOpacity = 1
            copyScale = 1
            rotationBlend = 1 - progress * 0.10
            targetGlow = progress * 0.12
            targetPulse = 0.10 + progress * 0.08
            rippleScale = 0.86 + progress * 0.16
            rippleOpacity = progress * 0.10
            overlayPulse = progress * 0.08
            chamberOpacity = 0
            chevronAlpha = 0
            chevronTravel = 0
            stackCompression = 0
            extraCountOpacity = 1

        case .locked:
            heroCenterY = baseHeroCenterY - 28
            copyCenterY = heroCenterY + 4
            cardConvergence = 0.22
            travelBlend = 0.06
            cardScale = 0.94
            clusterOpacity = 1
            copyOpacity = 0.96
            copyScale = 0.98
            rotationBlend = 0.60
            targetGlow = 0.16
            targetPulse = 0.16
            rippleScale = 1.02
            rippleOpacity = 0.12
            overlayPulse = 0.10
            chamberOpacity = 0
            chevronAlpha = 0
            chevronTravel = 0
            stackCompression = 0
            extraCountOpacity = 0.92

        case .absorbing(let absorbPhase):
            switch absorbPhase {
            case .travel:
                heroCenterY = baseHeroCenterY - 54
                copyCenterY = heroCenterY - 8
                cardConvergence = 0.80
                travelBlend = 1.18
                cardScale = 0.28
                clusterOpacity = 0.88
                copyOpacity = 0.22
                copyScale = 0.94
                rotationBlend = 0.20
                targetGlow = 0.22
                targetPulse = 0.30
                rippleScale = 1.12
                rippleOpacity = 0.16
                overlayPulse = 0.12
                chamberOpacity = 0
                chevronAlpha = 0
                chevronTravel = 0
                stackCompression = -2
                extraCountOpacity = 0.30

            case .impact:
                heroCenterY = baseHeroCenterY - 66
                copyCenterY = heroCenterY - 12
                cardConvergence = 1
                travelBlend = 1.52
                cardScale = 0.06
                clusterOpacity = 0.10
                copyOpacity = 0
                copyScale = 0.84
                rotationBlend = 0
                targetGlow = 0.34
                targetPulse = 0.46
                rippleScale = 1.34
                rippleOpacity = 0.20
                overlayPulse = 0.14
                chamberOpacity = 0
                chevronAlpha = 0
                chevronTravel = 0
                stackCompression = -3
                extraCountOpacity = 0

            case .settle:
                heroCenterY = baseHeroCenterY - 72
                copyCenterY = heroCenterY - 12
                cardConvergence = 1
                travelBlend = 1.68
                cardScale = 0.04
                clusterOpacity = 0
                copyOpacity = 0
                copyScale = 0.82
                rotationBlend = 0
                targetGlow = 0.10
                targetPulse = 0.12
                rippleScale = 1.46
                rippleOpacity = 0
                overlayPulse = 0.06
                chamberOpacity = 0
                chevronAlpha = 0
                chevronTravel = 0
                stackCompression = 0
                extraCountOpacity = 0

            default:
                heroCenterY = baseHeroCenterY + idleLift
                copyCenterY = heroCenterY + 4
                cardConvergence = 0
                travelBlend = 0
                cardScale = 1
                clusterOpacity = 1
                copyOpacity = 1
                copyScale = 1
                rotationBlend = 1
                targetGlow = 0
                targetPulse = 0.08
                rippleScale = 0.82
                rippleOpacity = 0
                overlayPulse = 0
                chamberOpacity = 0
                chevronAlpha = 0
                chevronTravel = 0
                stackCompression = 0
                extraCountOpacity = 1
            }
        }
    }

    private static func heroState(for phase: ScanLaunchAbsorptionPhase, dragProgress: CGFloat) -> ScanLaunchHeroState {
        switch phase {
        case .idle:
            if dragProgress > 0.01 {
                return .dragging(dragProgress)
            }
            return .idle
        case .locked:
            return .locked
        default:
            return .absorbing(phase)
        }
    }
}

private struct ScanLaunchCopyPanel: View {
    let projectTitle: String
    let instruction: String
    let metrics: ScanLaunchPhaseMetrics

    var body: some View {
        VStack {
            VStack(spacing: 8) {
                Text(projectTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.82))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                Text("単語帳生成")
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(.black)
                    .multilineTextAlignment(.center)
                    .shadow(color: .white.opacity(0.55), radius: 6, y: 1)

                Text(instruction)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 22)
            .frame(width: metrics.cardWidth * 0.96)
        }
        .frame(width: metrics.cardWidth, height: metrics.cardHeight)
    }
}

private struct ScanLaunchTargetReactionView: View {
    let surface: ScanLaunchHeroSurface
    let targetCenter: CGPoint
    let canvasSize: CGSize
    let metrics: ScanLaunchPhaseMetrics

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.black.opacity(0.08 * metrics.overlayPulse),
                            .clear
                        ],
                        center: .center,
                        startRadius: 4,
                        endRadius: 110
                    )
                )
                .frame(width: 220, height: 220)
                .position(x: targetCenter.x, y: targetCenter.y)

            Circle()
                .fill(Color.black.opacity(0.04 + metrics.targetGlow * 0.08))
                .frame(width: 54 + metrics.targetGlow * 12, height: 54 + metrics.targetGlow * 12)
                .blur(radius: 10)
                .position(x: targetCenter.x, y: targetCenter.y)

            Circle()
                .stroke(Color.black.opacity(metrics.rippleOpacity), lineWidth: 1.8)
                .frame(width: 46 * metrics.rippleScale, height: 46 * metrics.rippleScale)
                .position(x: targetCenter.x, y: targetCenter.y)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.20 * metrics.targetGlow),
                            .clear
                        ],
                        center: .center,
                        startRadius: 4,
                        endRadius: 28
                    )
                )
                .frame(width: 52 + metrics.targetPulse * 20, height: 52 + metrics.targetPulse * 20)
                .position(x: targetCenter.x, y: targetCenter.y)
        }
        .allowsHitTesting(false)
    }
}
