import SwiftUI
import AVFoundation

struct WordDetailView: View {
    let project: Project
    let wordID: String

    @ObservedObject var viewModel: ProjectDetailViewModel
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speechPlayer = WordSpeechPlayer()
    @State private var editorMode: WordEditorSheet.Mode?
    @State private var currentWordID: String

    init(project: Project, wordID: String, viewModel: ProjectDetailViewModel) {
        self.project = project
        self.wordID = wordID
        self._viewModel = ObservedObject(wrappedValue: viewModel)
        self._currentWordID = State(initialValue: wordID)
    }

    private var currentWord: Word? {
        viewModel.words.first(where: { $0.id == currentWordID })
    }

    private var currentIndex: Int? {
        viewModel.words.firstIndex(where: { $0.id == currentWordID })
    }

    private var canGoPrev: Bool {
        guard let idx = currentIndex else { return false }
        return idx > 0
    }

    private var canGoNext: Bool {
        guard let idx = currentIndex else { return false }
        return idx < viewModel.words.count - 1
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            AppBackground()

            if let word = currentWord {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if let errorMessage = viewModel.errorMessage, !errorMessage.isEmpty {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 13))
                                    .foregroundStyle(MerkenTheme.danger)
                                Text(errorMessage)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(MerkenTheme.danger)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                        }

                        wordHeaderSection(for: word)
                            .padding(.horizontal, 20)
                            .padding(.top, 68)
                            .padding(.bottom, 16)

                        rowDivider

                        // 発音記号（常に表示）
                        pronunciationRow(for: word)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)

                        rowDivider

                        // 日本語訳
                        meaningRow(for: word)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 16)

                        rowDivider

                        // 例文（常に表示）
                        exampleSection(for: word)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 16)

                        if let related = nonEmptyRelatedWords(for: word), !related.isEmpty {
                            rowDivider
                            relatedWordsGroupedSection(related)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                        }

                        if let patterns = nonEmptyUsagePatterns(for: word), !patterns.isEmpty {
                            rowDivider
                            usagePatternsSection(patterns)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                        }

                        if let sections = word.customSections, !sections.isEmpty {
                            ForEach(sections) { section in
                                rowDivider
                                VStack(alignment: .leading, spacing: 8) {
                                    if !section.title.isEmpty {
                                        Text(section.title)
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundStyle(MerkenTheme.primaryText)
                                    }
                                    if !section.content.isEmpty {
                                        Text(section.content)
                                            .font(.system(size: 15))
                                            .foregroundStyle(MerkenTheme.secondaryText)
                                            .lineSpacing(3)
                                    }
                                }
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                            }
                        }

                        rowDivider
                    }
                    .padding(.bottom, 100)
                }
                .disableTopScrollEdgeEffectIfAvailable()


            } else {
                VStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(MerkenTheme.mutedText)
                    Text("この単語は表示できません")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("一覧に戻って選び直してください。")
                        .font(.system(size: 13))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                .padding(24)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .overlay(alignment: .top) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .frame(width: 44, height: 44)
                        .background(MerkenTheme.surface, in: .circle)
                        .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)

                Spacer()

                if let word = currentWord {
                    Button {
                        editorMode = .edit(existing: word)
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .frame(width: 44, height: 44)
                            .background(MerkenTheme.surface, in: .circle)
                            .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .sheet(item: $editorMode, content: editorSheet)
    }

    // MARK: - Word Header

    private func wordHeaderSection(for word: Word) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(word.english)
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(4)
                .frame(maxWidth: .infinity, alignment: .leading)

            statusSegmentedControl(currentStatus: word.status)
                .fixedSize(horizontal: true, vertical: false)
        }
    }

    private func statusSegmentedControl(currentStatus: WordStatus) -> some View {
        let (label, color): (String, Color) = {
            switch currentStatus {
            case .new:      return ("未学習", MerkenTheme.mutedText)
            case .review:   return ("学習中", MerkenTheme.accentBlue)
            case .mastered: return ("習得済", MerkenTheme.success)
            }
        }()
        return Text(label)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(color.opacity(0.1), in: Capsule())
            .overlay(Capsule().stroke(color, lineWidth: 1.5))
    }

    // MARK: - Pronunciation（データがなくても常に表示）

    private func pronunciationRow(for word: Word) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 10) {
                if let pronunciation = trimmed(word.pronunciation) {
                    Text(pronunciation)
                        .font(.system(size: 15, weight: .medium, design: .rounded))
                        .foregroundStyle(MerkenTheme.secondaryText)
                } else {
                    Text("―")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Button {
                    speechPlayer.speak(word.english)
                    MerkenHaptic.light()
                } label: {
                    Image(systemName: "speaker.wave.2")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
            )

            Spacer()

            Button {
                Task { await cycleVocabularyType(for: word) }
            } label: {
                switch word.vocabularyType {
                case .active:
                    Text("A")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(MerkenTheme.accentBlue, in: Circle())
                case .passive:
                    Text("P")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(MerkenTheme.secondaryText.opacity(0.5), in: Circle())
                case .none:
                    Text("—")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                        .frame(width: 28, height: 28)
                        .overlay(Circle().stroke(MerkenTheme.borderLight, lineWidth: 1.5))
                }
            }
            .buttonStyle(.plain)

            Button {
                Task { await toggleFavorite(for: word) }
            } label: {
                Image(systemName: word.isFavorite ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 20))
                    .foregroundStyle(word.isFavorite ? Color.yellow : MerkenTheme.mutedText)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Japanese Meaning

    private func meaningRow(for word: Word) -> some View {
        let posLabels = partOfSpeechLabels(for: word)
        let posText = posLabels.isEmpty ? nil : "(\(posLabels.joined(separator: "・")))"

        return Group {
            if let posText {
                (Text(posText + " ")
                    .font(.system(size: 17))
                    .foregroundColor(MerkenTheme.mutedText)
                 + Text(word.japanese)
                    .font(.system(size: 17))
                    .foregroundColor(MerkenTheme.primaryText)
                )
                .lineSpacing(3)
            } else {
                Text(word.japanese)
                    .font(.system(size: 17))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineSpacing(3)
            }
        }
    }

    // MARK: - Example Section（データがなくても常に表示）

    private func exampleSection(for word: Word) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("例文")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            if let exampleSentence = trimmed(word.exampleSentence) {
                HStack(alignment: .top, spacing: 14) {
                    Text(highlightedAttributedString(exampleSentence, keyword: word.english))
                        .font(.system(size: 16, weight: .medium))
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        speechPlayer.speak(exampleSentence)
                        MerkenHaptic.light()
                    } label: {
                        Image(systemName: "speaker.wave.2")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }

                if let exampleSentenceJa = trimmed(word.exampleSentenceJa) {
                    Text(exampleSentenceJa)
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .lineSpacing(3)
                }
            } else {
                Text("例文はまだ生成されていません")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .italic()
            }
        }
    }

    private func highlightedAttributedString(_ sentence: String, keyword: String) -> AttributedString {
        var attributed = AttributedString(sentence)
        let keywordLower = keyword.lowercased()
        let sentenceLower = sentence.lowercased()
        var searchStart = sentenceLower.startIndex

        while searchStart < sentenceLower.endIndex,
              let matchRange = sentenceLower.range(
                  of: keywordLower,
                  options: .caseInsensitive,
                  range: searchStart..<sentenceLower.endIndex
              ) {
            // AttributedStringの対応rangeに変換
            let attrStart = attributed.index(
                attributed.startIndex,
                offsetByCharacters: sentenceLower.distance(from: sentenceLower.startIndex, to: matchRange.lowerBound)
            )
            let attrEnd = attributed.index(
                attrStart,
                offsetByCharacters: sentenceLower.distance(from: matchRange.lowerBound, to: matchRange.upperBound)
            )
            attributed[attrStart..<attrEnd].foregroundColor = UIColor(MerkenTheme.accentBlue)
            attributed[attrStart..<attrEnd].backgroundColor = UIColor(MerkenTheme.accentBlue.opacity(0.15))
            attributed[attrStart..<attrEnd].font = UIFont.systemFont(ofSize: 16, weight: .bold)

            searchStart = matchRange.upperBound
        }
        return attributed
    }

    private func highlightedSentence(_ sentence: String, keyword: String) -> Text {
        // 単語のベース形（先頭大文字対応・複数形・ing形なども部分一致でヒット）
        let keywordLower = keyword.lowercased()
        let sentenceLower = sentence.lowercased()

        var result = Text("")
        var searchStart = sentence.startIndex

        while searchStart < sentence.endIndex {
            guard let matchRange = sentenceLower.range(
                of: keywordLower,
                options: [.caseInsensitive],
                range: searchStart..<sentence.endIndex
            ) else {
                // 残りをそのまま追加
                let remaining = String(sentence[searchStart...])
                result = result + Text(remaining).foregroundColor(MerkenTheme.primaryText)
                break
            }

            // マッチ前のテキスト
            let before = String(sentence[searchStart..<matchRange.lowerBound])
            if !before.isEmpty {
                result = result + Text(before).foregroundColor(MerkenTheme.primaryText)
            }

            // ハイライト部分
            let match = String(sentence[matchRange])
            result = result + Text(match)
                .bold()
                .foregroundColor(MerkenTheme.accentBlue)

            searchStart = matchRange.upperBound
        }

        return result
    }

    // MARK: - Related Words (grouped by relation)

    private func relatedWordsGroupedSection(_ relatedWords: [RelatedWord]) -> some View {
        let groups = Dictionary(grouping: relatedWords, by: { $0.relation })
        let sortedKeys = groups.keys.sorted { relationSortKey($0) < relationSortKey($1) }

        return VStack(alignment: .leading, spacing: 16) {
            ForEach(sortedKeys, id: \.self) { relation in
                if let words = groups[relation], !words.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(relationDisplayName(relation))
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)

                        Text(words.map { $0.term }.joined(separator: "; "))
                            .font(.system(size: 15))
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .lineSpacing(3)
                    }
                }
            }
        }
    }

    private func relationSortKey(_ relation: String) -> Int {
        switch relation.lowercased() {
        case "synonym", "類義語": return 0
        case "antonym", "対義語": return 1
        case "derivative", "派生語": return 2
        default: return 3
        }
    }

    private func relationDisplayName(_ relation: String) -> String {
        switch relation.lowercased() {
        case "synonym", "類義語": return "類義語"
        case "antonym", "対義語": return "対義語"
        case "derivative", "派生語": return "派生語"
        case "related", "関連語": return "関連語"
        default: return relation
        }
    }

    // MARK: - Usage Patterns

    private func usagePatternsSection(_ patterns: [UsagePattern]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("使い方")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)

            VStack(spacing: 14) {
                ForEach(Array(patterns.enumerated()), id: \.offset) { _, pattern in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .top, spacing: 8) {
                            Text(pattern.pattern)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            if let register = trimmed(pattern.register) {
                                Text(register)
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(MerkenTheme.warning)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(MerkenTheme.warningLight, in: Capsule())
                            }
                        }

                        Text(pattern.meaningJa)
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        if let example = trimmed(pattern.example) {
                            Text(example)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .padding(.top, 2)
                        }

                        if let exampleJa = trimmed(pattern.exampleJa) {
                            Text(exampleJa)
                                .font(.system(size: 12))
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                    }
                }
            }
        }
    }


    // MARK: - Shared UI

    private var rowDivider: some View {
        Rectangle()
            .fill(MerkenTheme.borderLight)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
    }

    // MARK: - Data Helpers

    private func hasExample(for word: Word) -> Bool {
        trimmed(word.exampleSentence) != nil || trimmed(word.exampleSentenceJa) != nil
    }

    private func nonEmptyRelatedWords(for word: Word) -> [RelatedWord]? {
        let filtered = (word.relatedWords ?? []).filter { item in
            trimmed(item.term) != nil && trimmed(item.relation) != nil
        }
        return filtered.isEmpty ? nil : filtered
    }

    private func nonEmptyUsagePatterns(for word: Word) -> [UsagePattern]? {
        let filtered = (word.usagePatterns ?? []).filter { item in
            trimmed(item.pattern) != nil && trimmed(item.meaningJa) != nil
        }
        return filtered.isEmpty ? nil : filtered
    }

    private func partOfSpeechLabels(for word: Word) -> [String] {
        var seen: Set<String> = []
        return (word.partOfSpeechTags ?? []).compactMap { tag in
            let label = partOfSpeechLabel(for: tag)
            guard seen.insert(label).inserted else { return nil }
            return label
        }
    }

    private func partOfSpeechLabel(for rawTag: String) -> String {
        switch normalizedPartOfSpeechKey(from: rawTag) {
        case "noun":       return "名詞"
        case "verb":       return "動詞"
        case "adjective":  return "形容詞"
        case "adverb":     return "副詞"
        case "idiom":      return "イディオム"
        case "phrasal_verb": return "句動詞"
        case "preposition": return "前置詞"
        case "conjunction": return "接続詞"
        case "pronoun":    return "代名詞"
        case "determiner": return "限定詞"
        case "interjection": return "感動詞"
        case "auxiliary":  return "助動詞"
        default:           return "その他"
        }
    }

    private func normalizedPartOfSpeechKey(from rawTag: String) -> String {
        let normalized = rawTag
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")

        switch normalized {
        case "noun", "n", "名詞":                     return "noun"
        case "verb", "v", "動詞":                     return "verb"
        case "adjective", "adj", "形容詞":            return "adjective"
        case "adverb", "adv", "副詞":                 return "adverb"
        case "idiom", "熟語", "イディオム", "phrase", "フレーズ", "idiomatic_expression": return "idiom"
        case "phrasal_verb", "句動詞":                return "phrasal_verb"
        case "preposition", "前置詞":                 return "preposition"
        case "conjunction", "接続詞":                 return "conjunction"
        case "pronoun", "代名詞":                     return "pronoun"
        case "determiner", "限定詞":                  return "determiner"
        case "interjection", "感動詞":                return "interjection"
        case "auxiliary", "助動詞":                   return "auxiliary"
        default:                                      return "other"
        }
    }

    private func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - Actions

    private func toggleFavorite(for word: Word) async {
        MerkenHaptic.selection()
        await viewModel.updateWord(
            wordId: word.id,
            patch: WordPatch(isFavorite: !word.isFavorite),
            projectId: project.id,
            using: appState
        )
    }

    private func cycleVocabularyType(for word: Word) async {
        MerkenHaptic.selection()
        let next: VocabularyType? = {
            switch word.vocabularyType {
            case .none: return .active
            case .active: return .passive
            case .passive: return nil
            }
        }()
        await viewModel.updateWord(
            wordId: word.id,
            patch: WordPatch(vocabularyType: .some(next)),
            projectId: project.id,
            using: appState
        )
    }

    private func updateStatus(_ status: WordStatus, current: WordStatus) async {
        guard status != current else { return }
        MerkenHaptic.selection()
        await viewModel.updateWord(
            wordId: currentWordID,
            patch: WordPatch(status: status),
            projectId: project.id,
            using: appState
        )
    }

    @ViewBuilder
    private func editorSheet(mode: WordEditorSheet.Mode) -> some View {
        WordEditorSheet(mode: mode, projectId: project.id) { input in
            Task {
                switch mode {
                case .create:
                    await viewModel.addWord(
                        input: WordInput(
                            projectId: project.id,
                            english: input.english,
                            japanese: input.japanese,
                            distractors: input.distractors,
                            exampleSentence: input.exampleSentence,
                            exampleSentenceJa: input.exampleSentenceJa,
                            pronunciation: input.pronunciation
                        ),
                        projectId: project.id,
                        using: appState
                    )
                case .edit(let existing):
                    await viewModel.updateWord(
                        wordId: existing.id,
                        patch: WordPatch(
                            english: input.english,
                            japanese: input.japanese,
                            distractors: input.distractors,
                            exampleSentence: .some(input.exampleSentence)
                        ),
                        projectId: project.id,
                        using: appState
                    )
                }
            }
        }
    }
}

@MainActor
private final class WordSpeechPlayer: ObservableObject {
    private let synthesizer = AVSpeechSynthesizer()

    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        synthesizer.stopSpeaking(at: .immediate)

        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        synthesizer.speak(utterance)
    }
}
