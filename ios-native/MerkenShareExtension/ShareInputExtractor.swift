import Foundation
import UniformTypeIdentifiers
import MobileCoreServices

enum ShareInputExtractor {
    static func extract(from inputItems: [Any]) async -> ShareImportInput? {
        let extensionItems = inputItems.compactMap { $0 as? NSExtensionItem }

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }

            if let text = await firstText(from: attachments) {
                return ShareImportInput(text: text, sourceApp: nil)
            }

            if let urlString = await firstURLString(from: attachments) {
                return ShareImportInput(text: urlString, sourceApp: nil)
            }
        }

        return nil
    }

    private static func firstText(from attachments: [NSItemProvider]) async -> String? {
        for provider in attachments {
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let value = await loadItem(provider: provider, typeIdentifier: UTType.plainText.identifier) {
                if let text = value as? String {
                    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !normalized.isEmpty { return normalized }
                }

                if let text = value as? NSString {
                    let normalized = String(text).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !normalized.isEmpty { return normalized }
                }

                if let data = value as? Data,
                   let text = String(data: data, encoding: .utf8) {
                    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !normalized.isEmpty { return normalized }
                }
            }
        }
        return nil
    }

    private static func firstURLString(from attachments: [NSItemProvider]) async -> String? {
        for provider in attachments {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let value = await loadItem(provider: provider, typeIdentifier: UTType.url.identifier) {
                if let url = value as? URL {
                    return url.absoluteString
                }

                if let text = value as? String {
                    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !normalized.isEmpty { return normalized }
                }

                if let text = value as? NSString {
                    let normalized = String(text).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !normalized.isEmpty { return normalized }
                }
            }
        }
        return nil
    }

    private static func loadItem(provider: NSItemProvider, typeIdentifier: String) async -> NSSecureCoding? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, _ in
                continuation.resume(returning: item as? NSSecureCoding)
            }
        }
    }
}
