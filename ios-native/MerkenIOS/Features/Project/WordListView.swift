import SwiftUI

struct WordListView: View {
    let project: Project

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = WordListViewModel()

    @State private var editorMode: WordEditorSheet.Mode?
    @State private var searchText = ""

    @State private var selectedStatus: WordStatus?

    private var filteredWords: [Word] {
        viewModel.words.filter { word in
            // Status filter
            if let status = selectedStatus, word.status != status {
                return false
            }
            // Search filter
            if !searchText.isEmpty {
                return word.english.localizedCaseInsensitiveContains(searchText)
                    || word.japanese.localizedCaseInsensitiveContains(searchText)
            }
            return true
        }
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 10)
                    .stickyHeaderStyle()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        // Search
                        searchBar

                        // Status filter chips
                        statusChips

                        // Words
                        if filteredWords.isEmpty {
                            SolidCard {
                                Text(searchText.isEmpty
                                     ? "単語がありません。追加して学習を開始してください。"
                                     : "「\(searchText)」に一致する単語がありません。")
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }

                        ForEach(filteredWords) { word in
                            wordRow(word)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .refreshable {
                    await viewModel.load(projectId: project.id, using: appState)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .sheet(item: $editorMode, content: editorSheet)
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(projectId: project.id, using: appState)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("単語一覧")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("\(viewModel.words.count)語")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            Spacer()
            Button {
                editorMode = .create
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.subheadline.bold())
                    Text("追加")
                        .font(.subheadline.bold())
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(MerkenTheme.accentBlue, in: .capsule)
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(MerkenTheme.mutedText)
            TextField("単語を検索...", text: $searchText)
                .textFieldStyle(.plain)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
        )
    }

    // MARK: - Status Filter Chips

    private var statusChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                statusChip(label: "すべて", status: nil)
                statusChip(label: "新規", status: .new)
                statusChip(label: "復習", status: .review)
                statusChip(label: "習得", status: .mastered)
            }
        }
    }

    private func statusChip(label: String, status: WordStatus?) -> some View {
        let isActive = selectedStatus == status
        let count: Int = {
            if let s = status {
                return viewModel.words.filter { $0.status == s }.count
            }
            return viewModel.words.count
        }()

        return Button {
            selectedStatus = status
        } label: {
            HStack(spacing: 3) {
                Text(label)
                    .font(.caption)
                    .lineLimit(1)
                Text("\(count)")
                    .font(.caption2.bold())
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundStyle(isActive ? .white : MerkenTheme.secondaryText)
            .background(
                isActive ? MerkenTheme.accentBlue : MerkenTheme.surface,
                in: .capsule
            )
            .overlay(
                Capsule().stroke(
                    isActive ? Color.clear : MerkenTheme.borderLight,
                    lineWidth: 1
                )
            )
        }
    }

    // MARK: - Word Row

    private func wordRow(_ word: Word) -> some View {
        SolidPane {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(word.english)
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                        // Status badge
                        Text(word.status.rawValue)
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(statusColor(word.status), in: .capsule)
                    }
                    Text(word.japanese)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                Spacer()
                HStack(spacing: 14) {
                    Button {
                        Task {
                            await viewModel.toggleFavorite(word: word, projectId: project.id, using: appState)
                        }
                    } label: {
                        Image(systemName: word.isFavorite ? "flag.fill" : "flag")
                            .foregroundStyle(word.isFavorite ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
                    }

                    Button {
                        editorMode = .edit(existing: word)
                    } label: {
                        Image(systemName: "pencil")
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Button {
                        Task {
                            await viewModel.deleteWord(wordId: word.id, projectId: project.id, using: appState)
                        }
                    } label: {
                        Image(systemName: "trash")
                            .foregroundStyle(MerkenTheme.danger)
                    }
                }
            }
        }
    }

    private func statusColor(_ status: WordStatus) -> Color {
        switch status {
        case .new: return MerkenTheme.warning
        case .review: return MerkenTheme.accentBlue
        case .mastered: return MerkenTheme.success
        }
    }

    // MARK: - Editor Sheet

    @ViewBuilder
    private func editorSheet(mode: WordEditorSheet.Mode) -> some View {
        WordEditorSheet(mode: mode) { input in
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
