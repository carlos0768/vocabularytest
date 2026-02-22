import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = SearchViewModel()
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        Text("検索")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Spacer()
                    }

                    // Search bar
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(MerkenTheme.mutedText)
                        TextField("英語・日本語で検索...", text: $viewModel.searchText)
                            .textFieldStyle(.plain)
                            .focused($isSearchFocused)
                        if !viewModel.searchText.isEmpty {
                            Button {
                                viewModel.searchText = ""
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
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                // Content
                if viewModel.loading && viewModel.results.isEmpty && !viewModel.hasSearched {
                    Spacer()
                    ProgressView()
                        .tint(MerkenTheme.accentBlue)
                    Spacer()
                } else if !viewModel.hasSearched {
                    Spacer()
                    placeholder
                    Spacer()
                } else if viewModel.loading {
                    Spacer()
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(MerkenTheme.accentBlue)
                        Text("検索中...")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    Spacer()
                } else if let error = viewModel.errorMessage {
                    Spacer()
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.danger)
                    Spacer()
                } else if viewModel.results.isEmpty {
                    Spacer()
                    noResults
                    Spacer()
                } else {
                    resultList
                }
            }
        }
        .onTapGesture {
            isSearchFocused = false
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: viewModel.searchText) {
            viewModel.search(using: appState)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    // MARK: - Placeholder

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

    // MARK: - No Results

    private var noResults: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(MerkenTheme.mutedText)
            Text("「\(viewModel.searchText)」に関連する単語が見つかりません")
                .font(.headline)
                .foregroundStyle(MerkenTheme.secondaryText)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Result List

    private var resultList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                Text("\(viewModel.results.count)件の関連単語")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
                    .padding(.bottom, 4)

                ForEach(viewModel.results) { result in
                    SolidCard {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.english)
                                    .font(.headline)
                                    .foregroundStyle(MerkenTheme.primaryText)
                                Text(result.japanese)
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 6) {
                                Text("\(result.similarity)%")
                                    .font(.caption.bold())
                                    .foregroundStyle(MerkenTheme.accentBlue)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(
                                        Capsule().fill(MerkenTheme.accentBlue.opacity(0.1))
                                    )
                                if !result.projectTitle.isEmpty {
                                    Text(result.projectTitle)
                                        .font(.caption2)
                                        .foregroundStyle(MerkenTheme.mutedText)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 3)
                                        .background(
                                            Capsule().fill(MerkenTheme.surfaceAlt)
                                        )
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollIndicators(.hidden)
    }
}
