import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = SearchViewModel()
    @FocusState private var isSearchFocused: Bool
    private var loadToken: String {
        "\(appState.repositoryMode)-\(appState.activeUserId)-\(appState.dataVersion)"
    }

    var body: some View {
        Group {
            if !appState.isLoggedIn {
                LoginGateView(
                    icon: "magnifyingglass",
                    title: "単語を検索しよう",
                    message: "ログインすると、保存した単語を意味や英語で横断検索できます。"
                ) {
                    appState.selectedTab = 4
                }
            } else {
                searchContent
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var searchContent: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                SolidPageHeader(
                    kicker: "SEARCH",
                    title: "検索",
                    subtitle: "保存した単語を英語・日本語で横断検索します。"
                )
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                // Search bar (matching Web: clean border, blue on focus)
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(isSearchFocused ? MerkenTheme.accentGreen : MerkenTheme.mutedText)
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
                .solidTextField(cornerRadius: 16)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(isSearchFocused ? MerkenTheme.accentGreen : Color.clear, lineWidth: 2)
                )
                .animation(.easeInOut(duration: 0.15), value: isSearchFocused)
                .padding(.horizontal, 16)
                .padding(.top, 4)

                // Content
                if viewModel.loading {
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
                } else if viewModel.hasSearched && viewModel.results.isEmpty {
                    Spacer()
                    noResults
                    Spacer()
                } else if !viewModel.results.isEmpty {
                    resultList
                } else {
                    // Empty state / placeholder
                    ScrollView {
                        emptyState
                            .padding(.top, 40)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
        .onTapGesture {
            isSearchFocused = false
        }
        .onChange(of: viewModel.searchText) {
            viewModel.search(using: appState)
        }
        .task(id: loadToken) {
            await viewModel.load(using: appState, token: loadToken)
        }
    }

    // MARK: - Empty State (richer placeholder matching Web)

    private var emptyState: some View {
        SolidEmptyState(
            icon: "sparkles",
            title: "関連する英単語を見つけます",
            message: "例:「子犬」から puppy, dog, pet などを検索できます。"
        )
        .padding(.horizontal, 16)
    }

    // MARK: - No Results

    private var noResults: some View {
        SolidEmptyState(
            icon: "doc.text.magnifyingglass",
            title: "見つかりません",
            message: "「\(viewModel.searchText)」に関連する単語が見つかりません。"
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Result List

    private var resultList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                SolidSectionTitle("関連単語", count: viewModel.results.count)
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
