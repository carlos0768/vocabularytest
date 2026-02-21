import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = FavoritesViewModel()

    var body: some View {
        ZStack {
            AppBackground()

            if viewModel.loading && viewModel.favoriteWords.isEmpty {
                ProgressView()
                    .tint(.white)
            } else if viewModel.filteredWords.isEmpty {
                emptyState
            } else {
                wordList
            }
        }
        .navigationTitle("お気に入り")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $viewModel.searchText, prompt: "単語を検索")
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "heart.slash")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.mutedText)
            Text(viewModel.searchText.isEmpty
                 ? "お気に入りの単語がありません"
                 : "該当する単語がありません")
                .font(.headline)
                .foregroundStyle(MerkenTheme.secondaryText)
            if viewModel.searchText.isEmpty {
                Text("単語帳の中でハートをタップしてお気に入りに追加できます。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
    }

    private var wordList: some View {
        ScrollView {
            GlassEffectContainer(spacing: 6) {
            LazyVStack(spacing: 8) {
                ForEach(viewModel.filteredWords) { word in
                    GlassPane {
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
                                Image(systemName: "heart.fill")
                                    .foregroundStyle(MerkenTheme.danger)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            } // GlassEffectContainer
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
