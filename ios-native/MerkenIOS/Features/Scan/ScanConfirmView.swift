import SwiftUI

struct ScanConfirmView: View {
    @Binding var words: [EditableExtractedWord]
    @Binding var projectTitle: String
    let targetProjectTitle: String?
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
                Text("\(words.count)語を抽出しました")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                Text("内容を確認して保存してください")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
            Spacer()
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
            .disabled(words.isEmpty || (targetProjectTitle == nil && projectTitle.trimmingCharacters(in: .whitespaces).isEmpty))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(MerkenTheme.surface)
    }
}
