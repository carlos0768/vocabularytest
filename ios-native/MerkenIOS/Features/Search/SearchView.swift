import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = SearchViewModel()

    var body: some View {
        ZStack {
            AppBackground()

            if viewModel.loading && viewModel.results.isEmpty && !viewModel.hasSearched {
                ProgressView()
                    .tint(MerkenTheme.accentBlue)
            } else if !viewModel.hasSearched {
                placeholder
            } else if viewModel.results.isEmpty {
                noResults
            } else {
                resultList
            }
        }
        .navigationTitle("検索")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $viewModel.searchText, prompt: "英語・日本語で検索...")
        .onChange(of: viewModel.searchText) {
            viewModel.search()
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var placeholder: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.accentBlue)
                .frame(width: 80, height: 80)
                .background(MerkenTheme.accentBlueLight, in: .circle)
            VStack(spacing: 6) {
                Text("意味や単語を入力すると")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                Text("関連する英単語を見つけます")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            Text("例:「子犬」→ puppy, dog, pet...")
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
            LazyVStack(spacing: 8) {
                ForEach(viewModel.results) { word in
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
