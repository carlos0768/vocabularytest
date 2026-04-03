import SwiftUI

struct SharedProjectDetailView: View {
    let summary: SharedProjectSummary

    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = SharedProjectDetailViewModel()

    @State private var editorMode: SharedWordEditorMode?
    @State private var wordToDelete: Word?
    @State private var scrollOffset: CGFloat = 0

    private var project: Project {
        viewModel.project ?? summary.project
    }

    private var accessRole: SharedProjectAccessRole {
        viewModel.project == nil ? summary.accessRole : viewModel.accessRole
    }

    private var canEdit: Bool { accessRole != .viewer }

    // MARK: - Body

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                ZStack {
                    backgroundLayers
                    scrollContent
                }
            }

            bottomActionBar
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editorMode) { mode in
            sharedWordEditorSheet(mode)
        }
        .alert("この単語を削除しますか？", isPresented: Binding(
            get: { wordToDelete != nil },
            set: { if !$0 { wordToDelete = nil } }
        )) {
            Button("削除", role: .destructive) {
                guard let word = wordToDelete else { return }
                Task {
                    await viewModel.deleteWord(wordId: word.id, projectId: project.id, using: appState)
                }
                wordToDelete = nil
            }
            Button("キャンセル", role: .cancel) { wordToDelete = nil }
        } message: {
            Text("共同編集中の単語帳からこの単語が削除されます。")
        }
        .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
        .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
            scrollOffset = value
        }
        .task(id: "\(summary.project.id)-\(appState.dataVersion)") {
            await viewModel.load(projectId: summary.project.id, using: appState)
        }
    }

    // MARK: - Layout

    private var backgroundLayers: some View {
        VStack(spacing: 0) {
            thumbnailBackgroundColor
            MerkenTheme.background
        }
        .ignoresSafeArea()
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                topScrollAnchor
                thumbnailHeader
                bodyCard
            }
        }
        .coordinateSpace(name: "sharedProjectDetailScroll")
        .scrollIndicators(.hidden)
        .disableTopScrollEdgeEffectIfAvailable()
        .ignoresSafeArea(.container, edges: .top)
        .refreshable {
            await viewModel.load(projectId: summary.project.id, using: appState)
        }
    }

    private var topScrollAnchor: some View {
        Color.clear
            .frame(height: 0)
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: TopSafeAreaScrollOffsetKey.self,
                        value: proxy.frame(in: .named("sharedProjectDetailScroll")).minY
                    )
                }
            )
    }

    // MARK: - Thumbnail Header

    private var thumbnailBackgroundColor: Color {
        if project.iconImage != nil {
            return Color(red: 0.15, green: 0.15, blue: 0.18)
        }
        return MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
    }

    private var thumbnailHeader: some View {
        ZStack(alignment: .bottomLeading) {
            if let iconImage = project.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                let bgColor = MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
                bgColor
                Text(String(project.title.prefix(1)))
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }

            LinearGradient(
                colors: [.clear, Color.black.opacity(0.14), Color.black.opacity(0.52)],
                startPoint: .top,
                endPoint: .bottom
            )

            thumbnailMetadataOverlay
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .contentShape(Rectangle())
        .clipped()
    }

    private var thumbnailMetadataOverlay: some View {
        VStack(alignment: .leading, spacing: 4) {
            Spacer()

            HStack(alignment: .bottom) {
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(viewModel.words.count)")
                        .font(.system(size: 22, weight: .bold))
                        .monospacedDigit()
                    Text("語")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.22), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.16), lineWidth: 1))
            }

            Text(project.title)
                .font(.system(size: 26, weight: .black))
                .foregroundStyle(.white)
                .lineLimit(2)
                .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
    }

    // MARK: - Body Card

    private var bodyCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let errorMessage = viewModel.errorMessage {
                SolidCard {
                    Text(errorMessage)
                        .foregroundStyle(MerkenTheme.warning)
                }
            }

            notionWordListSection
        }
        .padding(20)
        .padding(.bottom, 100)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 24, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 24
            ).fill(MerkenTheme.background)
        )
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 24, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 24
            )
        )
        .padding(.top, -100)
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            if canEdit {
                Button {
                    editorMode = .create
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.system(size: 15, weight: .bold))
                        Text("単語追加")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(MerkenTheme.accentBlue, in: .capsule)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
            MerkenTheme.background
                .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: -4)
        )
    }

    // MARK: - Notion Word List

    private let notionCheckColWidth: CGFloat = 34
    private let notionEnglishColWidth: CGFloat = 220
    private let notionPosColWidth: CGFloat = 36
    private let notionJapaneseColWidth: CGFloat = 180

    private var notionWordListSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 6) {
                Text("単語一覧")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.words.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .monospacedDigit()
            }
            .padding(.bottom, 10)

            if viewModel.loading && viewModel.words.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        ProgressView().progressViewStyle(.circular)
                        Text("読み込み中...")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    .padding(.vertical, 24)
                    Spacer()
                }
            } else if viewModel.words.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "tray")
                            .font(.system(size: 22))
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text("単語がありません")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    .padding(.vertical, 24)
                    Spacer()
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(spacing: 0) {
                        notionColumnHeader

                        let words = viewModel.words
                        ForEach(Array(words.enumerated()), id: \.element.id) { index, word in
                            notionWordRow(word, isLast: index == words.count - 1)
                        }
                    }
                }
            }
        }
    }

    private var notionColumnHeader: some View {
        HStack(spacing: 0) {
            Image(systemName: "square.grid.3x1.below.line.grid.1x2")
                .font(.system(size: 10, weight: .semibold))
                .frame(width: notionCheckColWidth, alignment: .center)

            notionColDivider

            Text("単語")
                .frame(width: notionEnglishColWidth, alignment: .leading)
                .padding(.leading, 10)

            notionColDivider

            Text("品詞")
                .frame(width: notionPosColWidth, alignment: .center)

            notionColDivider

            Text("訳")
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)

            Spacer().frame(width: 16)
        }
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(MerkenTheme.mutedText)
        .padding(.vertical, 6)
        .overlay(Rectangle().fill(MerkenTheme.border).frame(height: 1), alignment: .bottom)
        .overlay(Rectangle().fill(MerkenTheme.border).frame(height: 1), alignment: .top)
    }

    private var notionColDivider: some View {
        Rectangle()
            .fill(MerkenTheme.border)
            .frame(width: 1)
            .padding(.vertical, 4)
    }

    private func notionWordRow(_ word: Word, isLast: Bool) -> some View {
        HStack(spacing: 0) {
            // チェックボックス（表示のみ）
            notionCheckBoxes(for: word.status)
                .frame(width: notionCheckColWidth, alignment: .center)

            notionColDivider

            HStack(spacing: 4) {
                Text(word.english)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if word.isFavorite {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
            .frame(width: notionEnglishColWidth, alignment: .leading)
            .padding(.leading, 10)
            .padding(.vertical, 8)

            notionColDivider

            notionPosBadge(for: word)
                .frame(width: notionPosColWidth, alignment: .center)
                .padding(.vertical, 8)

            notionColDivider

            Text(word.japanese)
                .font(.system(size: 13))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: notionJapaneseColWidth, alignment: .leading)
                .padding(.leading, 10)
                .padding(.vertical, 8)

            Spacer().frame(width: 16)
        }
        .frame(minHeight: 48)
        .contentShape(Rectangle())
        .onTapGesture {
            if canEdit { editorMode = .edit(word: word) }
        }
        .overlay(
            Group {
                if !isLast {
                    Rectangle()
                        .fill(MerkenTheme.borderLight)
                        .frame(height: 1)
                }
            },
            alignment: .bottom
        )
    }

    @ViewBuilder
    private func notionPosBadge(for word: Word) -> some View {
        let tags = word.partOfSpeechTags ?? []
        let label = tags.compactMap { tag -> String? in
            let t = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            switch t {
            case "noun", "名詞":                          return "名"
            case "verb", "動詞":                          return "動"
            case "adjective", "形容詞":                   return "形"
            case "adverb", "副詞":                        return "副"
            case "preposition", "前置詞":                 return "前"
            case "conjunction", "接続詞":                 return "接"
            case "pronoun", "代名詞":                     return "代"
            case "idiom", "熟語", "phrase",
                 "フレーズ", "idiomatic_expression":      return "熟"
            case "phrasal_verb", "句動詞":                return "句"
            default:                                      return nil
            }
        }.prefix(2).joined(separator: "・")

        if label.isEmpty {
            Text("—")
                .font(.system(size: 15))
                .foregroundStyle(MerkenTheme.mutedText)
        } else {
            Text(label)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
        }
    }

    private func notionCheckBoxes(for status: WordStatus) -> some View {
        let filledCount: Int = {
            switch status {
            case .new:      return 0
            case .review:   return 1
            case .mastered: return 3
            }
        }()
        let boxSize: CGFloat = 13

        return VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { i in
                Rectangle()
                    .fill(i < filledCount ? Color.primary : Color.clear)
                    .frame(width: boxSize, height: boxSize)
                    .overlay(
                        Group {
                            if i < 2 {
                                Rectangle()
                                    .fill(MerkenTheme.border)
                                    .frame(height: 1)
                            }
                        },
                        alignment: .bottom
                    )
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 3).stroke(MerkenTheme.border, lineWidth: 1))
        .clipShape(.rect(cornerRadius: 3))
    }

    // MARK: - Editor Sheet

    @ViewBuilder
    private func sharedWordEditorSheet(_ mode: SharedWordEditorMode) -> some View {
        SharedWordEditorSheet(mode: mode) { english, japanese in
            switch mode {
            case .create:
                Task {
                    await viewModel.addWord(
                        english: english, japanese: japanese,
                        projectId: project.id, using: appState
                    )
                }
            case .edit(let word):
                Task {
                    await viewModel.updateWord(
                        wordId: word.id, english: english, japanese: japanese,
                        projectId: project.id, using: appState
                    )
                }
            }
        }
    }
}

// MARK: - Editor Mode

private enum SharedWordEditorMode: Identifiable {
    case create
    case edit(word: Word)

    var id: String {
        switch self {
        case .create:           return "create"
        case .edit(let word):   return word.id
        }
    }

    var title: String {
        switch self {
        case .create: return "単語を追加"
        case .edit:   return "単語を編集"
        }
    }
}

// MARK: - Compact Editor Sheet

private struct SharedWordEditorSheet: View {
    let mode: SharedWordEditorMode
    let onSubmit: (_ english: String, _ japanese: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?
    @State private var english = ""
    @State private var japanese = ""

    private enum Field { case english, japanese }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(MerkenTheme.border)
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .padding(.bottom, 16)

            Text(mode.title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .padding(.horizontal, 20)
                .padding(.bottom, 16)

            VStack(spacing: 10) {
                compactField(label: "英単語", text: $english, field: .english)
                compactField(label: "日本語訳", text: $japanese, field: .japanese)
            }
            .padding(.horizontal, 20)

            Button {
                onSubmit(
                    english.trimmingCharacters(in: .whitespacesAndNewlines),
                    japanese.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                dismiss()
            } label: {
                Text("保存")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(canSubmit ? MerkenTheme.accentBlue : MerkenTheme.border, in: Capsule())
            }
            .disabled(!canSubmit)
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 8)
        }
        .background(MerkenTheme.background)
        .presentationDetents([.height(260)])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(20)
        .onAppear {
            if case .edit(let word) = mode {
                english  = word.english
                japanese = word.japanese
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                focusedField = .english
            }
        }
    }

    private var canSubmit: Bool {
        !english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func compactField(label: String, text: Binding<String>, field: Field) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .frame(width: 72, alignment: .leading)
            TextField(label, text: text)
                .font(.system(size: 15))
                .foregroundStyle(MerkenTheme.primaryText)
                .focused($focusedField, equals: field)
                .submitLabel(field == .english ? .next : .done)
                .onSubmit {
                    if field == .english { focusedField = .japanese }
                    else { focusedField = nil }
                }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(focusedField == field ? MerkenTheme.accentBlue : MerkenTheme.border, lineWidth: 1.5)
        )
    }
}
