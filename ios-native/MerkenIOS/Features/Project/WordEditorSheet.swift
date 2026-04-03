import SwiftUI

struct WordEditorSheet: View {
    enum Mode {
        case create
        case edit(existing: Word)

        var title: String {
            switch self {
            case .create: return "単語を追加"
            case .edit:   return "単語を編集"
            }
        }
    }

    let mode: Mode
    let projectId: String
    let onSubmit: (WordInput) -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?

    @State private var english = ""
    @State private var japanese = ""

    private enum Field { case english, japanese }

    private var existingWord: Word? {
        if case .edit(let w) = mode { return w }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ハンドル
            RoundedRectangle(cornerRadius: 2.5)
                .fill(MerkenTheme.border)
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .padding(.bottom, 16)

            Text(mode.title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .padding(.horizontal, 20)
                .padding(.bottom, 16)

            VStack(spacing: 10) {
                compactField(label: "英単語", text: $english, field: .english)
                    .accessibilityIdentifier("wordEnglishField")
                compactField(label: "日本語訳", text: $japanese, field: .japanese)
                    .accessibilityIdentifier("wordJapaneseField")
            }
            .padding(.horizontal, 20)

            Button {
                onSubmit(
                    WordInput(
                        projectId: projectId,
                        english: english.trimmingCharacters(in: .whitespacesAndNewlines),
                        japanese: japanese.trimmingCharacters(in: .whitespacesAndNewlines),
                        distractors: existingWord?.distractors ?? [],
                        exampleSentence: existingWord?.exampleSentence,
                        exampleSentenceJa: existingWord?.exampleSentenceJa,
                        pronunciation: existingWord?.pronunciation
                    )
                )
                dismiss()
            } label: {
                Text("保存")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(canSubmit ? MerkenTheme.accentBlue : MerkenTheme.border, in: Capsule())
            }
            .disabled(!canSubmit)
            .accessibilityIdentifier("saveWordButton")
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 8)
        }
        .background(MerkenTheme.background)
        .presentationDetents([.height(260)])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(20)
        .onAppear {
            if case .edit(let existing) = mode {
                english  = existing.english
                japanese = existing.japanese
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                focusedField = .english
            }
        }
    }

    private var canSubmit: Bool {
        !english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func compactField(label: String, text: Binding<String>, field: Field) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(MerkenTheme.secondaryText)
                .frame(width: 72, alignment: .leading)
            TextField(label, text: text)
                .font(.system(size: 15))
                .foregroundStyle(MerkenTheme.primaryText)
                .focused($focusedField, equals: field)
                .submitLabel(field == .english ? .next : .done)
                .onSubmit {
                    if field == .english { focusedField = .japanese }
                    else { focusedField = nil }
                }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(focusedField == field ? MerkenTheme.accentBlue : MerkenTheme.border, lineWidth: 1.5)
        )
    }
}
