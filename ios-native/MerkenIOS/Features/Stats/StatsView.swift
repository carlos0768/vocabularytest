import SwiftUI
import Charts

struct StatsView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = StatsViewModel()
    @State private var scrollOffset: CGFloat = 0
    @State private var summaryCardAnimationProgress: Double = 0
    @State private var ringAnimationProgress: Double = 0
    @State private var barAnimationProgress: Double = 0
    @State private var chartRevealProgress: Double = 0
    @State private var statsAnimationGeneration = 0
    @State private var selectedWeeklyDay: Date?
    @State private var didAnimateForCurrentStatsVisit = false

    private let statsGrid = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    var body: some View {
        Group {
            if !appState.isLoggedIn {
                guestStatsContent
            } else {
                statsContent
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var guestStatsContent: some View {
        ZStack {
            AppBackground()

            VStack(alignment: .leading, spacing: 18) {
                Text("進歩")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)

                Spacer()

                VStack(spacing: 16) {
                    Image(systemName: "chart.bar.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .frame(width: 96, height: 96)
                        .background(MerkenTheme.accentBlueLight, in: .circle)

                    Text("学習の記録を確認しよう")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)

                    Text("ログインすると、クイズの正答率や\n単語の習得状況を確認できます。")
                        .font(.system(size: 14))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)

                    guestSettingsButton
                }
                .frame(maxWidth: .infinity)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
        }
    }

    private var guestSettingsButton: some View {
        Button {
            appState.selectedTab = 4
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.system(size: 14, weight: .semibold))
                Text("設定でログイン・登録")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(MerkenTheme.accentBlue)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(MerkenTheme.accentBlue.opacity(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var statsContent: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                ScrollViewReader { scrollProxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Color.clear
                            .frame(height: 0)
                            .id("statsTop")
                            .background(
                                GeometryReader { proxy in
                                    Color.clear.preference(
                                        key: TopSafeAreaScrollOffsetKey.self,
                                        value: proxy.frame(in: .named("statsScroll")).minY
                                    )
                                }
                            )

                        Text("進歩")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)

                        topSummaryWidgets

                        masteryChart

                        sectionHeader(icon: "text.book.closed.fill", title: "単語統計")
                        wordStatsCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 100)
                }
                .coordinateSpace(name: "statsScroll")
                .scrollIndicators(.hidden)
                .disableTopScrollEdgeEffectIfAvailable()
                .refreshable {
                    await viewModel.load(using: appState)
                    syncSelectedWeeklyDay()
                    triggerChartAnimation()
                }
                .onChange(of: appState.scrollToTopTrigger) { _ in
                    withAnimation {
                        scrollProxy.scrollTo("statsTop", anchor: .top)
                    }
                }
                } // ScrollViewReader
            }
        }
        .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
        .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
            scrollOffset = value
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
            syncSelectedWeeklyDay()
            if appState.selectedTab == 3 {
                triggerChartAnimationIfNeededForCurrentVisit()
            }
        }
        .onChange(of: appState.selectedTab) { _, selectedTab in
            if selectedTab != 3 {
                didAnimateForCurrentStatsVisit = false
            }
            if selectedTab == 3 && appState.isLoggedIn {
                syncSelectedWeeklyDay()
                triggerChartAnimationIfNeededForCurrentVisit()
            }
        }
        .onAppear {
            guard appState.isLoggedIn, appState.selectedTab == 3 else { return }
            syncSelectedWeeklyDay()
            triggerChartAnimationIfNeededForCurrentVisit()
        }
        .onChange(of: viewModel.weeklyAccuracy.map(\.id)) { _ in
            syncSelectedWeeklyDay()
        }
    }

    private var masteryPercentText: String {
        viewModel.totalWords > 0 ? "\(Int(viewModel.masterRate * 100))%" : "0%"
    }

    private var favoritePercent: Double {
        guard viewModel.totalWords > 0 else { return 0 }
        return Double(viewModel.favoriteWords) / Double(viewModel.totalWords)
    }

    private var favoritePercentText: String {
        viewModel.totalWords > 0 ? "\(Int(favoritePercent * 100))%" : "0%"
    }

    private func triggerChartAnimation() {
        statsAnimationGeneration += 1
        let generation = statsAnimationGeneration

        var resetTransaction = Transaction()
        resetTransaction.animation = nil
        withTransaction(resetTransaction) {
            summaryCardAnimationProgress = 0
            ringAnimationProgress = 0
            barAnimationProgress = 0
            chartRevealProgress = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            guard generation == statsAnimationGeneration else { return }

            withAnimation(.easeOut(duration: 0.45)) {
                summaryCardAnimationProgress = 1
            }
            withAnimation(.easeOut(duration: 0.85).delay(0.05)) {
                ringAnimationProgress = 1
            }
            withAnimation(.easeOut(duration: 0.85).delay(0.08)) {
                barAnimationProgress = 1
            }
            withAnimation(.easeOut(duration: 1.0).delay(0.12)) {
                chartRevealProgress = 1
            }
        }
    }

    private func triggerChartAnimationIfNeededForCurrentVisit() {
        guard appState.selectedTab == 3 else { return }
        guard !didAnimateForCurrentStatsVisit else { return }
        didAnimateForCurrentStatsVisit = true
        triggerChartAnimation()
    }

    private func animatedProgress(
        _ progress: Double,
        animationProgress: Double,
        minimumVisibleProgress: Double = 0
    ) -> Double {
        let clamped = max(0, min(progress, 1))
        let animated = clamped * animationProgress
        guard animated > 0 else { return 0 }
        return minimumVisibleProgress > 0 ? max(minimumVisibleProgress, animated) : animated
    }

    private func animatedInt(_ value: Int, progress: Double) -> Int {
        max(0, Int((Double(value) * progress).rounded()))
    }

    private func syncSelectedWeeklyDay() {
        let availableDates = Set(viewModel.weeklyAccuracy.map(\.date))
        if let selectedWeeklyDay, availableDates.contains(selectedWeeklyDay) {
            return
        }
        let today = Calendar.current.startOfDay(for: Date())
        selectedWeeklyDay = viewModel.weeklyAccuracy.first(where: {
            Calendar.current.isDate($0.date, inSameDayAs: today)
        })?.date ?? viewModel.weeklyAccuracy.last?.date
    }

    private var animatedMasteryHistory: [MasteryDataPoint] {
        viewModel.masteryHistory.map { point in
            MasteryDataPoint(
                date: point.date,
                label: point.label,
                mastered: animatedInt(point.mastered, progress: chartRevealProgress),
                total: point.total
            )
        }
    }

    private var weeklyStudyCard: some View {
        let selectedDay = viewModel.weeklyAccuracy.first(where: { $0.date == selectedWeeklyDay }) ?? viewModel.weeklyAccuracy.last
        let maxAccuracy = max(viewModel.weeklyAccuracy.map(\.accuracy).max() ?? 0, 0.01)

        return SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    Image(systemName: "calendar")
                        .foregroundStyle(MerkenTheme.chartBlue)
                    Text("今週の学習")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    ForEach(viewModel.weeklyAccuracy) { day in
                        let isSelected = day.date == selectedWeeklyDay
                        VStack(spacing: 10) {
                            Capsule()
                                .fill(isSelected ? MerkenTheme.chartBlue : MerkenTheme.borderLight)
                                .frame(width: 30, height: 10)

                            ZStack(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(MerkenTheme.surfaceAlt)

                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isSelected ? MerkenTheme.chartBlue : MerkenTheme.chartBlue.opacity(0.26))
                                    .frame(height: max(8, 120 * CGFloat(day.accuracy / maxAccuracy)))
                                    .scaleEffect(y: max(barAnimationProgress, 0.001), anchor: .bottom)
                            }
                            .frame(height: 120)
                            .clipped()

                            Text(day.label)
                                .font(.system(size: 15, weight: isSelected ? .bold : .semibold))
                                .foregroundStyle(isSelected ? MerkenTheme.chartBlue : MerkenTheme.secondaryText)
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(.rect)
                        .onTapGesture {
                            selectedWeeklyDay = day.date
                            MerkenHaptic.selection()
                        }
                    }
                }

                Divider()

                HStack {
                    Text((selectedDay?.answered ?? 0) > 0
                        ? "\(Int((selectedDay?.accuracy ?? 0) * 100))%"
                        : "-"
                    )
                    .font(.system(size: 28, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.primaryText)

                    Spacer()

                    Text("正答率")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
    }

    private var wordStatsCard: some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    statsProgressRing(
                        progress: viewModel.masterRate,
                        strokeColor: MerkenTheme.success,
                        title: masteryPercentText,
                        subtitle: "習得"
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text("習得の進捗")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(viewModel.masteredWords)")
                                .font(.system(size: 32, weight: .bold))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.65)
                                .foregroundStyle(MerkenTheme.success)
                            Text("語を習得")
                                .font(.system(size: 16, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .foregroundStyle(MerkenTheme.primaryText)
                        }

                        Text("\(viewModel.totalWords)語中 / 復習中 \(viewModel.reviewWords)語")
                            .font(.system(size: 13, weight: .medium))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Spacer(minLength: 0)
                }

                wordDistributionBar

                LazyVGrid(columns: statsGrid, spacing: 10) {
                    statsMetricTile(
                        icon: "checkmark.circle.fill",
                        tint: MerkenTheme.success,
                        value: "\(viewModel.masteredWords)",
                        label: "習得済み"
                    )
                    statsMetricTile(
                        icon: "arrow.triangle.2.circlepath.circle.fill",
                        tint: MerkenTheme.chartBlue,
                        value: "\(viewModel.reviewWords)",
                        label: "復習中"
                    )
                    statsMetricTile(
                        icon: "clock.fill",
                        tint: MerkenTheme.mutedText,
                        value: "\(viewModel.newWords)",
                        label: "未学習"
                    )
                    statsMetricTile(
                        icon: "exclamationmark.circle.fill",
                        tint: MerkenTheme.danger,
                        value: "\(viewModel.wrongAnswersCount)",
                        label: "間違い"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 22)
            .frame(minHeight: 192)
        }
    }

    private var topSummaryWidgets: some View {
        HStack(spacing: 10) {
            topSummaryCard(
                icon: "flame.fill",
                tint: .orange,
                value: "\(animatedInt(viewModel.streakDays, progress: summaryCardAnimationProgress))日",
                label: "連続学習",
                detail: viewModel.streakDays > 0 ? "学習を継続中" : "今日から積み上げ"
            )

            topSummaryCard(
                icon: "sparkles",
                tint: MerkenTheme.success,
                value: "\(animatedInt(viewModel.todayMasteredWords, progress: summaryCardAnimationProgress))語",
                label: "今日習得",
                detail: "今日増えた習得単語"
            )
        }
    }

    private var overviewCard: some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    statsProgressRing(
                        progress: favoritePercent,
                        strokeColor: MerkenTheme.chartBlue,
                        title: favoritePercentText,
                        subtitle: "苦手"
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text("学習ライブラリ")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(viewModel.totalWords)")
                                .font(.system(size: 32, weight: .bold))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.65)
                                .foregroundStyle(MerkenTheme.chartBlue)
                            Text("語を管理")
                                .font(.system(size: 16, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .foregroundStyle(MerkenTheme.primaryText)
                        }

                        Text("\(viewModel.totalProjects)冊の単語帳を整理中")
                            .font(.system(size: 13, weight: .medium))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Spacer(minLength: 0)
                }

                LazyVGrid(columns: statsGrid, spacing: 10) {
                    statsMetricTile(
                        icon: "books.vertical.fill",
                        tint: MerkenTheme.chartBlue,
                        value: "\(viewModel.totalProjects)",
                        label: "単語帳"
                    )
                    statsMetricTile(
                        icon: "heart.fill",
                        tint: MerkenTheme.danger,
                        value: "\(viewModel.favoriteWords)",
                        label: "苦手単語"
                    )
                    statsMetricTile(
                        icon: "flame.fill",
                        tint: .orange,
                        value: "\(viewModel.streakDays)日",
                        label: "連続学習"
                    )
                    statsMetricTile(
                        icon: "chart.bar.fill",
                        tint: MerkenTheme.success,
                        value: masteryPercentText,
                        label: "習得率"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 22)
            .frame(minHeight: 192)
        }
    }

    private var wordDistributionBar: some View {
        GeometryReader { geo in
            let total = max(CGFloat(viewModel.totalWords), 1)
            let masteredWidth = geo.size.width * CGFloat(viewModel.masteredWords) / total
            let reviewWidth = geo.size.width * CGFloat(viewModel.reviewWords) / total
            let newWidth = geo.size.width * CGFloat(viewModel.newWords) / total

            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 7)
                    .fill(MerkenTheme.surfaceAlt)

                HStack(spacing: 0) {
                    Rectangle()
                        .fill(MerkenTheme.success)
                        .frame(width: max(masteredWidth, 0))
                    Rectangle()
                        .fill(MerkenTheme.chartBlue)
                        .frame(width: max(reviewWidth, 0))
                    Rectangle()
                        .fill(MerkenTheme.borderLight)
                        .frame(width: max(newWidth, 0))
                }
                .clipShape(.rect(cornerRadius: 7))
                .scaleEffect(x: max(barAnimationProgress, 0.001), y: 1, anchor: .leading)
                .animation(.easeOut(duration: 0.9), value: barAnimationProgress)
            }
        }
        .frame(height: 14)
    }

    private var masteryChart: some View {
        let totalData = viewModel.masteryHistory
        let data = animatedMasteryHistory
        let maxTotal = data.map(\.total).max() ?? 0
        let maxMastered = data.map(\.mastered).max() ?? 0
        let maxVal = max(max(maxTotal, maxMastered), 1)

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
                    ForEach(totalData) { point in
                        LineMark(
                            x: .value("日付", point.date, unit: .day),
                            y: .value("合計", point.total),
                            series: .value("series", "total")
                        )
                        .foregroundStyle(MerkenTheme.chartBlue.opacity(0.18 + (0.22 * chartRevealProgress)))
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                        .interpolationMethod(.monotone)
                    }

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
                .transaction { transaction in
                    transaction.animation = nil
                }
                .mask(
                    Rectangle()
                        .scaleEffect(x: max(chartRevealProgress, 0.001), y: 1, anchor: .leading)
                )

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
                            .fill(MerkenTheme.chartBlue.opacity(0.4))
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

    private func sectionHeader(icon: String, title: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(MerkenTheme.chartBlue)
            Text(title)
                .font(.headline)
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }

    private func topSummaryCard(icon: String, tint: Color, value: String, label: String, detail: String) -> some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    IconBadge(systemName: icon, color: tint, size: 42)
                    Spacer(minLength: 0)
                }

                Text(value)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                VStack(alignment: .leading, spacing: 4) {
                    Text(label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text(detail)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .lineLimit(2)
                        .minimumScaleFactor(0.9)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 146, alignment: .leading)
        }
    }

    private func statsProgressRing(progress: Double, strokeColor: Color, title: String, subtitle: String) -> some View {
        ZStack {
            Circle()
                .stroke(MerkenTheme.borderLight, lineWidth: 6)

            Circle()
                .trim(from: 0, to: animatedProgress(progress, animationProgress: ringAnimationProgress))
                .stroke(
                    strokeColor,
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.9), value: ringAnimationProgress)

            VStack(spacing: 1) {
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .monospacedDigit()
                Text(subtitle)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
        .frame(width: 84, height: 84)
    }

    private func statsMetricTile(icon: String, tint: Color, value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 28, height: 28)
                    .background(tint.opacity(0.12), in: .circle)
                Spacer(minLength: 0)
            }

            Text(value)
                .font(.system(size: 22, weight: .bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(MerkenTheme.primaryText)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(MerkenTheme.border.opacity(0.7), lineWidth: 1)
        )
    }
}
