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

    /// Generate a small thumbnail (max 300px) for project icon, returned as data URL string.
    static func generateThumbnailBase64(_ image: UIImage, maxSize: CGFloat = 300) -> String? {
        let size = image.size
        let longestSide = max(size.width, size.height)
        let scale = longestSide > maxSize ? maxSize / longestSide : 1.0
        let newSize = CGSize(
            width: (size.width * scale).rounded(),
            height: (size.height * scale).rounded()
        )

        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }

        // Compress to ~50KB target
        for quality in stride(from: 0.6, through: 0.2, by: -0.1) {
            if let data = resized.jpegData(compressionQuality: quality),
               data.count <= 80_000 {
                return toBase64DataURL(data)
            }
        }
        if let data = resized.jpegData(compressionQuality: 0.2) {
            return toBase64DataURL(data)
        }
        return nil
    }

    /// Decode a base64 image string (handles both plain base64 and data URL format).
    static func decodeBase64Image(_ string: String) -> UIImage? {
        let base64: String
        if let commaIndex = string.firstIndex(of: ",") {
            base64 = String(string[string.index(after: commaIndex)...])
        } else {
            base64 = string
        }
        guard let data = Data(base64Encoded: base64) else { return nil }
        return UIImage(data: data)
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
