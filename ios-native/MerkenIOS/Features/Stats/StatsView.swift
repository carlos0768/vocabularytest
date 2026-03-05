import SwiftUI
import Charts

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
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Spacer().frame(height: 4)

                        Text("統計")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)

                        // MARK: - Mastery Chart (40% of screen)
                        masteryChart

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

    // MARK: - Mastery Chart

    private var masteryChart: some View {
        let data = viewModel.masteryHistory
        let maxVal = max(data.map(\.total).max() ?? 1, 1)

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("暗記した単語数の推移")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Text("過去14日間")
                    .font(.system(size: 12))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            if data.isEmpty {
                RoundedRectangle(cornerRadius: 12)
                    .fill(MerkenTheme.surfaceAlt)
                    .frame(height: 200)
                    .overlay(
                        Text("データなし")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                    )
            } else {
                Chart {
                    // Total words line (behind mastered)
                    ForEach(data) { point in
                        LineMark(
                            x: .value("日付", point.date, unit: .day),
                            y: .value("合計", point.total),
                            series: .value("series", "total")
                        )
                        .foregroundStyle(MerkenTheme.accentBlue.opacity(0.4))
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                        .interpolationMethod(.monotone)
                    }

                    // Mastered area fill
                    ForEach(data) { point in
                        AreaMark(
                            x: .value("日付", point.date, unit: .day),
                            yStart: .value("yStart", 0),
                            yEnd: .value("習得", point.mastered)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [MerkenTheme.success.opacity(0.3), MerkenTheme.success.opacity(0.05)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .interpolationMethod(.monotone)
                    }

                    // Mastered line
                    ForEach(data) { point in
                        LineMark(
                            x: .value("日付", point.date, unit: .day),
                            y: .value("習得", point.mastered),
                            series: .value("series", "mastered")
                        )
                        .foregroundStyle(MerkenTheme.success)
                        .lineStyle(StrokeStyle(lineWidth: 2.5))
                        .interpolationMethod(.monotone)
                    }
                }
                .chartYScale(domain: 0...maxVal)
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: 3)) { value in
                        AxisValueLabel(format: .dateTime.month(.defaultDigits).day())
                            .font(.system(size: 9))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                            .foregroundStyle(MerkenTheme.border.opacity(0.5))
                        AxisValueLabel()
                            .font(.system(size: 10))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
                .frame(height: UIScreen.main.bounds.height * 0.32)

                // Legend
                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(MerkenTheme.success)
                            .frame(width: 8, height: 8)
                        Text("習得済み")
                            .font(.system(size: 11))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                    HStack(spacing: 4) {
                        Circle()
                            .fill(MerkenTheme.accentBlue.opacity(0.4))
                            .frame(width: 8, height: 8)
                        Text("総単語数")
                            .font(.system(size: 11))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
            }
        }
        .padding(16)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(MerkenTheme.border, lineWidth: 1.5)
        )
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
