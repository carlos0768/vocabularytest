import SwiftUI

struct ScanProcessingView: View {
    let projectTitle: String
    let projectImage: UIImage?
    let pages: [ScanPageProgress]
    let summary: ScanProcessingSummary?

    private var completedPageCount: Int {
        pages.filter { $0.status == .success || $0.status == .failed || $0.status == .skippedLimit }.count
    }

    private var activeStatusText: String {
        if pages.contains(where: { $0.status == .processing && ( $0.message ?? "" ).contains("アップロード") }) {
            return "画像をアップロード中"
        }
        if pages.contains(where: { $0.status == .processing && ( $0.message ?? "" ).contains("準備") }) {
            return "画像を準備中"
        }
        return "解析を開始しています"
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 16) {
                ScrollView {
                    VStack(spacing: 14) {
                        processingHeaderCard
                        pageListSection

                        if let summary {
                            processingSummaryCard(summary)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
                }
            }
        }
    }

    private var processingHeaderCard: some View {
        HStack(spacing: 0) {
            thumbnail

            VStack(alignment: .leading, spacing: 8) {
                Text(projectTitle)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 8) {
                    MiniProcessingSpinner(size: 16, lineWidth: 2.5, tint: MerkenTheme.accentBlue)
                    Text(activeStatusText)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }

                HStack(spacing: 8) {
                    progressChip(text: "\(completedPageCount)/\(max(pages.count, 1))ページ")
                    progressChip(text: "単語帳一覧に追加予定")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(10)
        .background(MerkenTheme.surface, in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(MerkenTheme.accentBlue.opacity(0.28), lineWidth: 1)
        )
    }

    private var thumbnail: some View {
        ZStack {
            if let projectImage {
                Image(uiImage: projectImage)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 10)
            } else {
                LinearGradient(
                    colors: [
                        MerkenTheme.accentBlue.opacity(0.2),
                        MerkenTheme.accentBlue.opacity(0.05)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            Color.black.opacity(0.35)
            GeneratingProgressRing()
        }
        .frame(width: 86, height: 86)
        .clipShape(.rect(cornerRadius: 18))
    }

    private var pageListSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ページ一覧")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                Spacer()
                Text("アップロードから解析まで自動で進行")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }

            LazyVStack(spacing: 8) {
                ForEach(pages) { page in
                    SolidPane {
                        HStack(spacing: 12) {
                            statusIndicator(for: page.status)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("ページ \(page.pageIndex)")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(MerkenTheme.primaryText)

                                Text(statusLabel(for: page))
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                    .lineLimit(2)
                            }

                            Spacer()

                            if page.status == .success && page.extractedCount > 0 {
                                Text("\(page.extractedCount)語")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(MerkenTheme.success)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(MerkenTheme.success.opacity(0.1), in: Capsule())
                            }
                        }
                    }
                }
            }
        }
    }

    private func processingSummaryCard(_ summary: ScanProcessingSummary) -> some View {
        SolidPane {
            VStack(alignment: .leading, spacing: 6) {
                Text("解析サマリー")
                    .font(.subheadline.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("成功 \(summary.successPages) / 失敗 \(summary.failedPages) / スキップ \(summary.skippedPages)")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)
                Text("抽出語数 \(summary.extractedWordCount)語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        }
    }

    private func progressChip(text: String) -> some View {
        Capsule()
            .fill(MerkenTheme.borderLight)
            .overlay {
                Text(text)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
            }
            .fixedSize()
    }

    @ViewBuilder
    private func statusIndicator(for status: ScanPageStatus) -> some View {
        switch status {
        case .pending, .processing:
            MiniProcessingSpinner(size: 20, lineWidth: 2.8, tint: MerkenTheme.accentBlue)
        case .success:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(MerkenTheme.success)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(MerkenTheme.danger)
        case .skippedLimit:
            Image(systemName: "minus.circle.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(MerkenTheme.warning)
        }
    }

    private func statusLabel(for page: ScanPageProgress) -> String {
        switch page.status {
        case .pending:
            return page.message ?? "待機中"
        case .processing:
            return page.message ?? "解析中..."
        case .success:
            return page.message ?? (page.extractedCount > 0 ? "\(page.extractedCount)語を抽出" : "完了")
        case .failed:
            return page.message ?? "失敗"
        case .skippedLimit:
            return page.message ?? "上限到達でスキップ"
        }
    }
}

private struct MiniProcessingSpinner: View {
    let size: CGFloat
    let lineWidth: CGFloat
    let tint: Color

    private let duration: TimeInterval = 0.9

    var body: some View {
        TimelineView(.animation) { context in
            let elapsed = context.date.timeIntervalSinceReferenceDate
            let progress = elapsed.truncatingRemainder(dividingBy: duration) / duration

            Circle()
                .trim(from: 0.12, to: 0.86)
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .frame(width: size, height: size)
                .rotationEffect(.degrees(progress * 360))
        }
    }
}
