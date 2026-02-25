import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = SearchViewModel()
    @FocusState private var isSearchFocused: Bool

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
                // Fixed header
                HStack(alignment: .top) {
                    Text("検索")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                // Search bar (matching Web: clean border, blue on focus)
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(isSearchFocused ? MerkenTheme.accentBlue : MerkenTheme.mutedText)
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
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(MerkenTheme.surface, in: .rect(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            isSearchFocused ? MerkenTheme.accentBlue : MerkenTheme.border,
                            lineWidth: isSearchFocused ? 2 : 1.5
                        )
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
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    // MARK: - Empty State (richer placeholder matching Web)

    private var emptyState: some View {
        VStack(spacing: 24) {
            // Main placeholder
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

            // Search tips section
            VStack(alignment: .leading, spacing: 12) {
                Text("検索のヒント")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.horizontal, 4)

                searchTipRow(
                    icon: "character.book.closed",
                    iconColor: MerkenTheme.accentBlue,
                    title: "日本語で意味を検索",
                    example: "「走る」「食べ物」「嬉しい」"
                )

                searchTipRow(
                    icon: "textformat.abc",
                    iconColor: MerkenTheme.success,
                    title: "英単語を直接検索",
                    example: "\"happy\" \"run\" \"beautiful\""
                )

                searchTipRow(
                    icon: "text.magnifyingglass",
                    iconColor: MerkenTheme.warning,
                    title: "フレーズ・概念で検索",
                    example: "「天気に関する表現」「感情」"
                )

                if appState.isPro {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.accentBlue)
                        Text("Pro: AI意味検索でより関連性の高い結果を表示")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 4)
                }
            }
            .padding(16)
            .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1)
            )
            .padding(.horizontal, 16)
        }
    }

    private func searchTipRow(icon: String, iconColor: Color, title: String, example: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(iconColor)
                .frame(width: 36, height: 36)
                .background(iconColor.opacity(0.1), in: .rect(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(example)
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
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
