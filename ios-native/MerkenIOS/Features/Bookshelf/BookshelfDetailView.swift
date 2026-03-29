import SwiftUI

private enum SharedWordEditorMode: Identifiable {
    case create
    case edit(word: Word)

    var id: String {
        switch self {
        case .create:
            return "create"
        case .edit(let word):
            return word.id
        }
    }

    var title: String {
        switch self {
        case .create:
            return "単語を追加"
        case .edit:
            return "単語を編集"
        }
    }
}

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

    private var collaboratorCount: Int {
        viewModel.project == nil ? summary.collaboratorCount : viewModel.collaboratorCount
    }

    private var wordCount: Int {
        viewModel.project == nil && viewModel.words.isEmpty ? summary.wordCount : viewModel.words.count
    }

    private var canEdit: Bool {
        accessRole != .viewer
    }

    private var roleLabel: String {
        switch accessRole {
        case .owner:
            return "共有元"
        case .editor:
            return "参加中"
        case .viewer:
            return "閲覧専用"
        }
    }

    private var roleTint: Color {
        switch accessRole {
        case .owner:
            return MerkenTheme.accentBlue
        case .editor:
            return MerkenTheme.primaryText
        case .viewer:
            return MerkenTheme.success
        }
    }

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
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

                    headerSection
                    noticeSection
                    searchSection
                    wordsSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            }
            .coordinateSpace(name: "sharedProjectDetailScroll")
            .scrollIndicators(.hidden)
            .disableTopScrollEdgeEffectIfAvailable()
            .refreshable {
                await viewModel.load(projectId: summary.project.id, using: appState)
            }
        }
        .navigationTitle("共有単語帳")
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
                    await viewModel.deleteWord(
                        wordId: word.id,
                        projectId: project.id,
                        using: appState
                    )
                }
                wordToDelete = nil
            }
            Button("キャンセル", role: .cancel) {
                wordToDelete = nil
            }
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

    private var headerSection: some View {
        SolidCard(padding: 0) {
            HStack(spacing: 14) {
                thumbnail
                    .frame(width: 82, height: 82)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                VStack(alignment: .leading, spacing: 8) {
                    Text(project.title)
                        .font(.system(size: 22, weight: .black))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        badge(text: roleLabel, tint: roleTint)
                        if project.shareScope == .publicListed {
                            badge(text: "公開", tint: MerkenTheme.success)
                        }
                        badge(text: "\(wordCount)語", tint: MerkenTheme.secondaryText)
                        badge(text: "\(collaboratorCount)人", tint: MerkenTheme.secondaryText)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(16)
        }
    }

    private var noticeSection: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(canEdit ? "共同編集モード" : "公開単語帳")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(noticeText)
                    .font(.system(size: 13))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var searchSection: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.mutedText)
                TextField("単語を検索...", text: $viewModel.searchText)
                    .textFieldStyle(.plain)
                if !viewModel.searchText.isEmpty {
                    Button {
                        viewModel.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
            }
            .solidTextField()

            if canEdit {
                Button {
                    editorMode = .create
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(MerkenTheme.accentBlue, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var wordsSection: some View {
        if let errorMessage = viewModel.errorMessage, !errorMessage.isEmpty {
            SolidCard {
                Text(errorMessage)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.warning)
            }
        }

        if viewModel.loading && viewModel.words.isEmpty {
            SolidCard {
                HStack(spacing: 10) {
                    ProgressView()
                        .progressViewStyle(.circular)
                    Text("単語を読み込み中...")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        } else if viewModel.filteredWords.isEmpty {
            SolidCard {
                Text(viewModel.words.isEmpty ? "まだ単語がありません。" : "検索条件に一致する単語がありません。")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        } else {
            VStack(spacing: 10) {
                ForEach(viewModel.filteredWords) { word in
                    wordCard(word)
                }
            }
        }
    }

    private func wordCard(_ word: Word) -> some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(word.english)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text(word.japanese)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Spacer(minLength: 0)

                    if canEdit {
                        HStack(spacing: 8) {
                            smallActionButton(icon: "pencil") {
                                editorMode = .edit(word: word)
                            }
                            smallActionButton(icon: "trash") {
                                wordToDelete = word
                            }
                        }
                    }
                }

                if let exampleSentence = word.exampleSentence, !exampleSentence.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(exampleSentence)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.primaryText)
                        if let exampleSentenceJa = word.exampleSentenceJa, !exampleSentenceJa.isEmpty {
                            Text(exampleSentenceJa)
                                .font(.system(size: 12))
                                .foregroundStyle(MerkenTheme.mutedText)
                        }
                    }
                }
            }
            .padding(14)
        }
    }

    private func smallActionButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.primaryText)
                .frame(width: 34, height: 34)
                .background(MerkenTheme.surfaceAlt, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let iconImage = project.iconImage,
           let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else {
            ZStack {
                MerkenTheme.placeholderColor(for: project.id, isDark: colorScheme == .dark)
                Text(String(project.title.prefix(1)))
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(.white.opacity(0.92))
            }
        }
    }

    private func badge(text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(MerkenTheme.surfaceAlt, in: Capsule())
    }

    private var noticeText: String {
        if canEdit {
            if project.shareScope == .publicListed {
                return "この単語帳は公開一覧にも表示されます。ここでは単語内容だけを共同編集でき、復習進捗やお気に入りは各自で管理されます。"
            }
            return "ここでは単語内容だけを共有編集します。復習進捗やお気に入りは個人管理に切り分けるまで shared では扱いません。"
        }

        return "公開中の単語帳なので、共有ページからそのまま閲覧できます。この画面では単語の追加・編集・削除はできません。"
    }

    @ViewBuilder
    private func sharedWordEditorSheet(_ mode: SharedWordEditorMode) -> some View {
        SharedWordEditorSheet(mode: mode) { english, japanese in
            switch mode {
            case .create:
                Task {
                    await viewModel.addWord(
                        english: english,
                        japanese: japanese,
                        projectId: project.id,
                        using: appState
                    )
                }
            case .edit(let word):
                Task {
                    await viewModel.updateWord(
                        wordId: word.id,
                        english: english,
                        japanese: japanese,
                        projectId: project.id,
                        using: appState
                    )
                }
            }
        }
    }
}

private struct SharedWordEditorSheet: View {
    let mode: SharedWordEditorMode
    let onSubmit: (_ english: String, _ japanese: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var english = ""
    @State private var japanese = ""

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        field(label: "英単語", text: $english)
                        field(label: "日本語", text: $japanese)

                        Button("保存") {
                            onSubmit(
                                english.trimmingCharacters(in: .whitespacesAndNewlines),
                                japanese.trimmingCharacters(in: .whitespacesAndNewlines)
                            )
                            dismiss()
                        }
                        .buttonStyle(PrimaryGlassButton())
                        .disabled(!canSubmit)
                        .opacity(canSubmit ? 1 : 0.55)
                    }
                    .padding(16)
                }
            }
            .navigationTitle(mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if case .edit(let word) = mode {
                    english = word.english
                    japanese = word.japanese
                }
            }
        }
    }

    private var canSubmit: Bool {
        !english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func field(label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(MerkenTheme.secondaryText)
            TextField(label, text: text)
                .textFieldStyle(.plain)
                .solidTextField()
        }
    }
}
