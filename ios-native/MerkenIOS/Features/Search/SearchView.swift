import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = SearchViewModel()

    var body: some View {
        ZStack {
            AppBackground()

            if viewModel.loading && viewModel.results.isEmpty && !viewModel.hasSearched {
                ProgressView()
                    .tint(.white)
            } else if !viewModel.hasSearched {
                placeholder
            } else if viewModel.results.isEmpty {
                noResults
            } else {
                resultList
            }
        }
        .navigationTitle("検索")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $viewModel.searchText, prompt: "英語・日本語で検索")
        .onChange(of: viewModel.searchText) {
            viewModel.search()
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var placeholder: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.mutedText)
            Text("単語を検索してください")
                .font(.headline)
                .foregroundStyle(MerkenTheme.secondaryText)
            Text("英語・日本語どちらでも検索できます。")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.mutedText)
        }
    }

    private var noResults: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.mutedText)
            Text("該当する単語がありません")
                .font(.headline)
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }

    private var resultList: some View {
        ScrollView {
            GlassEffectContainer(spacing: 6) {
            LazyVStack(spacing: 8) {
                ForEach(viewModel.results) { word in
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
                            if word.isFavorite {
                                Image(systemName: "heart.fill")
                                    .foregroundStyle(MerkenTheme.danger)
                                    .font(.caption)
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
