import SwiftUI
import UIKit
import PhotosUI

struct CameraView: View {
    let onCapture: (UIImage) -> Void
    let onCancel: () -> Void

    @State private var showPhotoPicker = false

    var body: some View {
        CameraRepresentable(
            onCapture: onCapture,
            onCancel: onCancel,
            onPickFromLibrary: { showPhotoPicker = true }
        )
        .ignoresSafeArea()
        .sheet(isPresented: $showPhotoPicker) {
            PhotoPickerView { image in
                showPhotoPicker = false
                onCapture(image)
            }
        }
    }
}

// MARK: - Camera UIKit wrapper

private struct CameraRepresentable: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    let onCancel: () -> Void
    let onPickFromLibrary: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture, onCancel: onCancel)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        picker.allowsEditing = false

        // Add photo library button as camera overlay
        let overlayView = UIView(frame: UIScreen.main.bounds)
        overlayView.isUserInteractionEnabled = true
        overlayView.backgroundColor = .clear

        let button = UIButton(type: .system)
        let config = UIImage.SymbolConfiguration(pointSize: 22, weight: .medium)
        let icon = UIImage(systemName: "photo.on.rectangle", withConfiguration: config)
        button.setImage(icon, for: .normal)
        button.tintColor = .white
        button.backgroundColor = UIColor.white.withAlphaComponent(0.2)
        button.layer.cornerRadius = 26
        button.clipsToBounds = true
        button.translatesAutoresizingMaskIntoConstraints = false

        // Blur background
        let blurEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        let blurView = UIVisualEffectView(effect: blurEffect)
        blurView.layer.cornerRadius = 26
        blurView.clipsToBounds = true
        blurView.translatesAutoresizingMaskIntoConstraints = false
        blurView.isUserInteractionEnabled = false

        overlayView.addSubview(blurView)
        overlayView.addSubview(button)

        NSLayoutConstraint.activate([
            // Position above the camera controls (higher up to avoid ×)
            button.leadingAnchor.constraint(equalTo: overlayView.leadingAnchor, constant: 24),
            button.bottomAnchor.constraint(equalTo: overlayView.safeAreaLayoutGuide.bottomAnchor, constant: -140),
            button.widthAnchor.constraint(equalToConstant: 52),
            button.heightAnchor.constraint(equalToConstant: 52),

            blurView.leadingAnchor.constraint(equalTo: button.leadingAnchor),
            blurView.trailingAnchor.constraint(equalTo: button.trailingAnchor),
            blurView.topAnchor.constraint(equalTo: button.topAnchor),
            blurView.bottomAnchor.constraint(equalTo: button.bottomAnchor),
        ])

        let action = UIAction { _ in onPickFromLibrary() }
        button.addAction(action, for: .touchUpInside)

        picker.cameraOverlayView = overlayView

        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (UIImage) -> Void
        let onCancel: () -> Void

        init(onCapture: @escaping (UIImage) -> Void, onCancel: @escaping () -> Void) {
            self.onCapture = onCapture
            self.onCancel = onCancel
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                onCapture(image)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCancel()
        }
    }
}

// MARK: - Photo Library Picker (PHPicker)

private struct PhotoPickerView: UIViewControllerRepresentable {
    let onPick: (UIImage) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.selectionLimit = 1
        config.filter = .images
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPick: (UIImage) -> Void

        init(onPick: @escaping (UIImage) -> Void) {
            self.onPick = onPick
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)

            guard let provider = results.first?.itemProvider,
                  provider.canLoadObject(ofClass: UIImage.self) else { return }

            provider.loadObject(ofClass: UIImage.self) { [weak self] image, _ in
                if let uiImage = image as? UIImage {
                    DispatchQueue.main.async {
                        self?.onPick(uiImage)
                    }
                }
            }
        }
    }
}
