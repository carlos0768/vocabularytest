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
                VStack(spacing: 0) {
                    sortBar
                    wordList
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
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        viewModel.sortMode = mode
                    }
                } label: {
                    HStack(spacing: 4) {
                        if mode == .alphabetical {
                            Image(systemName: "textformat.abc")
                                .font(.system(size: 11))
                        } else if mode == .status {
                            Image(systemName: "line.3.horizontal.decrease")
                                .font(.system(size: 11))
                        }
                        Text(mode.rawValue)
                            .font(.system(size: 13, weight: .medium))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .foregroundStyle(viewModel.sortMode == mode ? .white : MerkenTheme.secondaryText)
                    .background(
                        viewModel.sortMode == mode ? MerkenTheme.accentBlue : MerkenTheme.surface,
                        in: .capsule
                    )
                    .overlay(
                        Capsule().stroke(
                            viewModel.sortMode == mode ? Color.clear : MerkenTheme.borderLight,
                            lineWidth: 1
                        )
                    )
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bookmark.slash")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.mutedText)
            Text(viewModel.searchText.isEmpty
                 ? "苦手単語がありません"
                 : "該当する単語がありません")
                .font(.headline)
                .foregroundStyle(MerkenTheme.secondaryText)
            if viewModel.searchText.isEmpty {
                Text("単語帳の中でハートをタップして苦手単語に追加できます。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
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
                                    .foregroundStyle(MerkenTheme.danger)
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
