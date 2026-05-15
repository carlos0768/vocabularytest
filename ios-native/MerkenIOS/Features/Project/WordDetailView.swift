import SwiftUI
import AVFoundation

enum WordDetailPresentation {
    case page
    case modal
}

struct WordDetailView: View {
    let project: Project
    let wordID: String
    let presentation: WordDetailPresentation
    let onClose: (() -> Void)?

    @ObservedObject var viewModel: ProjectDetailViewModel
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speechPlayer = WordSpeechPlayer()
    @State private var editorMode: WordEditorSheet.Mode?
    @State private var currentWordID: String
    @State private var showingDeleteConfirm = false

    init(
        project: Project,
        wordID: String,
        viewModel: ProjectDetailViewModel,
        presentation: WordDetailPresentation = .page,
        onClose: (() -> Void)? = nil
    ) {
        self.project = project
        self.wordID = wordID
        self.presentation = presentation
        self.onClose = onClose
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
        Group {
            switch presentation {
            case .page:
                pageBody
            case .modal:
                modalBody
            }
        }
        .sheet(item: $editorMode, content: editorSheet)
        .alert("この単語を削除しますか？", isPresented: $showingDeleteConfirm) {
            Button("キャンセル", role: .cancel) {}
            Button("削除", role: .destructive) {
                Task { await deleteCurrentWord() }
            }
        } message: {
            Text("この操作は取り消せません。")
        }
    }

    private var pageBody: some View {
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
    }

    private var modalBody: some View {
        Group {
            if let word = currentWord {
                ViewThatFits(in: .vertical) {
                    modalContent(for: word)

                    ScrollView {
                        modalContent(for: word)
                    }
                    .disableTopScrollEdgeEffectIfAvailable()
                }
            } else {
                modalNotFound
            }
        }
        .background(modalPaper)
    }

    // MARK: - Web Modal Presentation

    private func modalContent(for word: Word) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            modalHeader(for: word)
                .padding(.horizontal, 20)
                .padding(.bottom, 12)

            if let errorMessage = viewModel.errorMessage, !errorMessage.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 13, weight: .bold))
                    Text(errorMessage)
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundStyle(MerkenTheme.danger)
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }

            modalWordHero(for: word)
                .padding(.horizontal, 20)
                .padding(.bottom, 18)

            modalDivider

            modalMeaningSection(for: word)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)

            modalDivider

            modalExampleSection(for: word)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)

            if let related = nonEmptyRelatedWords(for: word), !related.isEmpty {
                modalDivider
                modalRelatedSection(related)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
            }

            if let patterns = nonEmptyUsagePatterns(for: word), !patterns.isEmpty {
                modalDivider
                modalUsageSection(patterns)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
            }

            if let sections = word.customSections, !sections.isEmpty {
                ForEach(sections) { section in
                    modalDivider
                    modalCustomSection(section)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                }
            }
        }
        .padding(.top, 16)
        .padding(.bottom, 24)
    }

    private var modalPaper: Color {
        MerkenTheme.notebookPaper
    }

    private var modalDivider: some View {
        Rectangle()
            .fill(MerkenTheme.border)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
    }

    private func modalHeader(for word: Word) -> some View {
        HStack(spacing: 8) {
            modalCircleButton(systemName: "xmark", accessibilityLabel: "閉じる") {
                closeDetail()
            }

            Spacer()

            modalCircleButton(systemName: "pencil", accessibilityLabel: "編集") {
                editorMode = .edit(existing: word)
            }

            modalCircleButton(systemName: "trash", tint: MerkenTheme.danger, accessibilityLabel: "削除") {
                showingDeleteConfirm = true
            }
        }
    }

    private func modalCircleButton(
        systemName: String,
        tint: Color = MerkenTheme.solidInk,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        let shape = Circle()
        return Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(MerkenTheme.surface, in: shape)
                .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
                .background(shape.fill(MerkenTheme.solidShadow).offset(x: 2, y: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }

    private func modalWordHero(for word: Word) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Text(word.english)
                    .font(.system(size: 28, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineSpacing(1)
                    .lineLimit(5)
                    .frame(maxWidth: .infinity, alignment: .leading)

                modalStatusPill(for: word.status)
                    .padding(.top, 2)
            }

            HStack(alignment: .center, spacing: 8) {
                modalPronunciationButton(for: word)
                    .layoutPriority(1)

                Spacer(minLength: 0)

                modalVocabularyTypeButton(for: word)

                Button {
                    Task { await toggleFavorite(for: word) }
                } label: {
                    Image(systemName: word.isFavorite ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(MerkenTheme.accentGreen)
                        .frame(width: 28, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("お気に入り切替")
            }
        }
    }

    private func modalStatusPill(for status: WordStatus) -> some View {
        let style = modalStatusStyle(for: status)
        return Text(style.label)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(style.foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(style.background, in: Capsule())
            .overlay(Capsule().stroke(style.border, lineWidth: 1.25))
            .fixedSize(horizontal: true, vertical: false)
    }

    private func modalStatusStyle(for status: WordStatus) -> (label: String, foreground: Color, background: Color, border: Color) {
        switch status {
        case .new:
            return ("未学習", MerkenTheme.mutedText, MerkenTheme.surface, MerkenTheme.border)
        case .review:
            return ("学習中", MerkenTheme.chartBlue, MerkenTheme.chartBlue.opacity(0.1), MerkenTheme.chartBlue)
        case .mastered:
            return ("習得済", MerkenTheme.success, MerkenTheme.successLight, MerkenTheme.success)
        }
    }

    private func modalPronunciationButton(for word: Word) -> some View {
        Button {
            speechPlayer.speak(word.english)
            MerkenHaptic.light()
        } label: {
            HStack(spacing: 8) {
                Text(trimmed(word.pronunciation) ?? "―")
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)
            }
            .padding(.horizontal, 15)
            .frame(minHeight: 36)
            .background(MerkenTheme.surface, in: Capsule())
            .overlay(Capsule().stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("発音を再生")
    }

    private func modalVocabularyTypeButton(for word: Word) -> some View {
        let vocabularyType = word.vocabularyType
        let label = vocabularyTypeLabel(for: vocabularyType)
        let foreground = vocabularyType == .passive ? MerkenTheme.mutedText : MerkenTheme.accentGreen
        let border = vocabularyType == .passive ? MerkenTheme.mutedText.opacity(0.5) : MerkenTheme.accentGreen
        let background: Color = {
            switch vocabularyType {
            case .active:
                return Color(red: 236 / 255, green: 253 / 255, blue: 245 / 255)
            case .passive:
                return MerkenTheme.mutedText.opacity(0.08)
            case nil:
                return .white
            }
        }()

        return Button {
            Task { await cycleVocabularyType(for: word) }
        } label: {
            HStack(spacing: 6) {
                Text(vocabularyTypeShortLabel(for: vocabularyType))
                    .font(.system(size: 10, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 20, height: 20)
                    .background(vocabularyTypeDotColor(for: vocabularyType), in: Circle())

                Text(label)
                    .font(.system(size: 12, weight: .bold))
                    .lineLimit(1)
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, 11)
            .frame(height: 32)
            .background(background, in: Capsule())
            .overlay(Capsule().stroke(border, lineWidth: 1.25))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("語彙モード: \(label)")
    }

    private func modalMeaningSection(for word: Word) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            modalSectionHeading("MEANING")

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                let posLabels = partOfSpeechLabels(for: word)
                if !posLabels.isEmpty {
                    Text("(\(posLabels.joined(separator: "・")))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                Text(word.japanese)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineSpacing(3)
            }
        }
    }

    private func modalExampleSection(for word: Word) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                modalSectionHeading("EXAMPLE")
                Spacer()
                Text("例文")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            if let exampleSentence = trimmed(word.exampleSentence) {
                let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        Text(modalHighlightedAttributedString(exampleSentence, keyword: word.english))
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Button {
                            speechPlayer.speak(exampleSentence)
                            MerkenHaptic.light()
                        } label: {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(MerkenTheme.mutedText)
                                .frame(width: 36, height: 36)
                                .background(MerkenTheme.surface, in: Circle())
                                .overlay(Circle().stroke(MerkenTheme.border, lineWidth: 1.25))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("例文を再生")
                    }

                    if let exampleSentenceJa = trimmed(word.exampleSentenceJa) {
                        Text(exampleSentenceJa)
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .lineSpacing(3)
                    }
                }
                .padding(16)
                .background(MerkenTheme.surface, in: shape)
                .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
                .background(shape.fill(MerkenTheme.accentGreen).offset(x: 3, y: 3))
            } else {
                Text("例文はまだ生成されていません")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 15)
                    .background(MerkenTheme.surfaceAlt, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(MerkenTheme.border, lineWidth: 1.25)
                    )
            }
        }
    }

    private func modalRelatedSection(_ relatedWords: [RelatedWord]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            modalSectionHeading("RELATED")

            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(Array(relatedWords.enumerated()), id: \.offset) { _, item in
                    Text(item.term)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MerkenTheme.solidInk)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(MerkenTheme.surface, in: Capsule())
                        .overlay(Capsule().stroke(MerkenTheme.border, lineWidth: 1.25))
                }
            }
        }
    }

    private func modalUsageSection(_ patterns: [UsagePattern]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            modalSectionHeading("USAGE")

            VStack(spacing: 12) {
                ForEach(Array(patterns.enumerated()), id: \.offset) { _, pattern in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(pattern.pattern)
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(MerkenTheme.solidInk)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Text(pattern.meaningJa)
                            .font(.system(size: 12))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(MerkenTheme.surfaceAlt, in: UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 10, topTrailingRadius: 10, style: .continuous))
                    .overlay(alignment: .leading) {
                        Rectangle()
                            .fill(MerkenTheme.accentGreen)
                            .frame(width: 3)
                    }
                }
            }
        }
    }

    private func modalCustomSection(_ section: CustomSection) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            modalSectionHeading(section.title)

            Text(section.content.isEmpty ? "—" : section.content)
                .font(.system(size: 13))
                .foregroundStyle(MerkenTheme.solidInk)
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func modalSectionHeading(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .black, design: .monospaced))
            .textCase(.uppercase)
            .foregroundStyle(MerkenTheme.mutedText)
    }

    private var modalNotFound: some View {
        VStack(spacing: 14) {
            Text("単語が見つかりません")
                .font(.system(size: 20, weight: .black))
                .foregroundStyle(MerkenTheme.solidInk)

            modalTextButton(title: "戻る") {
                closeDetail()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }

    private func modalTextButton(title: String, action: @escaping () -> Void) -> some View {
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        return Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(MerkenTheme.solidInk)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(MerkenTheme.surface, in: shape)
                .overlay(shape.stroke(MerkenTheme.solidBorder, lineWidth: 1.25))
                .background(shape.fill(MerkenTheme.solidShadow).offset(x: 2, y: 2))
        }
        .buttonStyle(.plain)
    }

    private func modalHighlightedAttributedString(_ sentence: String, keyword: String) -> AttributedString {
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
            let attrStart = attributed.index(
                attributed.startIndex,
                offsetByCharacters: sentenceLower.distance(from: sentenceLower.startIndex, to: matchRange.lowerBound)
            )
            let attrEnd = attributed.index(
                attrStart,
                offsetByCharacters: sentenceLower.distance(from: matchRange.lowerBound, to: matchRange.upperBound)
            )
            attributed[attrStart..<attrEnd].backgroundColor = UIColor(Color(red: 236 / 255, green: 253 / 255, blue: 245 / 255))
            attributed[attrStart..<attrEnd].foregroundColor = UIColor(MerkenTheme.solidInk)
            attributed[attrStart..<attrEnd].font = UIFont.systemFont(ofSize: 15, weight: .black)

            searchStart = matchRange.upperBound
        }
        return attributed
    }

    private func vocabularyTypeShortLabel(for vocabularyType: VocabularyType?) -> String {
        switch vocabularyType {
        case .active: return "A"
        case .passive: return "P"
        case nil: return "—"
        }
    }

    private func vocabularyTypeLabel(for vocabularyType: VocabularyType?) -> String {
        switch vocabularyType {
        case .active: return "Active"
        case .passive: return "Passive"
        case nil: return "未設定"
        }
    }

    private func vocabularyTypeDotColor(for vocabularyType: VocabularyType?) -> Color {
        switch vocabularyType {
        case .active: return MerkenTheme.accentGreen
        case .passive: return MerkenTheme.mutedText.opacity(0.7)
        case nil: return MerkenTheme.mutedText
        }
    }

    private func closeDetail() {
        if let onClose {
            onClose()
        } else {
            dismiss()
        }
    }

    @MainActor
    private func deleteCurrentWord() async {
        guard let word = currentWord else { return }
        await viewModel.deleteWord(wordId: word.id, projectId: project.id, using: appState)
        closeDetail()
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
                    .foregroundStyle(word.isFavorite ? MerkenTheme.accentGreen : MerkenTheme.mutedText)
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
                Text(meaningAttributedString(posText: posText, meaning: word.japanese))
                    .font(.system(size: 17))
                .lineSpacing(3)
            } else {
                Text(word.japanese)
                    .font(.system(size: 17))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineSpacing(3)
            }
        }
    }

    private func meaningAttributedString(posText: String, meaning: String) -> AttributedString {
        let combined = "\(posText) \(meaning)"
        var attributed = AttributedString(combined)

        if let posRange = attributed.range(of: posText) {
            attributed[posRange].foregroundColor = UIColor(MerkenTheme.mutedText)
        }

        if let meaningRange = attributed.range(of: meaning) {
            attributed[meaningRange].foregroundColor = UIColor(MerkenTheme.primaryText)
        }

        return attributed
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

struct WordDetailModalOverlay: View {
    let project: Project
    @ObservedObject var viewModel: ProjectDetailViewModel
    @Binding var selectedWord: Word?

    var body: some View {
        Group {
            if let word = selectedWord {
                GeometryReader { proxy in
                    let width = min(max(proxy.size.width - 32, 0), 480)
                    let height = min(proxy.size.height * 0.70, 560)
                    let panelShape = RoundedRectangle(cornerRadius: 20, style: .continuous)

                    ZStack {
                        Rectangle()
                            .fill(.ultraThinMaterial)
                            .ignoresSafeArea()

                        Rectangle()
                            .fill(Color.black.opacity(0.45))
                            .ignoresSafeArea()
                            .onTapGesture {
                                MerkenHaptic.light()
                                selectedWord = nil
                            }

                        VStack {
                            Spacer(minLength: 40)

                            WordDetailView(
                                project: project,
                                wordID: word.id,
                                viewModel: viewModel,
                                presentation: .modal,
                                onClose: {
                                    selectedWord = nil
                                }
                            )
                            .frame(width: width, height: height)
                            .background(MerkenTheme.notebookPaper, in: panelShape)
                            .clipShape(panelShape)
                            .background(panelShape.fill(MerkenTheme.solidShadow).offset(x: 4, y: 5))
                            .overlay(panelShape.stroke(MerkenTheme.solidBorder, lineWidth: 1.5))

                            Spacer(minLength: 40)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.horizontal, 16)
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                .zIndex(120)
            }
        }
        .animation(.easeOut(duration: 0.16), value: selectedWord?.id)
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 0
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            x += size.width + (x > 0 ? spacing : 0)
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
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
