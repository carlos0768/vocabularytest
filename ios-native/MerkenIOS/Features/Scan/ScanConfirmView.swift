import SwiftUI

struct ScanConfirmView: View {
    @Binding var words: [EditableExtractedWord]
    @Binding var projectTitle: String
    let targetProjectTitle: String?
    let processingSummary: ScanProcessingSummary?
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

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

    private var projectTitleSection: some View {
        Group {
            if targetProjectTitle == nil {
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
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(MerkenTheme.surface)
    }
}
