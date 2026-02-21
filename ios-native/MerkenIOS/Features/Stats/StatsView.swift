import SwiftUI

struct StatsView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = StatsViewModel()

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Today's Learning
                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("今日の学習", systemImage: "calendar")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.secondaryText)

                            HStack(spacing: 0) {
                                statBox(title: "回答数", value: "\(viewModel.todayAnswered)")
                                Spacer()
                                statBox(title: "正答率", value: viewModel.todayAnswered > 0
                                    ? "\(Int(viewModel.todayAccuracy * 100))%"
                                    : "-")
                                Spacer()
                                statBox(title: "セッション", value: "\(viewModel.todaySessions)")
                            }
                        }
                    }

                    // Streak
                    GlassCard {
                        HStack(spacing: 12) {
                            Image(systemName: "flame.fill")
                                .font(.largeTitle)
                                .foregroundStyle(viewModel.streakDays > 0
                                    ? MerkenTheme.warning
                                    : MerkenTheme.mutedText)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("学習ストリーク")
                                    .font(.headline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                Text("\(viewModel.streakDays)日連続")
                                    .font(.title2.bold())
                                    .foregroundStyle(MerkenTheme.primaryText)
                            }
                            Spacer()
                        }
                    }

                    // Word Status Distribution
                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("単語ステータス", systemImage: "chart.bar.fill")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.secondaryText)

                            if viewModel.totalWords > 0 {
                                statusBar(label: "新規", count: viewModel.newWords, color: MerkenTheme.warning)
                                statusBar(label: "復習中", count: viewModel.reviewWords, color: MerkenTheme.accentBlue)
                                statusBar(label: "マスター", count: viewModel.masteredWords, color: MerkenTheme.success)
                            } else {
                                Text("単語がまだありません")
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
                        }
                    }

                    // Overall Stats
                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("総合統計", systemImage: "chart.pie.fill")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.secondaryText)

                            HStack(spacing: 0) {
                                statBox(title: "総単語数", value: "\(viewModel.totalWords)")
                                Spacer()
                                statBox(title: "マスター率", value: viewModel.totalWords > 0
                                    ? "\(Int(viewModel.masterRate * 100))%"
                                    : "-")
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(using: appState)
            }
        }
        .navigationTitle("統計")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private func statBox(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }

    private func statusBar(label: String, count: Int, color: Color) -> some View {
        let fraction = viewModel.totalWords > 0
            ? CGFloat(count) / CGFloat(viewModel.totalWords)
            : 0

        return HStack(spacing: 10) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.secondaryText)
                .frame(width: 60, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.white.opacity(0.08))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: max(geo.size.width * fraction, 2))
                }
            }
            .frame(height: 12)

            Text("\(count)")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(MerkenTheme.primaryText)
                .frame(width: 40, alignment: .trailing)
        }
    }
}
