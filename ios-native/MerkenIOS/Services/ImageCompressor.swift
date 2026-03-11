import UIKit

enum ImageCompressor {
    private static let decodedImageCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 512
        return cache
    }()

    /// Compression profiles matching web's image-utils.ts settings
    enum Profile {
        case `default`    // maxDim 1024, quality 0.8→0.3, 1MB
        case highlighted  // maxDim 1600, quality 0.9→0.7, 2MB

        var maxDimension: CGFloat {
            switch self {
            case .default: return 1024
            case .highlighted: return 1600
            }
        }

        var initialQuality: CGFloat {
            switch self {
            case .default: return 0.8
            case .highlighted: return 0.9
            }
        }

        var minQuality: CGFloat {
            switch self {
            case .default: return 0.3
            case .highlighted: return 0.7
            }
        }

        var maxBytes: Int {
            switch self {
            case .default: return 1 * 1024 * 1024    // 1MB (same as web)
            case .highlighted: return 2 * 1024 * 1024 // 2MB
            }
        }
    }

    // Legacy constants for thumbnail/decode (unchanged)
    static let maxDimension: CGFloat = 2048
    static let maxBytes = 2 * 1024 * 1024

    /// Compress image for scan upload using profile settings (matching web behavior)
    static func compress(_ image: UIImage, profile: Profile = .default) -> Data? {
        let resized = resizeIfNeeded(image, maxDimension: profile.maxDimension)

        var quality = profile.initialQuality
        while quality >= profile.minQuality {
            if let data = resized.jpegData(compressionQuality: quality),
               data.count <= profile.maxBytes {
                return data
            }
            quality -= 0.1
        }

        // Last resort: min quality
        return resized.jpegData(compressionQuality: profile.minQuality)
    }

    static func toBase64DataURL(_ jpegData: Data) -> String {
        let base64 = jpegData.base64EncodedString()
        return "data:image/jpeg;base64,\(base64)"
    }

    /// Generate a high-resolution project cover image for project icons.
    /// The old 300px thumbnail was too small for edge-to-edge headers.
    static func generateThumbnailBase64(
        _ image: UIImage,
        maxSize: CGFloat = maxDimension,
        maxBytes: Int = 1_500_000
    ) -> String? {
        let resized = resizeIfNeeded(image, maxDimension: maxSize)

        for quality in stride(from: 0.92, through: 0.55, by: -0.07) {
            if let data = resized.jpegData(compressionQuality: quality),
               data.count <= maxBytes {
                return toBase64DataURL(data)
            }
        }

        if let data = resized.jpegData(compressionQuality: 0.5) {
            return toBase64DataURL(data)
        }
        return nil
    }

    /// Decode a base64 image string (handles both plain base64 and data URL format).
    static func decodeBase64Image(_ string: String, cacheKey: String? = nil) -> UIImage? {
        let resolvedCacheKey = NSString(string: cacheKey ?? String(string.hashValue))
        if let cachedImage = decodedImageCache.object(forKey: resolvedCacheKey) {
            return cachedImage
        }

        let base64: String
        if let commaIndex = string.firstIndex(of: ",") {
            base64 = String(string[string.index(after: commaIndex)...])
        } else {
            base64 = string
        }
        guard let data = Data(base64Encoded: base64) else { return nil }
        guard let image = UIImage(data: data) else { return nil }
        decodedImageCache.setObject(image, forKey: resolvedCacheKey)
        return image
    }

    private static func resizeIfNeeded(_ image: UIImage, maxDimension maxDim: CGFloat? = nil) -> UIImage {
        let size = pixelSize(for: image)
        let longestSide = max(size.width, size.height)
        let limit = maxDim ?? maxDimension

        guard longestSide > limit else { return image }

        let scale = limit / longestSide
        let newSize = CGSize(
            width: max(1, (size.width * scale).rounded()),
            height: max(1, (size.height * scale).rounded())
        )

        let renderer = makeRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    private static func pixelSize(for image: UIImage) -> CGSize {
        if let cgImage = image.cgImage {
            return CGSize(width: cgImage.width, height: cgImage.height)
        }

        let scaledWidth = image.size.width * image.scale
        let scaledHeight = image.size.height * image.scale
        return CGSize(width: scaledWidth, height: scaledHeight)
    }

    private static func makeRenderer(size: CGSize) -> UIGraphicsImageRenderer {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format)
    }
}
