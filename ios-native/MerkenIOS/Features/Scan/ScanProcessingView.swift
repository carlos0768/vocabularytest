import SwiftUI

struct ScanProcessingView: View {
    let pages: [ScanPageProgress]
    let summary: ScanProcessingSummary?

    @State private var dotCount = 0
    private let timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    private var completedPageCount: Int {
        pages.filter { $0.status == .success || $0.status == .failed || $0.status == .skippedLimit }.count
    }

    private var progressValue: Double {
        guard !pages.isEmpty else { return 0 }
        return Double(completedPageCount) / Double(pages.count)
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 16) {
                VStack(spacing: 12) {
                    ProgressView(value: progressValue)
                        .tint(MerkenTheme.accentBlue)

                    Text("画像をアップロード中\(String(repeating: ".", count: dotCount))")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)

                    Text("アップロード後にサーバーで解析を実行します。")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)

                if let summary {
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
                    .padding(.horizontal, 16)
                }

                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(pages) { page in
                            SolidPane {
                                HStack(spacing: 12) {
                                    Image(systemName: statusIcon(for: page.status))
                                        .foregroundStyle(statusColor(for: page.status))
                                        .font(.headline)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("ページ \(page.pageIndex)")
                                            .font(.subheadline.bold())
                                            .foregroundStyle(MerkenTheme.primaryText)
                                        Text(statusLabel(for: page))
                                            .font(.caption)
                                            .foregroundStyle(MerkenTheme.secondaryText)
                                    }

                                    Spacer()
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
            }
        }
        .onReceive(timer) { _ in
            dotCount = (dotCount + 1) % 4
        }
    }

    private func statusLabel(for page: ScanPageProgress) -> String {
        switch page.status {
        case .pending:
            return "待機中"
        case .processing:
            return page.message ?? "解析中..."
        case .success:
            return page.message ?? "\(page.extractedCount)語を抽出"
        case .failed:
            return page.message ?? "失敗"
        case .skippedLimit:
            return page.message ?? "上限到達でスキップ"
        }
    }

    private func statusIcon(for status: ScanPageStatus) -> String {
        switch status {
        case .pending: return "clock"
        case .processing: return "hourglass"
        case .success: return "checkmark.circle.fill"
        case .failed: return "xmark.circle.fill"
        case .skippedLimit: return "minus.circle.fill"
        }
    }

    private func statusColor(for status: ScanPageStatus) -> Color {
        switch status {
        case .pending: return MerkenTheme.mutedText
        case .processing: return MerkenTheme.accentBlue
        case .success: return MerkenTheme.success
        case .failed: return MerkenTheme.danger
        case .skippedLimit: return MerkenTheme.warning
        }
    }
}
