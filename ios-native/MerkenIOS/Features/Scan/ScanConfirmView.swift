import SwiftUI

struct ScanConfirmView: View {
    @Binding var words: [EditableExtractedWord]
    @Binding var projectTitle: String
    let targetProjectTitle: String?
    let isPro: Bool
    let currentWordCount: Int
    let freeWordLimit: Int
    let processingSummary: ScanProcessingSummary?
    let onSave: () -> Void
    let onCancel: () -> Void

    private var selectedCount: Int { words.count }
    private var projectedTotal: Int { currentWordCount + selectedCount }
    private var excessCount: Int { max(0, projectedTotal - freeWordLimit) }
    private var availableSlots: Int { max(0, freeWordLimit - currentWordCount) }
    private var wouldExceed: Bool { !isPro && projectedTotal > freeWordLimit }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                if !isPro {
                    limitWarningSection
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                }

                ScrollView {
                    VStack(spacing: 10) {
                        processingSummarySection

                        projectTitleSection

                        ForEach($words) { $word in
                            ScanConfirmWordRow(word: $word) {
                                withAnimation {
                                    words.removeAll { $0.id == word.id }
                                }
                            }
                        }
                    }
                    .padding(16)
                }

                bottomBar
            }
        }
    }

    private var headerSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(words.count)語を確認中")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("内容を確認して保存してください")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            Spacer()
        }
    }

    private var processingSummarySection: some View {
        Group {
            if let summary = processingSummary {
                SolidPane {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("解析結果")
                            .font(.subheadline.bold())
                            .foregroundStyle(MerkenTheme.primaryText)

                        Text("抽出 \(summary.extractedWordCount)語 → 重複統合後 \(summary.dedupedWordCount)語")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.secondaryText)

                        Text("成功ページ \(summary.successPages) / 失敗ページ \(summary.failedPages) / スキップ \(summary.skippedPages)")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }

                if summary.failedPages > 0 || summary.skippedPages > 0 {
                    SolidPane {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(MerkenTheme.warning)
                                Text("一部ページの解析に失敗またはスキップが発生しました")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(MerkenTheme.primaryText)
                            }

                            ForEach(summary.warnings.prefix(4), id: \.self) { warning in
                                Text("・\(warning)")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                        }
                    }
                }
            }
        }
    }

    private var limitWarningSection: some View {
        SolidPane {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: excessCount > 0 ? "exclamationmark.triangle.fill" : "info.circle.fill")
                        .foregroundStyle(excessCount > 0 ? MerkenTheme.danger : MerkenTheme.warning)
                    Text(excessCount > 0 ? "単語数の上限を超えています" : "Freeプランの単語数")
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                }

                Text("現在: \(currentWordCount)語 / 上限: \(freeWordLimit)語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)

                Text("今回: +\(selectedCount)語 → 合計\(projectedTotal)語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)

                if excessCount > 0 {
                    Text("\(excessCount)語超過しています。\(availableSlots)語以下になるまで削除してください。")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.danger)
                } else {
                    Text("あと\(max(0, freeWordLimit - projectedTotal))語追加できます。")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        }
    }

    private var projectTitleSection: some View {
        Group {
            if let targetProjectTitle {
                SolidPane {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("保存先")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)

                        HStack(spacing: 8) {
                            Image(systemName: "book.closed.fill")
                                .foregroundStyle(MerkenTheme.accentBlue)
                            Text(targetProjectTitle)
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.primaryText)
                                .lineLimit(2)
                        }

                        Text("現在 \(currentWordCount)語 / 今回 \(selectedCount)語を追加")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.secondaryText)

                        Text("この単語帳に追加して保存します。")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }
            } else {
                SolidPane {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("プロジェクト名")
                            .font(.caption)
                            .foregroundStyle(MerkenTheme.mutedText)

                        TextField("単語帳の名前を入力", text: $projectTitle)
                            .textFieldStyle(.plain)
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.primaryText)
                            .solidTextField(cornerRadius: 8)
                    }
                }
            }
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 16) {
                Button {
                    onCancel()
                } label: {
                    Text("キャンセル")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(GhostGlassButton())

                Button {
                    onSave()
                } label: {
                    Label("保存", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryGlassButton())
                .disabled(
                    words.isEmpty
                    || (targetProjectTitle == nil && projectTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                    || wouldExceed
                )
            }

            if wouldExceed {
                Text("上限内に収まるように単語を削除してください")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.danger)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(MerkenTheme.surface)
    }
}
