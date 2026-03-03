import Foundation
import UniformTypeIdentifiers
import MobileCoreServices

enum ShareInputExtractor {
    private static let highPriorityTypeIdentifiers: [String] = [
        UTType.plainText.identifier,
        UTType.text.identifier,
        "public.utf8-plain-text",
        "com.apple.uikit.attributedstring",
        UTType.html.identifier,
        "public.rtf",
        UTType.url.identifier,
        "public.property-list",
        UTType.data.identifier
    ]

    private static let payloadNoiseMarkers: [String] = [
        "bplist",
        "bplist00",
        "version",
        "nskeyedarchiver",
        "$archiver",
        "$objects",
        "$top",
        "cf$uid",
        "ns.keys",
        "ns.objects",
        "ns.string",
        "x$versiony$archiver"
    ]

    private static let payloadNoiseWords: Set<String> = [
        "bplist00", "version", "archiver", "top", "objects", "object", "keyed", "archive",
        "nskeyedarchiver", "ns", "key", "keys", "value", "values", "class", "root", "uid",
        "cfuid", "string", "array", "dictionary", "true", "false", "null", "nullb", "nulla",
        "nullc", "troot", "nskeys", "nsobjects", "nsstring", "nsdata", "nsnumber",
        "nsdictionary", "nsarray", "bytes", "offset", "count", "index"
    ]

    private static let payloadNoisePrefixes: [String] = [
        "bplist",
        "version",
        "archiver",
        "object",
        "objects",
        "top",
        "key",
        "keys",
        "uid",
        "ns",
        "cfuid",
        "plist",
        "troot",
        "null",
        "$"
    ]

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
        let uniqueURLs = dedupe(urlCandidates + extractEmbeddedURLs(from: uniqueTexts))

        if uniqueTexts.isEmpty, uniqueURLs.isEmpty {
            return nil
        }

        let cleanedSourceLines = cleanedSourceLines(from: uniqueTexts)
        let sourceText = cleanedSourceLines.isEmpty
            ? (uniqueURLs.first ?? "")
            : cleanedSourceLines.joined(separator: "\n")

        let pair = detectBilingualPair(textCandidates: uniqueTexts, urlCandidates: uniqueURLs)
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

    private static func cleanedSourceLines(from values: [String]) -> [String] {
        let lines = values
            .flatMap { $0.components(separatedBy: .newlines) }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { !isPayloadNoise($0) }
            .filter { !isNoiseLabel($0) }
        return dedupe(lines)
    }

    private static func extractEmbeddedURLs(from values: [String]) -> [String] {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return []
        }
        var urls: [String] = []
        for value in values {
            let range = NSRange(location: 0, length: (value as NSString).length)
            detector.enumerateMatches(in: value, options: [], range: range) { match, _, _ in
                guard let url = match?.url?.absoluteString, !url.isEmpty else { return }
                urls.append(url)
            }
        }
        return dedupe(urls)
    }

    private static func allTexts(from attachments: [NSItemProvider]) async -> [String] {
        var results: [String] = []
        for provider in attachments {
            let typeIdentifiers = candidateTypeIdentifiers(for: provider)
            for type in typeIdentifiers where provider.hasItemConformingToTypeIdentifier(type) {
                if let value = await loadItem(provider: provider, typeIdentifier: type) {
                    results.append(contentsOf: extractStrings(from: value, typeIdentifier: type))
                }
            }
            results.append(contentsOf: await loadObjectStrings(from: provider))
        }
        let expanded = dedupe(results).flatMap(expandTextCandidate(_:))
        return dedupe(expanded).filter(isUsefulTextCandidate(_:))
    }

    private static func allURLStrings(from attachments: [NSItemProvider]) async -> [String] {
        var results: [String] = []
        for provider in attachments {
            let typeIdentifiers = candidateTypeIdentifiers(for: provider)
            for type in typeIdentifiers where provider.hasItemConformingToTypeIdentifier(type) {
                if let value = await loadItem(provider: provider, typeIdentifier: type) {
                    let strings = extractStrings(from: value, typeIdentifier: type)
                    for string in strings where looksLikeURL(string) {
                        results.append(string)
                    }
                }
            }
            for value in await loadObjectStrings(from: provider) where looksLikeURL(value) {
                results.append(value)
            }
        }
        return dedupe(results)
    }

    private static func candidateTypeIdentifiers(for provider: NSItemProvider) -> [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for value in highPriorityTypeIdentifiers + provider.registeredTypeIdentifiers where !value.isEmpty {
            if seen.insert(value).inserted {
                ordered.append(value)
            }
        }
        return ordered
    }

    private static func looksLikeURL(_ value: String) -> Bool {
        let lower = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            return true
        }
        return lower.contains("://")
    }

    private static func extractStrings(from value: Any, typeIdentifier: String) -> [String] {
        if let text = value as? String {
            return [text]
        }
        if let text = value as? NSString {
            return [String(text)]
        }
        if let url = value as? URL {
            return [url.absoluteString]
        }
        if let attributed = value as? NSAttributedString {
            return [attributed.string]
        }
        if let data = value as? Data {
            return extractStrings(from: data, typeIdentifier: typeIdentifier)
        }
        if let array = value as? [Any] {
            return array.flatMap { extractStrings(from: $0, typeIdentifier: typeIdentifier) }
        }
        if let dict = value as? [AnyHashable: Any] {
            return dict.values.flatMap { extractStrings(from: $0, typeIdentifier: typeIdentifier) }
        }
        return []
    }

    private static func extractStrings(from data: Data, typeIdentifier: String) -> [String] {
        var values: [String] = []

        if looksLikeBinaryPlist(data) {
            if let unarchived = decodeKeyedArchive(data) {
                values.append(contentsOf: extractStrings(from: unarchived, typeIdentifier: UTType.propertyList.identifier))
            }

            if let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) {
                values.append(contentsOf: extractStrings(from: plist, typeIdentifier: UTType.propertyList.identifier))
            }
        }

        if let utf8 = String(data: data, encoding: .utf8), isUsefulTextCandidate(utf8) {
            values.append(utf8)
        }
        if typeIdentifier == UTType.html.identifier || typeIdentifier == "public.rtf" {
            let documentType: NSAttributedString.DocumentType = typeIdentifier == UTType.html.identifier ? .html : .rtf
            if let attributed = try? NSAttributedString(
                data: data,
                options: [
                    .documentType: documentType,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ],
                documentAttributes: nil
            ) {
                values.append(contentsOf: attributed.string.components(separatedBy: .newlines))
            }
        }
        return dedupe(values).filter(isUsefulTextCandidate(_:))
    }

    private static func decodeKeyedArchive(_ data: Data) -> Any? {
        let allowedClasses: [AnyClass] = [
            NSArray.self,
            NSDictionary.self,
            NSSet.self,
            NSString.self,
            NSAttributedString.self,
            NSMutableAttributedString.self,
            NSURL.self,
            NSNumber.self,
            NSData.self
        ]
        return try? NSKeyedUnarchiver.unarchivedObject(ofClasses: allowedClasses, from: data)
    }

    private static func detectBilingualPair(
        textCandidates: [String],
        urlCandidates: [String]
    ) -> (english: String?, japanese: String?) {
        let rawLines = textCandidates
            .flatMap { $0.components(separatedBy: .newlines) }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { !isPayloadNoise($0) }

        var lines = rawLines.filter { !isNoiseLabel($0) }

        let pairFromURL = detectPairFromURLs(urlCandidates)
        if let englishFromURL = pairFromURL.english {
            lines.append(englishFromURL)
        }
        if let japaneseFromURL = pairFromURL.japanese {
            lines.append(japaneseFromURL)
        }

        let pairFromLabels = detectPairFromLabels(rawLines)
        if let englishFromLabels = pairFromLabels.english {
            lines.append(englishFromLabels)
        }
        if let japaneseFromLabels = pairFromLabels.japanese {
            lines.append(japaneseFromLabels)
        }

        let pairFromSameLine = detectPairFromMixedLine(lines)
        if let englishFromMixed = pairFromSameLine.english {
            lines.append(englishFromMixed)
        }
        if let japaneseFromMixed = pairFromSameLine.japanese {
            lines.append(japaneseFromMixed)
        }

        let englishCandidates = lines.filter(isLikelyEnglishPhrase(_:))
        let japaneseCandidates = lines.filter(isLikelyJapanesePhrase(_:))

        let english = pairFromLabels.english
            ?? pairFromSameLine.english
            ?? pickBestEnglish(from: englishCandidates)
            ?? pairFromURL.english

        let japanese = pairFromLabels.japanese
            ?? pairFromSameLine.japanese
            ?? pickBestJapanese(from: japaneseCandidates)
            ?? pairFromURL.japanese

        return (english: english, japanese: japanese)
    }

    private static func detectPairFromLabels(_ lines: [String]) -> (english: String?, japanese: String?) {
        func normalizeLabel(_ value: String) -> String {
            value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .replacingOccurrences(of: "：", with: ":")
        }

        let englishLabels: Set<String> = ["english", "英語", "source", "source text", "原文"]
        let japaneseLabels: Set<String> = ["japanese", "日本語", "translation", "翻訳", "訳文"]

        var english: String?
        var japanese: String?

        for (index, raw) in lines.enumerated() {
            let label = normalizeLabel(raw)
            if english == nil, englishLabels.contains(label) {
                english = nextMeaningfulLine(after: index, in: lines, validator: isLikelyEnglishPhrase(_:))
            }
            if japanese == nil, japaneseLabels.contains(label) {
                japanese = nextMeaningfulLine(after: index, in: lines, validator: isLikelyJapanesePhrase(_:))
            }
            if english != nil, japanese != nil {
                break
            }
        }

        return (english: english, japanese: japanese)
    }

    private static func nextMeaningfulLine(
        after index: Int,
        in lines: [String],
        validator: (String) -> Bool
    ) -> String? {
        guard index + 1 < lines.count else { return nil }
        for candidate in lines[(index + 1)...] {
            let value = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            if value.isEmpty || isNoiseLabel(value) {
                continue
            }
            if validator(value) {
                return value
            }
        }
        return nil
    }

    private static func detectPairFromMixedLine(_ lines: [String]) -> (english: String?, japanese: String?) {
        let separators = [" | ", " / ", " → ", " -> ", "：", ":"]
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            for separator in separators where trimmed.contains(separator) {
                let parts = trimmed.components(separatedBy: separator).map {
                    $0.trimmingCharacters(in: .whitespacesAndNewlines)
                }.filter { !$0.isEmpty }
                if parts.count < 2 { continue }

                let first = parts[0]
                let second = parts[1]
                if isLikelyEnglishPhrase(first), isLikelyJapanesePhrase(second) {
                    return (english: first, japanese: second)
                }
                if isLikelyJapanesePhrase(first), isLikelyEnglishPhrase(second) {
                    return (english: second, japanese: first)
                }
            }
        }
        return (english: nil, japanese: nil)
    }

    private static func detectPairFromURLs(_ urls: [String]) -> (english: String?, japanese: String?) {
        var english: String?
        var japanese: String?

        for raw in urls {
            guard let components = URLComponents(string: raw) else { continue }
            let items = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
            guard !items.isEmpty else { continue }

            let sourceText = items["text"] ?? items["q"] ?? items["query"] ?? ""
            let sl = (items["sl"] ?? items["source"] ?? "").lowercased()
            let tl = (items["tl"] ?? items["target"] ?? "").lowercased()

            if sourceText.isEmpty { continue }
            let normalizedSource = sourceText.trimmingCharacters(in: .whitespacesAndNewlines)
            if normalizedSource.isEmpty { continue }

            if sl == "en" || sl.hasPrefix("en-") {
                if english == nil { english = normalizedSource }
            } else if sl == "ja" || sl.hasPrefix("ja-") {
                if japanese == nil { japanese = normalizedSource }
            } else {
                if english == nil, isLikelyEnglishPhrase(normalizedSource) {
                    english = normalizedSource
                }
                if japanese == nil, isLikelyJapanesePhrase(normalizedSource) {
                    japanese = normalizedSource
                }
            }

            if tl == "en" || tl.hasPrefix("en-") {
                if japanese == nil, isLikelyJapanesePhrase(normalizedSource) {
                    japanese = normalizedSource
                }
            } else if tl == "ja" || tl.hasPrefix("ja-") {
                if english == nil, isLikelyEnglishPhrase(normalizedSource) {
                    english = normalizedSource
                }
            }
        }

        return (english: english, japanese: japanese)
    }

    private static func isNoiseLabel(_ value: String) -> Bool {
        let normalized = value.lowercased()
        let labels: Set<String> = [
            "英語", "日本語", "ホーム", "新しい翻訳", "翻訳",
            "english", "japanese", "home", "new translation", "translation"
        ]
        return labels.contains(normalized)
    }

    private static func isPayloadNoise(_ value: String) -> Bool {
        let normalized = value.lowercased()
        if isBinaryArtifactToken(normalized) {
            return true
        }
        if payloadNoiseMarkers.contains(where: { normalized.contains($0) }) {
            return true
        }
        if payloadNoisePrefixes.contains(where: { normalized.hasPrefix($0) }) {
            return true
        }

        // Large binary-ish fragments often appear as a single long token packed with $/UID markers.
        if normalized.count > 60, normalized.contains("$"), normalized.contains("uid") {
            return true
        }

        return false
    }

    private static func isBinaryArtifactToken(_ value: String) -> Bool {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return false }
        if payloadNoiseWords.contains(normalized) {
            return true
        }
        if payloadNoisePrefixes.contains(where: { normalized.hasPrefix($0) }) {
            return true
        }
        if normalized.contains("null"), normalized.count <= 16 {
            return true
        }
        if normalized.hasPrefix("troot") || normalized.hasPrefix("xroot") {
            return true
        }
        return false
    }

    private static func expandTextCandidate(_ value: String) -> [String] {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        guard isPayloadNoise(trimmed) else { return [trimmed] }

        var extracted: [String] = []

        if let jpRegex = try? NSRegularExpression(pattern: #"[ぁ-ゖァ-ヺ一-龯ー]{1,}"#) {
            let ns = trimmed as NSString
            let matches = jpRegex.matches(in: trimmed, range: NSRange(location: 0, length: ns.length))
            extracted.append(contentsOf: matches.map { ns.substring(with: $0.range) })
        }

        if let enRegex = try? NSRegularExpression(pattern: #"[A-Za-z][A-Za-z'\-]{1,63}"#) {
            let ns = trimmed as NSString
            let matches = enRegex.matches(in: trimmed, range: NSRange(location: 0, length: ns.length))
            let words = matches.map { ns.substring(with: $0.range) }
            for word in words {
                let lower = word.lowercased()
                if payloadNoiseWords.contains(lower) { continue }
                if payloadNoisePrefixes.contains(where: { lower.hasPrefix($0) }) { continue }
                if isBinaryArtifactToken(lower) { continue }
                if lower.hasPrefix("ns"), payloadNoiseWords.contains(String(lower.dropFirst(2))) { continue }
                extracted.append(word)
            }
        }

        return dedupe(extracted)
    }

    private static func isUsefulTextCandidate(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }
        if isPayloadNoise(trimmed) { return false }
        if trimmed.count > 1000 { return false }

        // Reject control-heavy strings.
        let controlCount = trimmed.unicodeScalars.filter { scalar in
            CharacterSet.controlCharacters.contains(scalar)
                && scalar != "\n"
                && scalar != "\r"
                && scalar != "\t"
        }.count
        if controlCount > 0 {
            return false
        }

        return true
    }

    private static func looksLikeBinaryPlist(_ data: Data) -> Bool {
        let magic = "bplist00".data(using: .utf8) ?? Data()
        guard magic.count > 0, data.count >= magic.count else { return false }
        return data.starts(with: magic)
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
        let lower = trimmed.lowercased()
        if isBinaryArtifactToken(lower) {
            return false
        }
        if payloadNoisePrefixes.contains(where: { lower.hasPrefix($0) }) {
            return false
        }
        if isPayloadNoise(trimmed) {
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

    private static func loadItem(provider: NSItemProvider, typeIdentifier: String) async -> Any? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, _ in
                continuation.resume(returning: item)
            }
        }
    }

    private static func loadObjectStrings(from provider: NSItemProvider) async -> [String] {
        var values: [String] = []

        if provider.canLoadObject(ofClass: NSString.self),
           let text = await loadObject(from: provider, as: NSString.self) {
            values.append(String(text))
        }

        if provider.canLoadObject(ofClass: NSAttributedString.self),
           let attributed = await loadObject(from: provider, as: NSAttributedString.self) {
            values.append(attributed.string)
        }

        if provider.canLoadObject(ofClass: NSURL.self),
           let url = await loadObject(from: provider, as: NSURL.self) as URL? {
            values.append(url.absoluteString)
        }

        return dedupe(values)
    }

    private static func loadObject<T: NSItemProviderReading>(
        from provider: NSItemProvider,
        as type: T.Type
    ) async -> T? {
        await withCheckedContinuation { continuation in
            provider.loadObject(ofClass: type) { object, _ in
                continuation.resume(returning: object as? T)
            }
        }
    }
}
