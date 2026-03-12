import SwiftUI

struct BookshelfListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = BookshelfListViewModel()

    @State private var showingCreateSheet = false
    @State private var selectedCollection: Collection?
    @State private var scrollOffset: CGFloat = 0
    @State private var chartAnimationProgress: Double = 0

    private var totalShelfCount: Int {
        viewModel.collections.count
    }

    private var totalProjectCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.projectCount }
    }

    private var totalWordCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.totalWordCount }
    }

    private var totalMasteredWordCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.masteredWordCount }
    }

    private var totalReviewWordCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.reviewWordCount }
    }

    private var totalNewWordCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.newWordCount }
    }

    private var totalSharedProjectCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.sharedProjectCount }
    }

    private var totalPinnedProjectCount: Int {
        viewModel.stats.values.reduce(0) { $0 + $1.pinnedProjectCount }
    }

    private var masteryRate: Double {
        guard totalWordCount > 0 else { return 0 }
        return Double(totalMasteredWordCount) / Double(totalWordCount)
    }

    private var masteryPercentText: String {
        totalWordCount > 0 ? "\(Int(masteryRate * 100))%" : "0%"
    }

    private func triggerChartAnimation() {
        chartAnimationProgress = 0
        withAnimation(.easeOut(duration: 0.9)) {
            chartAnimationProgress = 1
        }
    }

    var body: some View {
        Group {
            if !appState.isLoggedIn {
                guestBookshelfContent
            } else if !appState.isPro {
                proLockedContent
            } else {
                bookshelfContent
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(item: $selectedCollection) { collection in
            BookshelfDetailView(collection: collection)
        }
        .sheet(isPresented: $showingCreateSheet) {
            CreateBookshelfSheet {
                await viewModel.load(using: appState)
                triggerChartAnimation()
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
            triggerChartAnimation()
        }
        .onAppear {
            triggerChartAnimation()
        }
    }

    private var guestBookshelfContent: some View {
        ZStack {
            AppBackground()

            VStack(alignment: .leading, spacing: 18) {
                headerSection

                Spacer()

                VStack(spacing: 16) {
                    Image(systemName: "books.vertical.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .frame(width: 96, height: 96)
                        .background(MerkenTheme.accentBlueLight, in: .circle)

                    Text("本棚を使おう")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)

                    Text("ログインしてProプランにすると、\n複数の単語帳をまとめて学習できます。")
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

    private var bookshelfContent: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                ScrollViewReader { scrollProxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            Color.clear
                                .frame(height: 0)
                                .id("bookshelfTop")
                                .background(
                                    GeometryReader { proxy in
                                        Color.clear.preference(
                                            key: TopSafeAreaScrollOffsetKey.self,
                                            value: proxy.frame(in: .named("bookshelfListScroll")).minY
                                        )
                                    }
                                )

                            HStack(alignment: .top, spacing: 12) {
                                headerSection
                                Spacer(minLength: 0)
                                createBookshelfButton
                            }

                            if let errorMessage = viewModel.errorMessage {
                                SolidCard {
                                    Text(errorMessage)
                                        .foregroundStyle(MerkenTheme.warning)
                                }
                            }

                            bookshelvesSection
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }
                    .coordinateSpace(name: "bookshelfListScroll")
                    .scrollIndicators(.hidden)
                    .disableTopScrollEdgeEffectIfAvailable()
                    .refreshable {
                        await viewModel.load(using: appState)
                        triggerChartAnimation()
                    }
                    .onChange(of: appState.scrollToTopTrigger) { _ in
                        withAnimation {
                            scrollProxy.scrollTo("bookshelfTop", anchor: .top)
                        }
                    }
                }
            }
        }
        .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
        .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
            scrollOffset = value
        }
    }

    private var proLockedContent: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 20) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(MerkenTheme.mutedText)

                Text("本棚はPro限定機能です")
                    .font(.title2.bold())
                    .foregroundStyle(MerkenTheme.primaryText)

                Text("複数の単語帳をまとめて学習できる本棚機能は、Proプランで利用できます。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Button {
                    appState.selectedTab = 4
                } label: {
                    Text("設定でプランを確認")
                }
                .buttonStyle(PrimaryGlassButton())
                .padding(.horizontal, 48)
            }
        }
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("本棚")
                .font(.system(size: 31.2, weight: .black))
                .foregroundStyle(MerkenTheme.primaryText)
                .tracking(2)

            Text("単語帳を束ねて、学習テーマごとにまとめて管理")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(MerkenTheme.secondaryText)
        }
    }

    private var createBookshelfButton: some View {
        Button {
            showingCreateSheet = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .bold))
                Text("作成")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(MerkenTheme.accentBlue)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(MerkenTheme.accentBlue.opacity(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var topSummaryWidgets: some View {
        HStack(spacing: 10) {
            BookshelfSummaryCard(
                icon: "books.vertical.fill",
                tint: MerkenTheme.chartBlue,
                value: "\(totalShelfCount)",
                label: "本棚",
                detail: totalProjectCount > 0 ? "\(totalProjectCount)冊の単語帳を整理" : "まとめ学習の土台"
            )

            BookshelfSummaryCard(
                icon: "square.stack.3d.up.fill",
                tint: MerkenTheme.warning,
                value: "\(totalProjectCount)",
                label: "収録単語帳",
                detail: totalWordCount > 0 ? "\(totalWordCount)語を収録" : "単語帳をまとめて配置"
            )
        }
    }

    private var overviewCard: some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    BookshelfProgressRing(
                        progress: masteryRate,
                        strokeColor: MerkenTheme.chartBlue,
                        title: masteryPercentText,
                        subtitle: "習得",
                        animationProgress: chartAnimationProgress
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text("本棚ライブラリ")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(totalWordCount)")
                                .font(.system(size: 32, weight: .bold))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.65)
                                .foregroundStyle(MerkenTheme.accentBlue)
                            Text("語を収録")
                                .font(.system(size: 16, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .foregroundStyle(MerkenTheme.primaryText)
                        }

                        Text("\(totalMasteredWordCount)語習得 / 復習中 \(totalReviewWordCount)語")
                            .font(.system(size: 13, weight: .medium))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }

                    Spacer(minLength: 0)
                }

                BookshelfDistributionBar(
                    mastered: totalMasteredWordCount,
                    review: totalReviewWordCount,
                    newWords: totalNewWordCount,
                    animationProgress: chartAnimationProgress
                )
                .frame(height: 10)

                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ], spacing: 10) {
                    BookshelfOverviewMetricTile(
                        icon: "books.vertical.fill",
                        tint: MerkenTheme.chartBlue,
                        value: "\(totalShelfCount)",
                        label: "本棚"
                    )
                    BookshelfOverviewMetricTile(
                        icon: "square.stack.3d.up.fill",
                        tint: MerkenTheme.warning,
                        value: "\(totalProjectCount)",
                        label: "単語帳"
                    )
                    BookshelfOverviewMetricTile(
                        icon: "checkmark.circle.fill",
                        tint: MerkenTheme.success,
                        value: "\(totalMasteredWordCount)",
                        label: "習得語"
                    )
                    BookshelfOverviewMetricTile(
                        icon: "person.2.fill",
                        tint: MerkenTheme.mutedText,
                        value: "\(totalSharedProjectCount)",
                        label: "共有中"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 22)
            .frame(minHeight: 198)
        }
    }

    private var bookshelvesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("あなたの本棚")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("テーマごとに並べて、まとめて復習")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
                Spacer()
                Text("\(totalShelfCount)件")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }

            if viewModel.collections.isEmpty, !viewModel.loading {
                emptyStateCard
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.collections) { collection in
                        Button {
                            selectedCollection = collection
                        } label: {
                            collectionCard(collection)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var emptyStateCard: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(MerkenTheme.chartBlue.opacity(0.12))
                        Image(systemName: "books.vertical.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(MerkenTheme.chartBlue)
                    }
                    .frame(width: 44, height: 44)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("本棚がまだありません")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("単語帳をまとめる棚を作ると、テーマ単位で学習を整理できます。")
                            .font(.system(size: 13))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }

                Button("新しい本棚を作成") {
                    showingCreateSheet = true
                }
                .buttonStyle(PrimaryGlassButton())
            }
        }
    }

    private func collectionCard(_ collection: Collection) -> some View {
        let stat = viewModel.stats[collection.id]
        let wordCount = stat?.totalWordCount ?? 0
        let mastered = stat?.masteredWordCount ?? 0
        let reviewing = stat?.reviewWordCount ?? 0
        let newWords = stat?.newWordCount ?? 0
        let sharedCount = stat?.sharedProjectCount ?? 0
        let pinnedCount = stat?.pinnedProjectCount ?? 0
        let projectCount = stat?.projectCount ?? 0
        let masteryText = wordCount > 0 ? "\(Int((stat?.masteryRate ?? 0) * 100))%習得" : "まだ単語なし"

        return SolidCard(padding: 0) {
            HStack(alignment: .top, spacing: 14) {
                BookshelfShelfPreview(
                    collection: collection,
                    stat: stat,
                    colorScheme: colorScheme
                )
                .frame(width: 118, height: 136)
                .fixedSize()

                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(collection.name)
                                .font(.system(size: 18, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)

                            Text(collectionSubheadline(collection: collection, stat: stat))
                                .font(.system(size: 13))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .lineLimit(2)
                        }

                        Spacer(minLength: 0)

                        Text(updatedLabel(for: collection.updatedAt))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(MerkenTheme.mutedText)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(MerkenTheme.background, in: Capsule())
                            .fixedSize(horizontal: true, vertical: true)
                    }

                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("\(wordCount)")
                            .font(.system(size: 30, weight: .bold))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .foregroundStyle(MerkenTheme.primaryText)
                        Text("語を収録")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(MerkenTheme.secondaryText)

                        Spacer(minLength: 0)

                        Text(masteryText)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(MerkenTheme.accentBlue)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(MerkenTheme.background, in: Capsule())
                            .fixedSize(horizontal: true, vertical: true)
                    }

                    BookshelfDistributionBar(
                        mastered: mastered,
                        review: reviewing,
                        newWords: newWords,
                        animationProgress: chartAnimationProgress
                    )
                    .frame(height: 8)

                    FlowLayout(spacing: 8) {
                        BookshelfStatPill(
                            icon: "square.stack.3d.up.fill",
                            tint: MerkenTheme.chartBlue,
                            text: "\(projectCount)冊"
                        )
                        if sharedCount > 0 {
                            BookshelfStatPill(
                                icon: "person.2.fill",
                                tint: MerkenTheme.warning,
                                text: "共有 \(sharedCount)"
                            )
                        }
                        if pinnedCount > 0 {
                            BookshelfStatPill(
                                icon: "pin.fill",
                                tint: MerkenTheme.danger,
                                text: "ピン \(pinnedCount)"
                            )
                        }
                    }

                    FlowLayout(spacing: 8) {
                        BookshelfStatPill(
                            icon: "checkmark.circle.fill",
                            tint: MerkenTheme.success,
                            text: "習得 \(mastered)"
                        )
                        BookshelfStatPill(
                            icon: "bolt.circle.fill",
                            tint: MerkenTheme.chartBlue,
                            text: "学習 \(reviewing)"
                        )
                        BookshelfStatPill(
                            icon: "sparkles",
                            tint: MerkenTheme.mutedText,
                            text: "未学習 \(newWords)"
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .layoutPriority(1)
            }
            .padding(14)
            .clipped()
        }
    }

    private func collectionSubheadline(collection: Collection, stat: CollectionStats?) -> String {
        if let description = collection.description?.trimmingCharacters(in: .whitespacesAndNewlines),
           !description.isEmpty {
            return description
        }

        let titles = stat?.projectTitles ?? []
        if !titles.isEmpty {
            return titles.joined(separator: " ・ ")
        }

        return "この本棚に単語帳を追加して、まとめて学習できます。"
    }

    private func updatedLabel(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "M/d更新"
        return formatter.string(from: date)
    }

}

private struct BookshelfSummaryCard: View {
    let icon: String
    let tint: Color
    let value: String
    let label: String
    let detail: String

    var body: some View {
        SolidCard(padding: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    ZStack {
                        Circle()
                            .fill(tint.opacity(0.12))
                        Image(systemName: icon)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(tint)
                    }
                    .frame(width: 36, height: 36)

                    Spacer()
                }

                Text(value)
                    .font(.system(size: 28, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)

                Text(detail)
                    .font(.system(size: 12))
                    .foregroundStyle(MerkenTheme.mutedText)
                    .lineLimit(2)
                    .minimumScaleFactor(0.9)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 144, alignment: .topLeading)
        }
    }
}

private struct BookshelfOverviewMetricTile: View {
    let icon: String
    let tint: Color
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.12))
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(tint)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.system(size: 17, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(MerkenTheme.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct BookshelfProgressRing: View {
    let progress: Double
    let strokeColor: Color
    let title: String
    let subtitle: String
    let animationProgress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(MerkenTheme.borderLight, lineWidth: 8)

            Circle()
                .trim(from: 0, to: animatedProgress)
                .stroke(
                    strokeColor,
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 1) {
                Text(title)
                    .font(.system(size: 20, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(MerkenTheme.primaryText)
                Text(subtitle)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
        .frame(width: 86, height: 86)
    }

    private var animatedProgress: Double {
        let clamped = max(0, min(progress, 1)) * animationProgress
        guard clamped > 0 else { return 0 }
        return max(0.02, clamped)
    }
}

private struct BookshelfDistributionBar: View {
    let mastered: Int
    let review: Int
    let newWords: Int
    let animationProgress: Double

    private var total: Double {
        Double(mastered + review + newWords)
    }

    var body: some View {
        GeometryReader { geo in
            let animationFactor = CGFloat(animationProgress)
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(MerkenTheme.borderLight)

                HStack(spacing: 0) {
                    if mastered > 0 {
                        Rectangle()
                            .fill(MerkenTheme.success)
                            .frame(width: geo.size.width * CGFloat(Double(mastered) / max(total, 1)) * animationFactor)
                    }
                    if review > 0 {
                        Rectangle()
                            .fill(MerkenTheme.chartBlue)
                            .frame(width: geo.size.width * CGFloat(Double(review) / max(total, 1)) * animationFactor)
                    }
                    if newWords > 0 {
                        Rectangle()
                            .fill(MerkenTheme.mutedText.opacity(0.75))
                            .frame(width: geo.size.width * CGFloat(Double(newWords) / max(total, 1)) * animationFactor)
                    }
                }
                .clipShape(Capsule())
            }
        }
    }
}

private struct BookshelfStatPill: View {
    let icon: String
    let tint: Color
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(tint)
            Text(text)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(MerkenTheme.background, in: Capsule())
    }
}

private struct BookshelfShelfPreview: View {
    let collection: Collection
    let stat: CollectionStats?
    let colorScheme: ColorScheme

    private var previews: [CollectionProjectPreview] {
        stat?.previews ?? []
    }

    private var projectCount: Int {
        stat?.projectCount ?? 0
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            MerkenTheme.surface,
                            MerkenTheme.background
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
                )

            if previews.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "books.vertical.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                    Text("空の本棚")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            } else {
                ZStack(alignment: .bottomLeading) {
                    ForEach(Array(previews.prefix(3).enumerated()), id: \.element.id) { index, preview in
                        BookshelfPreviewBook(
                            preview: preview,
                            colorScheme: colorScheme
                        )
                        .frame(width: 58, height: 84)
                        .rotationEffect(.degrees(Double(index - 1) * 3))
                        .offset(x: CGFloat(index) * 16, y: CGFloat(index) * 7)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .padding(.trailing, 10)
                .padding(.bottom, 10)
            }

            Text("\(projectCount)冊")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(MerkenTheme.surface, in: Capsule())
                .overlay(
                    Capsule().stroke(MerkenTheme.borderLight, lineWidth: 1)
                )
                .padding(10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}

private struct BookshelfPreviewBook: View {
    let preview: CollectionProjectPreview
    let colorScheme: ColorScheme

    var body: some View {
        let color = MerkenTheme.placeholderColor(for: preview.id, isDark: colorScheme == .dark)
        let initial = String(preview.title.prefix(1)).uppercased()

        return ZStack {
            if let iconImage = preview.iconImage,
               let uiImage = ImageCompressor.decodeBase64Image(
                iconImage,
                cacheKey: preview.iconImageCacheKey
               ) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
            } else {
                LinearGradient(
                    colors: [color, color.opacity(0.72)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                HStack(spacing: 0) {
                    Color.black.opacity(0.14)
                        .frame(width: 3)
                    Spacer()
                }

                Text(initial)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white.opacity(0.95))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 4)
    }
}
