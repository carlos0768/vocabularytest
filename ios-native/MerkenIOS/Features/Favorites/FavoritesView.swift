import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = FavoritesViewModel()

    var body: some View {
        Group {
            if viewModel.loading && viewModel.favoriteWords.isEmpty {
                ProgressView()
                    .tint(MerkenTheme.accentBlue)
            } else if viewModel.filteredWords.isEmpty {
                emptyState
            } else {
                ZStack {
                    AppBackground()
                    VStack(alignment: .leading, spacing: 12) {
                        SolidPageHeader(
                            kicker: "BOOKMARKS",
                            title: "苦手単語",
                            subtitle: "復習したい単語を一覧で確認します。"
                        )
                        .padding(.horizontal, 16)
                        .padding(.top, 8)

                        sortBar
                        wordList
                    }
                }
            }
        }
        .navigationTitle("苦手単語")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $viewModel.searchText, prompt: "単語を検索")
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var sortBar: some View {
        HStack(spacing: 8) {
            ForEach(FavoritesViewModel.SortMode.allCases, id: \.self) { mode in
                SolidChip(
                    title: mode.rawValue,
                    systemImage: mode == .alphabetical ? "textformat.abc" : "line.3.horizontal.decrease",
                    isSelected: viewModel.sortMode == mode
                ) {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        viewModel.sortMode = mode
                    }
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var emptyState: some View {
        ZStack {
            AppBackground()
            VStack(alignment: .leading, spacing: 20) {
                SolidPageHeader(
                    kicker: "BOOKMARKS",
                    title: "苦手単語",
                    subtitle: "復習したい単語を一覧で確認します。"
                )

                SolidEmptyState(
                    icon: "bookmark.slash",
                    title: viewModel.searchText.isEmpty ? "苦手単語がありません" : "該当する単語がありません",
                    message: viewModel.searchText.isEmpty
                        ? "単語帳の中でブックマークして苦手単語に追加できます。"
                        : "検索条件を変えてもう一度試してください。"
                )
            }
            .padding(16)
        }
    }

    private var wordList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(viewModel.filteredWords) { word in
                    SolidPane {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(word.english)
                                    .font(.headline)
                                    .foregroundStyle(MerkenTheme.primaryText)
                                Text(word.japanese)
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                            Spacer()
                            statusBadge(word.status)
                            Button {
                                Task {
                                    await viewModel.toggleFavorite(word: word, using: appState)
                                }
                            } label: {
                                Image(systemName: "bookmark.fill")
                                    .foregroundStyle(MerkenTheme.accentGreen)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await viewModel.load(using: appState)
        }
    }

    private func statusBadge(_ status: WordStatus) -> some View {
        Text(status.rawValue)
            .font(.caption2.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(statusColor(status)))
    }

    private func statusColor(_ status: WordStatus) -> Color {
        switch status {
        case .new: return MerkenTheme.warning
        case .review: return MerkenTheme.accentBlue
        case .mastered: return MerkenTheme.success
        }
    }
}
