import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

struct ScanCameraView: View {
    let images: [SelectedScanImage]
    let projectTitle: String
    let isGenerating: Bool
    let launchTrigger: Int
    let startWithPhotoPicker: Bool
    let onCapture: (UIImage) -> Void
    let onPickPhotos: ([UIImage]) -> Void
    let onStartGeneration: () -> Void
    let onDismiss: () -> Void

    @StateObject private var cameraController = ScanCameraSessionController()
    @State private var showingPhotoPicker = false
    @State private var dragOffsetY: CGFloat = 0
    @State private var didAutoOpenPhotoPicker = false

    private var canAddMoreImages: Bool {
        images.count < ScanCoordinatorViewModel.maxPhotoSelection
    }

    private var remainingSelectionLimit: Int {
        max(1, ScanCoordinatorViewModel.maxPhotoSelection - images.count)
    }

    var body: some View {
        GeometryReader { proxy in
            let topInset = proxy.safeAreaInsets.top
            let bottomInset = max(proxy.safeAreaInsets.bottom, 18)

            ZStack {
                cameraBackground
                Color.black.opacity(images.isEmpty ? 0.08 : 0.18)
                    .ignoresSafeArea()

                if !images.isEmpty {
                    ScanLaunchHeroView(
                        images: images,
                        projectTitle: projectTitle,
                        dragOffsetY: dragOffsetY,
                        launchTrigger: launchTrigger,
                        surface: .camera
                    )
                }

                VStack(spacing: 0) {
                    topBar
                        .padding(.top, max(topInset, 16) + 30)

                    Spacer(minLength: 0)

                    VStack(spacing: 18) {
                        centerOverlay
                        bottomControls
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, bottomInset + 8)
                }
                .padding(.horizontal, 20)
            }
            .background(Color.black.ignoresSafeArea())
        }
        .ignoresSafeArea()
        .sheet(isPresented: $showingPhotoPicker) {
            PhotoPickerView(
                maxSelectionLimit: remainingSelectionLimit,
                onPick: { pickedImages in
                    onPickPhotos(pickedImages)
                },
                onFinish: {
                    showingPhotoPicker = false
                }
            )
        }
        .onAppear {
            cameraController.prepareIfNeeded()
            cameraController.start()
            if startWithPhotoPicker && !didAutoOpenPhotoPicker {
                didAutoOpenPhotoPicker = true
                DispatchQueue.main.async {
                    showingPhotoPicker = true
                }
            }
        }
        .onDisappear {
            cameraController.stop()
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.84), value: dragOffsetY)
    }

    @ViewBuilder
    private var cameraBackground: some View {
        switch cameraController.permissionState {
        case .loading:
            ZStack {
                Color.black
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.2)
            }
            .ignoresSafeArea()

        case .ready:
            LiveCameraPreview(session: cameraController.session)
                .ignoresSafeArea()

        case .denied:
            fallbackBackground(
                title: "カメラが使えません",
                message: "設定でカメラを許可するか、右下から写真を追加してください。"
            )

        case .unavailable(let message):
            fallbackBackground(
                title: "この端末ではカメラを使えません",
                message: message
            )
        }
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Color.black.opacity(0.38), in: Circle())
            }
            .buttonStyle(.plain)
            .contentShape(Circle())

            Spacer()

            VStack(spacing: 4) {
                if !projectTitle.isEmpty {
                    Text(projectTitle)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.82))
                        .lineLimit(1)
                }

                if !images.isEmpty {
                    Text("\(images.count)/\(ScanCoordinatorViewModel.maxPhotoSelection) 枚")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Color.black.opacity(0.38), in: Capsule())
                }
            }

            Spacer()

            Color.clear
                .frame(width: 56, height: 56)
        }
    }

    @ViewBuilder
    private var centerOverlay: some View {
        if images.isEmpty {
            VStack(spacing: 12) {
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(.white.opacity(0.86))

                Text("撮影するか、右下から写真を追加")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.88))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.bottom, 54)
        } else {
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: 430)
            .contentShape(Rectangle())
            .gesture(generationSwipeGesture)
            .padding(.bottom, 8)
        }
    }

    private var bottomControls: some View {
        VStack(spacing: images.isEmpty ? 22 : 12) {
            ZStack {
                Button {
                    cameraController.capturePhoto { image in
                        onCapture(image)
                    }
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.22))
                            .frame(width: 88, height: 88)

                        Circle()
                            .fill(.white)
                            .frame(width: 70, height: 70)
                    }
                }
                .buttonStyle(.plain)
                .disabled(isGenerating || !canAddMoreImages || cameraController.permissionState != .ready)

                HStack {
                    Spacer()

                    Button {
                        showingPhotoPicker = true
                    } label: {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 60, height: 60)
                            .background(Color.black.opacity(0.38), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isGenerating || !canAddMoreImages)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 92)
        }
    }

    private var generationSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { value in
                guard !isGenerating else { return }
                guard !images.isEmpty else { return }
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                dragOffsetY = min(0, value.translation.height)
            }
            .onEnded { value in
                guard !isGenerating else { return }
                guard !images.isEmpty else { return }
                guard abs(value.translation.height) > abs(value.translation.width) else {
                    dragOffsetY = 0
                    return
                }
                if value.translation.height < -ScanLaunchHeroView.swipeThreshold {
                    dragOffsetY = -132
                    onStartGeneration()
                } else {
                    dragOffsetY = 0
                }
            }
    }

    private func fallbackBackground(title: String, message: String) -> some View {
        ZStack {
            Color.black

            VStack(spacing: 14) {
                Image(systemName: "camera.slash.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(.white.opacity(0.76))

                Text(title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)

                Text(message)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.74))
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
                    .padding(.horizontal, 24)
            }
        }
        .ignoresSafeArea()
    }
}

private final class ScanCameraSessionController: NSObject, ObservableObject {
    enum PermissionState: Equatable {
        case loading
        case ready
        case denied
        case unavailable(String)
    }

    @Published private(set) var permissionState: PermissionState = .loading

    let session = AVCaptureSession()

    private let sessionQueue = DispatchQueue(label: "merken.scan.camera.session")
    private let photoOutput = AVCapturePhotoOutput()
    private var isConfigured = false
    private var captureHandler: ((UIImage) -> Void)?

    func prepareIfNeeded() {
        guard !isConfigured else { return }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSessionIfNeeded()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard let self else { return }
                if granted {
                    self.configureSessionIfNeeded()
                } else {
                    DispatchQueue.main.async {
                        self.permissionState = .denied
                    }
                }
            }
        case .denied, .restricted:
            permissionState = .denied
        @unknown default:
            permissionState = .denied
        }
    }

    func start() {
        sessionQueue.async { [weak self] in
            guard let self, self.isConfigured, !self.session.isRunning else { return }
            self.session.startRunning()
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    func capturePhoto(_ completion: @escaping (UIImage) -> Void) {
        guard permissionState == .ready else { return }

        captureHandler = completion
        sessionQueue.async { [weak self] in
            guard let self else { return }

            let settings: AVCapturePhotoSettings
            if self.photoOutput.availablePhotoCodecTypes.contains(.jpeg) {
                settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            } else {
                settings = AVCapturePhotoSettings()
            }

            if self.photoOutput.isHighResolutionCaptureEnabled {
                settings.isHighResolutionPhotoEnabled = true
            }

            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    private func configureSessionIfNeeded() {
        sessionQueue.async { [weak self] in
            guard let self, !self.isConfigured else { return }

            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                DispatchQueue.main.async {
                    self.permissionState = .unavailable("写真ライブラリからの追加は利用できます。")
                }
                return
            }

            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                DispatchQueue.main.async {
                    self.permissionState = .unavailable("カメラデバイスが見つかりません。")
                }
                return
            }

            do {
                let input = try AVCaptureDeviceInput(device: device)

                self.session.beginConfiguration()
                self.session.sessionPreset = .photo

                if self.session.canAddInput(input) {
                    self.session.addInput(input)
                }

                if self.session.canAddOutput(self.photoOutput) {
                    self.session.addOutput(self.photoOutput)
                    self.photoOutput.isHighResolutionCaptureEnabled = true
                }

                self.session.commitConfiguration()
                self.isConfigured = true

                DispatchQueue.main.async {
                    self.permissionState = .ready
                }

                self.start()
            } catch {
                DispatchQueue.main.async {
                    self.permissionState = .unavailable("カメラの初期化に失敗しました。")
                }
            }
        }
    }
}

extension ScanCameraSessionController: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard error == nil,
              let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data),
              let captureHandler else {
            return
        }

        DispatchQueue.main.async {
            captureHandler(image)
        }
    }
}

private struct LiveCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> CameraPreviewView {
        let view = CameraPreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: CameraPreviewView, context: Context) {
        uiView.previewLayer.session = session
    }
}

private final class CameraPreviewView: UIView {
    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }

    var previewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}

// MARK: - Photo Library Picker (PHPicker) — supports multiple selection

struct PhotoPickerView: UIViewControllerRepresentable {
    let maxSelectionLimit: Int
    let onPick: ([UIImage]) -> Void
    let onFinish: () -> Void

    init(
        maxSelectionLimit: Int = 0,
        onPick: @escaping ([UIImage]) -> Void,
        onFinish: @escaping () -> Void
    ) {
        self.maxSelectionLimit = maxSelectionLimit
        self.onPick = onPick
        self.onFinish = onFinish
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick, onFinish: onFinish)
    }

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.selectionLimit = max(0, maxSelectionLimit)
        config.filter = .images
        config.selection = .ordered
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPick: ([UIImage]) -> Void
        let onFinish: () -> Void

        init(onPick: @escaping ([UIImage]) -> Void, onFinish: @escaping () -> Void) {
            self.onPick = onPick
            self.onFinish = onFinish
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard !results.isEmpty else {
                DispatchQueue.main.async { [weak self] in
                    self?.onFinish()
                }
                return
            }

            let group = DispatchGroup()
            var images: [(Int, UIImage)] = []

            for (index, result) in results.enumerated() {
                guard result.itemProvider.canLoadObject(ofClass: UIImage.self) else { continue }
                group.enter()
                result.itemProvider.loadObject(ofClass: UIImage.self) { image, _ in
                    if let uiImage = image as? UIImage {
                        DispatchQueue.main.async {
                            images.append((index, uiImage))
                        }
                    }
                    group.leave()
                }
            }

            group.notify(queue: .main) { [weak self] in
                let sorted = images.sorted { $0.0 < $1.0 }.map(\.1)
                if !sorted.isEmpty {
                    self?.onPick(sorted)
                }
                self?.onFinish()
            }
        }
    }
}
