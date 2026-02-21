import UIKit

enum ImageCompressor {
    static let maxDimension: CGFloat = 2048
    static let maxBytes = 2 * 1024 * 1024 // 2MB

    static func compress(_ image: UIImage) -> Data? {
        let resized = resizeIfNeeded(image)

        // Try quality from 0.8 down to 0.1
        for quality in stride(from: 0.8, through: 0.1, by: -0.1) {
            if let data = resized.jpegData(compressionQuality: quality),
               data.count <= maxBytes {
                return data
            }
        }

        // Last resort: lowest quality
        return resized.jpegData(compressionQuality: 0.1)
    }

    static func toBase64DataURL(_ jpegData: Data) -> String {
        let base64 = jpegData.base64EncodedString()
        return "data:image/jpeg;base64,\(base64)"
    }

    private static func resizeIfNeeded(_ image: UIImage) -> UIImage {
        let size = image.size
        let longestSide = max(size.width, size.height)

        guard longestSide > maxDimension else { return image }

        let scale = maxDimension / longestSide
        let newSize = CGSize(
            width: (size.width * scale).rounded(),
            height: (size.height * scale).rounded()
        )

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
