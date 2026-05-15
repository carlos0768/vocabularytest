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
            PaperDotBackground()

            VStack(alignment: .leading, spacing: 18) {
                SolidPageHeader(
                    kicker: "ANALYTICS",
                    title: "学習統計",
                    subtitle: "ログインすると学習の記録を確認できます。"
                )

                Spacer()

                SolidEmptyState(
                    icon: "chart.bar.fill",
                    title: "学習の記録を確認しよう",
                    message: "ログインすると、クイズの正答率や単語の習得状況を確認できます。"
                ) {
                    guestSettingsButton
                }

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
        }
        .buttonStyle(SolidButtonStyle(.surface, size: .small, cornerRadius: 16))
    }

    private var statsContent: some View {
        ZStack {
            PaperDotBackground()

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

                        SolidPageHeader(
                            kicker: "ANALYTICS",
                            title: "学習統計"
                        )

                        if viewModel.loading && viewModel.totalWords == 0 {
                            loadingStatsPanel
                        } else {
                            if let errorMessage = viewModel.errorMessage {
                                statsErrorPanel(errorMessage)
                            }

                            webKPIGrid

                            webWeeklyCard

                            webHeatmapCard

                            webBreakdownCard
                        }
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

    private var recentActivityWeek: [ActivityHistoryDay] {
        Array(viewModel.activityHistory.suffix(7))
    }

    private var recentWeekTotal: Int {
        recentActivityWeek.reduce(0) { $0 + $1.quizCount }
    }

    private var activeLearningDays: Int {
        viewModel.activityHistory.filter { $0.quizCount > 0 }.count
    }

    private var averageActivityPerDay: Int {
        Int((Double(recentWeekTotal) / 7.0).rounded())
    }

    private var masteryPercentValue: Int {
        viewModel.totalWords > 0 ? Int((viewModel.masterRate * 100).rounded()) : 0
    }

    private var maxRecentActivity: Int {
        max(1, recentActivityWeek.map(\.quizCount).max() ?? 0)
    }

    private var loadingStatsPanel: some View {
        SolidSurface(tone: .surface, depth: .small, cornerRadius: 14, padding: 24, alignment: .center) {
            HStack(spacing: 10) {
                ProgressView()
                    .tint(MerkenTheme.solidInk)
                Text("読み込み中...")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
    }

    private func statsErrorPanel(_ message: String) -> some View {
        SolidSurface(
            tone: .danger,
            depth: .small,
            cornerRadius: 14,
            borderColor: MerkenTheme.danger,
            shadowColor: MerkenTheme.danger,
            padding: 14
        ) {
            Text(message)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(MerkenTheme.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var webKPIGrid: some View {
        LazyVGrid(columns: statsGrid, spacing: 10) {
            webKPI(label: "連続日数", value: viewModel.streakDays, suffix: "日", icon: "flame.fill", accent: MerkenTheme.warning)
            webKPI(label: "累計学習日", value: activeLearningDays, suffix: "日")
            webKPI(label: "今週の復習", value: recentWeekTotal, suffix: "語")
            webKPI(label: "1日平均", value: averageActivityPerDay, suffix: "語")
        }
    }

    private func webKPI(label: String, value: Int, suffix: String, icon: String? = nil, accent: Color? = nil) -> some View {
        SolidSurface(tone: .surface, depth: .small, cornerRadius: 12, padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    if let icon {
                        Image(systemName: icon)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(accent ?? MerkenTheme.secondaryText)
                    }
                    Text(label)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .tracking(0.6)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)
                }

                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(value.formatted())
                        .font(.system(size: 26, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.solidInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.68)
                    Text(suffix)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
    }

    private var webWeeklyCard: some View {
        SolidSurface(tone: .surface, depth: .small, cornerRadius: 14, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("WEEKLY")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .tracking(0.8)
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text("過去 7 日間")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.solidInk)
                    }

                    Spacer()

                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(recentWeekTotal.formatted())
                            .font(.system(size: 15, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(MerkenTheme.solidInk)
                        Text("語")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }

                HStack(alignment: .bottom, spacing: 7) {
                    ForEach(recentActivityWeek) { day in
                        let isToday = Calendar.current.isDateInToday(day.date)
                        let height = max(5, 78 * CGFloat(day.quizCount) / CGFloat(maxRecentActivity))

                        VStack(spacing: 5) {
                            Text("\(day.quizCount)")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .monospacedDigit()
                                .foregroundStyle(isToday ? MerkenTheme.solidInk : MerkenTheme.mutedText)

                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(isToday ? MerkenTheme.solidInk : MerkenTheme.solidInk.opacity(0.82))
                                .frame(maxWidth: .infinity)
                                .frame(height: height)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                                        .stroke(MerkenTheme.solidInk, lineWidth: MerkenSolid.borderWidth)
                                )
                                .background(
                                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                                        .fill(isToday ? MerkenTheme.accentGreen : Color.clear)
                                        .offset(x: 2, y: 2)
                                )

                            Text(weekdayLabel(for: day.date))
                                .font(.system(size: 10, weight: isToday ? .bold : .medium))
                                .foregroundStyle(isToday ? MerkenTheme.solidInk : MerkenTheme.mutedText)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 104, alignment: .bottom)
            }
        }
    }

    private var webHeatmapCard: some View {
        SolidSurface(tone: .surface, depth: .small, cornerRadius: 14, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("HEATMAP")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .tracking(0.8)
                            .foregroundStyle(MerkenTheme.mutedText)
                        Text("過去 12 週")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.solidInk)
                    }

                    Spacer()

                    HStack(spacing: 4) {
                        Text("少")
                        ForEach(0..<4, id: \.self) { level in
                            heatCell(level: level, size: 10)
                        }
                        Text("多")
                    }
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(MerkenTheme.mutedText)
                }

                HStack(alignment: .top, spacing: 3) {
                    ForEach(0..<12, id: \.self) { column in
                        VStack(spacing: 3) {
                            ForEach(0..<7, id: \.self) { row in
                                let index = column * 7 + row
                                let count = viewModel.activityHistory.indices.contains(index) ? viewModel.activityHistory[index].quizCount : 0
                                heatCell(level: heatLevel(count))
                            }
                        }
                    }
                }

                HStack {
                    Text("12週前")
                    Spacer()
                    Text("今週")
                }
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    private var webBreakdownCard: some View {
        SolidSurface(tone: .surface, depth: .small, cornerRadius: 14, padding: 14) {
            VStack(alignment: .leading, spacing: 11) {
                Text("BREAKDOWN")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(MerkenTheme.mutedText)

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(masteryPercentValue)")
                        .font(.system(size: 32, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text("%")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text("習得済")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                GeometryReader { proxy in
                    let total = max(CGFloat(viewModel.totalWords), 1)
                    let masteredWidth = proxy.size.width * CGFloat(viewModel.masteredWords) / total
                    let reviewWidth = proxy.size.width * CGFloat(viewModel.reviewWords) / total
                    let newWidth = proxy.size.width * CGFloat(viewModel.newWords) / total

                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(MerkenTheme.borderLight.opacity(0.6))
                        HStack(spacing: 0) {
                            Rectangle()
                                .fill(MerkenTheme.success)
                                .frame(width: masteredWidth)
                            Rectangle()
                                .fill(MerkenTheme.warning)
                                .frame(width: reviewWidth)
                            Rectangle()
                                .fill(MerkenTheme.solidInk.opacity(0.15))
                                .frame(width: newWidth)
                        }
                        .clipShape(.rect(cornerRadius: 4))
                    }
                    .overlay(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .stroke(MerkenTheme.solidInk, lineWidth: MerkenSolid.borderWidth)
                    )
                }
                .frame(height: 10)

                HStack(spacing: 8) {
                    breakdownLegend(color: MerkenTheme.success, label: "習得", value: viewModel.masteredWords)
                    Spacer(minLength: 0)
                    breakdownLegend(color: MerkenTheme.warning, label: "学習中", value: viewModel.reviewWords)
                    Spacer(minLength: 0)
                    breakdownLegend(color: MerkenTheme.solidInk.opacity(0.15), label: "未学習", value: viewModel.newWords)
                }
                .font(.system(size: 10, weight: .medium, design: .monospaced))
            }
        }
    }

    private func breakdownLegend(color: Color, label: String, value: Int) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(color)
                .frame(width: 8, height: 8)
                .overlay(
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .stroke(MerkenTheme.solidInk, lineWidth: 0.75)
                )
            Text(label)
                .foregroundStyle(MerkenTheme.mutedText)
            Text(value.formatted())
                .fontWeight(.bold)
                .foregroundStyle(MerkenTheme.solidInk)
                .monospacedDigit()
        }
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }

    private func heatCell(level: Int, size: CGFloat = 13) -> some View {
        RoundedRectangle(cornerRadius: 2.5, style: .continuous)
            .fill(heatColor(level))
            .frame(width: size, height: size)
            .overlay(
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .stroke(level > 0 ? MerkenTheme.solidInk.opacity(0.12) : Color.clear, lineWidth: 1)
            )
    }

    private func heatLevel(_ count: Int) -> Int {
        if count <= 0 { return 0 }
        if count < 5 { return 1 }
        if count < 15 { return 2 }
        return 3
    }

    private func heatColor(_ level: Int) -> Color {
        switch level {
        case 1:
            return MerkenTheme.success.opacity(0.35)
        case 2:
            return MerkenTheme.success.opacity(0.7)
        case 3:
            return MerkenTheme.success
        default:
            return MerkenTheme.solidInk.opacity(0.07)
        }
    }

    private func weekdayLabel(for date: Date) -> String {
        let labels = ["日", "月", "火", "水", "木", "金", "土"]
        let weekday = Calendar.current.component(.weekday, from: date)
        return labels[max(0, min(weekday - 1, labels.count - 1))]
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
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(MerkenTheme.accentGreen)
                        .frame(width: 32, height: 32)
                        .solidSurface(tone: .surfaceAlt, depth: .flat, cornerRadius: 10)
                    Text("今週の学習")
                        .font(.system(size: 17, weight: .black))
                        .foregroundStyle(MerkenTheme.solidInk)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    ForEach(viewModel.weeklyAccuracy) { day in
                        let isSelected = day.date == selectedWeeklyDay
                        VStack(spacing: 10) {
                            Capsule()
                                .fill(isSelected ? MerkenTheme.solidInk : MerkenTheme.borderLight)
                                .frame(width: 30, height: 10)

                            ZStack(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(MerkenTheme.surfaceAlt)

                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isSelected ? MerkenTheme.accentGreen : MerkenTheme.accentGreen.opacity(0.26))
                                    .frame(height: max(8, 120 * CGFloat(day.accuracy / maxAccuracy)))
                                    .scaleEffect(y: max(barAnimationProgress, 0.001), anchor: .bottom)
                            }
                            .frame(height: 120)
                            .clipped()

                            Text(day.label)
                                .font(.system(size: 15, weight: isSelected ? .bold : .semibold))
                                .foregroundStyle(isSelected ? MerkenTheme.solidInk : MerkenTheme.secondaryText)
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
                        .font(.system(size: 16, weight: .black))
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

                        Text("\(viewModel.totalWords)語中 / 学習中 \(viewModel.reviewWords)語")
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
                        tint: MerkenTheme.warning,
                        value: "\(viewModel.reviewWords)",
                        label: "学習中"
                    )
                    statsMetricTile(
                        icon: "clock.fill",
                        tint: MerkenTheme.mutedText,
                        value: "\(viewModel.newWords)",
                        label: "未学習"
                    )
                    statsMetricTile(
                        icon: "books.vertical.fill",
                        tint: MerkenTheme.accentGreen,
                        value: "\(viewModel.totalWords)",
                        label: "全単語数"
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
                        strokeColor: MerkenTheme.accentGreen,
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
                                .foregroundStyle(MerkenTheme.accentGreen)
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
                        tint: MerkenTheme.accentGreen,
                        value: "\(viewModel.totalProjects)",
                        label: "単語帳"
                    )
                    statsMetricTile(
                        icon: "bookmark.fill",
                        tint: MerkenTheme.accentGreen,
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
                        .fill(MerkenTheme.warning)
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
        let data = animatedMasteryHistory
        let maxMastered = max(data.map(\.mastered).max() ?? 0, 1)
        let today = Calendar.current.startOfDay(for: Date())

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("暗記した単語数の推移")
                    .font(.system(size: 17, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                Spacer()
                Text("過去7日間")
                    .font(.system(size: 11, weight: .black, design: .monospaced))
                    .foregroundStyle(MerkenTheme.accentGreen)
                    .tracking(1.0)
            }

            if data.isEmpty {
                SolidEmptyState(icon: "chart.bar.xaxis", title: "データなし", message: "学習するとここに推移が表示されます。")
                    .frame(height: 200)
            } else {
                Chart {
                    ForEach(data) { point in
                        let isToday = Calendar.current.isDate(point.date, inSameDayAs: today)
                        BarMark(
                            x: .value("日付", point.date, unit: .day),
                            y: .value("習得", point.mastered)
                        )
                        .foregroundStyle(isToday ? MerkenTheme.success : MerkenTheme.success.opacity(0.5))
                        .cornerRadius(3)
                        .annotation(position: .top, spacing: 2) {
                            if point.mastered > 0 {
                                Text("\(point.mastered)")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(MerkenTheme.success)
                            }
                        }
                    }
                }
                .chartYScale(domain: 0...maxMastered)
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: 1)) { _ in
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

                HStack(spacing: 4) {
                    Circle()
                        .fill(MerkenTheme.success)
                        .frame(width: 8, height: 8)
                    Text("習得済み")
                        .font(.system(size: 11))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
        .padding(16)
        .solidSurface(tone: .surface, depth: .standard, cornerRadius: 18)
    }

    private func sectionHeader(icon: String, title: String) -> some View {
        SolidSectionTitle(title, kicker: "STATS")
    }

    private func topSummaryCard(icon: String, tint: Color, value: String, label: String, detail: String) -> some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(tint)
                        .frame(width: 42, height: 42)
                        .solidSurface(tone: .surfaceAlt, depth: .flat, cornerRadius: 13, borderColor: tint.opacity(0.45))
                    Spacer(minLength: 0)
                }

                Text(value)
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                VStack(alignment: .leading, spacing: 4) {
                    Text(label)
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(MerkenTheme.solidInk)
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
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(tint)
                    .frame(width: 30, height: 30)
                    .solidSurface(tone: .surface, depth: .flat, cornerRadius: 10, borderColor: tint.opacity(0.45))
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
        .solidSurface(tone: .surfaceAlt, depth: .small, cornerRadius: 16)
    }
}
