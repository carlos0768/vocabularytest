import Foundation
import UniformTypeIdentifiers
import MobileCoreServices

enum ShareInputExtractor {
    static func extract(from inputItems: [Any]) async -> ShareImportInput? {
        let extensionItems = inputItems.compactMap { $0 as? NSExtensionItem }
        var textCandidates: [String] = []
        var urlCandidates: [String] = []

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            let texts = await allTexts(from: attachments)
            if !texts.isEmpty {
                textCandidates.append(contentsOf: texts)
            }

            let urls = await allURLStrings(from: attachments)
            if !urls.isEmpty {
                urlCandidates.append(contentsOf: urls)
            }
        }

        let uniqueTexts = dedupe(textCandidates)
        let uniqueURLs = dedupe(urlCandidates)

        if uniqueTexts.isEmpty, uniqueURLs.isEmpty {
            return nil
        }

        let sourceText = uniqueTexts.isEmpty
            ? (uniqueURLs.first ?? "")
            : uniqueTexts.joined(separator: "\n")

        let pair = detectBilingualPair(from: uniqueTexts)
        return ShareImportInput(
            text: sourceText,
            sourceApp: nil,
            detectedEnglish: pair.english,
            detectedJapanese: pair.japanese
        )
    }

    private static func dedupe(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if normalized.isEmpty { continue }
            if seen.insert(normalized).inserted {
                result.append(normalized)
            }
        }
        return result
    }

    private static func allTexts(from attachments: [NSItemProvider]) async -> [String] {
        var results: [String] = []
        for provider in attachments {
            let types = [UTType.plainText.identifier, UTType.text.identifier]
            for type in types where provider.hasItemConformingToTypeIdentifier(type) {
                if let value = await loadItem(provider: provider, typeIdentifier: type) {
                    results.append(contentsOf: textValues(from: value))
                    break
                }
            }
        }
        return dedupe(results)
    }

    private static func allURLStrings(from attachments: [NSItemProvider]) async -> [String] {
        var results: [String] = []
        for provider in attachments {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let value = await loadItem(provider: provider, typeIdentifier: UTType.url.identifier) {
                if let url = value as? URL {
                    results.append(url.absoluteString)
                    continue
                }

                if let text = value as? String {
                    results.append(text)
                    continue
                }

                if let text = value as? NSString {
                    results.append(String(text))
                }
            }
        }
        return dedupe(results)
    }

    private static func textValues(from value: NSSecureCoding) -> [String] {
        if let text = value as? String {
            return [text]
        }
        if let text = value as? NSString {
            return [String(text)]
        }
        if let data = value as? Data, let text = String(data: data, encoding: .utf8) {
            return [text]
        }
        if let url = value as? URL {
            return [url.absoluteString]
        }
        return []
    }

    private static func detectBilingualPair(from candidates: [String]) -> (english: String?, japanese: String?) {
        let lines = candidates
            .flatMap { $0.components(separatedBy: .newlines) }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { !isNoiseLabel($0) }

        let englishCandidates = lines.filter(isLikelyEnglishPhrase(_:))
        let japaneseCandidates = lines.filter(isLikelyJapanesePhrase(_:))

        return (
            english: pickBestEnglish(from: englishCandidates),
            japanese: pickBestJapanese(from: japaneseCandidates)
        )
    }

    private static func isNoiseLabel(_ value: String) -> Bool {
        let normalized = value.lowercased()
        let labels: Set<String> = [
            "英語", "日本語", "ホーム", "新しい翻訳", "翻訳",
            "english", "japanese", "home", "new translation", "translation"
        ]
        return labels.contains(normalized)
    }

    private static func containsJapanese(_ value: String) -> Bool {
        value.range(of: #"[ぁ-ゖァ-ヺ一-龯]"#, options: .regularExpression) != nil
    }

    private static func containsLatin(_ value: String) -> Bool {
        value.range(of: #"[A-Za-z]"#, options: .regularExpression) != nil
    }

    private static func isLikelyEnglishPhrase(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            return false
        }
        if containsJapanese(trimmed) {
            return false
        }
        return containsLatin(trimmed)
    }

    private static func isLikelyJapanesePhrase(_ value: String) -> Bool {
        containsJapanese(value)
    }

    private static func pickBestEnglish(from values: [String]) -> String? {
        let scored = values
            .map { value -> (value: String, score: Int) in
                let words = value.split(whereSeparator: \.isWhitespace).count
                let letters = value.filter { $0.isLetter }.count
                var score = letters
                if words == 1 { score += 12 }
                if words > 3 { score -= 8 }
                if value.count > 60 { score -= 12 }
                return (value, score)
            }
            .sorted { lhs, rhs in
                if lhs.score == rhs.score { return lhs.value.count < rhs.value.count }
                return lhs.score > rhs.score
            }
        return scored.first?.value
    }

    private static func pickBestJapanese(from values: [String]) -> String? {
        values
            .filter { $0.count <= 120 }
            .sorted { lhs, rhs in
                if lhs.count == rhs.count { return lhs < rhs }
                return lhs.count > rhs.count
            }
            .first
    }

    private static func loadItem(provider: NSItemProvider, typeIdentifier: String) async -> NSSecureCoding? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, _ in
                continuation.resume(returning: item as? NSSecureCoding)
            }
        }
    }
}
