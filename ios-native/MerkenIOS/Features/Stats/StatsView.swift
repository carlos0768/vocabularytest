import SwiftUI

struct StatsView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = StatsViewModel()

    var body: some View {
        Group {
            if !appState.isLoggedIn {
                LoginGateView(
                    icon: "chart.bar.fill",
                    title: "学習の記録を確認しよう",
                    message: "ログインすると、クイズの正答率や単語の習得状況を確認できます。"
                ) {
                    appState.selectedTab = 4
                }
            } else {
                statsContent
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var statsContent: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Fixed header
                HStack(alignment: .top) {
                    Text("統計")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
                .stickyHeaderStyle()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // MARK: - 今日の学習
                        sectionHeader(icon: "calendar", title: "今日の学習")

                        HStack(spacing: 12) {
                            statCard(
                                icon: "questionmark.square.fill",
                                iconColor: MerkenTheme.accentBlue,
                                value: "\(viewModel.todayAnswered)",
                                label: "クイズ回答数"
                            )
                            statCard(
                                icon: "checkmark.circle.fill",
                                iconColor: MerkenTheme.success,
                                value: viewModel.todayAnswered > 0
                                    ? "\(Int(viewModel.todayAccuracy * 100))%"
                                    : "-",
                                label: "正答率",
                                valueColor: MerkenTheme.success
                            )
                        }

                        // MARK: - 単語統計
                        sectionHeader(icon: "text.book.closed.fill", title: "単語統計")

                        // Unified word stats card
                        SolidCard(padding: 0) {
                            VStack(alignment: .leading, spacing: 0) {
                                // Progress header + bar
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Text("習得の進捗")
                                            .font(.headline)
                                            .foregroundStyle(MerkenTheme.primaryText)
                                        Spacer()
                                        Text(viewModel.totalWords > 0
                                             ? "\(Int(viewModel.masterRate * 100))% 習得"
                                             : "0% 習得")
                                            .font(.subheadline.bold())
                                            .foregroundStyle(MerkenTheme.success)
                                    }

                                    // Progress bar
                                    GeometryReader { geo in
                                        let total = max(CGFloat(viewModel.totalWords), 1)
                                        let masteredW = geo.size.width * CGFloat(viewModel.masteredWords) / total
                                        let reviewW = geo.size.width * CGFloat(viewModel.reviewWords) / total

                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 6)
                                                .fill(MerkenTheme.surfaceAlt)
                                            HStack(spacing: 0) {
                                                Rectangle()
                                                    .fill(MerkenTheme.success)
                                                    .frame(width: max(masteredW, 0))
                                                Rectangle()
                                                    .fill(MerkenTheme.accentBlue)
                                                    .frame(width: max(reviewW, 0))
                                            }
                                            .clipShape(.rect(cornerRadius: 6))
                                        }
                                    }
                                    .frame(height: 12)
                                }
                                .padding(16)

                                Divider().overlay(MerkenTheme.border.opacity(0.3))

                                // Stats rows
                                wordStatRow(
                                    icon: "checkmark.circle",
                                    iconColor: MerkenTheme.success,
                                    label: "習得済み",
                                    value: "\(viewModel.masteredWords)"
                                )
                                Divider().overlay(MerkenTheme.border.opacity(0.3))
                                wordStatRow(
                                    icon: "arrow.triangle.2.circlepath",
                                    iconColor: MerkenTheme.accentBlue,
                                    label: "復習中",
                                    value: "\(viewModel.reviewWords)"
                                )
                                Divider().overlay(MerkenTheme.border.opacity(0.3))
                                wordStatRow(
                                    icon: "clock",
                                    iconColor: MerkenTheme.mutedText,
                                    label: "未学習",
                                    value: "\(viewModel.newWords)"
                                )
                                Divider().overlay(MerkenTheme.border.opacity(0.3))
                                wordStatRow(
                                    icon: "exclamationmark.circle",
                                    iconColor: MerkenTheme.danger,
                                    label: "間違えた単語",
                                    value: "\(viewModel.wrongAnswersCount)"
                                )
                            }
                        }

                        // MARK: - 概要
                        sectionHeader(icon: "chart.bar.fill", title: "概要")

                        SolidCard(padding: 0) {
                            VStack(spacing: 0) {
                                overviewRow(label: "単語帳数", value: "\(viewModel.totalProjects)")
                                Divider().overlay(MerkenTheme.border.opacity(0.3))
                                overviewRow(label: "総単語数", value: "\(viewModel.totalWords)")
                                Divider().overlay(MerkenTheme.border.opacity(0.3))
                                overviewRow(label: "お気に入り単語", value: "\(viewModel.favoriteWords)")
                                Divider().overlay(MerkenTheme.border.opacity(0.3))
                                overviewRow(label: "連続学習日数", value: "\(viewModel.streakDays)日")
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 18)
                }
                .scrollIndicators(.hidden)
                .refreshable {
                    await viewModel.load(using: appState)
                }
            }
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    // MARK: - Components

    private func sectionHeader(icon: String, title: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(MerkenTheme.accentBlue)
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }

    private func statCard(icon: String, iconColor: Color, value: String, label: String, valueColor: Color = MerkenTheme.primaryText) -> some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 12) {
                IconBadge(systemName: icon, color: iconColor, size: 48)
                Text(value)
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(valueColor)
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    private func wordStatRow(icon: String, iconColor: Color, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(iconColor)
                .frame(width: 24)
            Text(label)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
            Spacer()
            Text(value)
                .font(.subheadline.bold())
                .foregroundStyle(MerkenTheme.primaryText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func overviewRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.mutedText)
            Spacer()
            Text(value)
                .font(.subheadline.bold())
                .foregroundStyle(MerkenTheme.primaryText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

}
