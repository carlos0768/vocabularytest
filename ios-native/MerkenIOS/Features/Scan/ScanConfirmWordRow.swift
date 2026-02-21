import SwiftUI

struct ScanConfirmWordRow: View {
    @Binding var word: EditableExtractedWord
    let onDelete: () -> Void

    @State private var isEditing = false

    var body: some View {
        SolidPane {
            VStack(alignment: .leading, spacing: 8) {
                if isEditing {
                    editingContent
                } else {
                    displayContent
                }
            }
        }
    }

    private var displayContent: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(word.english)
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)

                Text(word.japanese)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)

                if !word.distractors.isEmpty {
                    Text("選択肢: \(word.distractors.joined(separator: ", "))")
                        .font(.caption2)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .lineLimit(1)
                }
            }

            Spacer()

            HStack(spacing: 12) {
                Button {
                    isEditing = true
                } label: {
                    Image(systemName: "pencil")
                        .foregroundStyle(MerkenTheme.accentBlue)
                }

                Button {
                    onDelete()
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(MerkenTheme.danger)
                }
            }
        }
    }

    private var editingContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("英語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
                TextField("english", text: $word.english)
                    .textFieldStyle(.plain)
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .solidTextField(cornerRadius: 8)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("日本語")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)
                TextField("日本語訳", text: $word.japanese)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .solidTextField(cornerRadius: 8)
            }

            HStack {
                Spacer()
                Button("完了") {
                    isEditing = false
                }
                .font(.subheadline.bold())
                .foregroundStyle(MerkenTheme.accentBlue)
            }
        }
    }
}
