import SwiftUI

struct WordEditorSheet: View {
    enum Mode {
        case create
        case edit(existing: Word)

        var title: String {
            switch self {
            case .create: return "単語を追加"
            case .edit: return "単語を編集"
            }
        }
    }

    let mode: Mode
    let onSubmit: (WordInput) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var english = ""
    @State private var japanese = ""
    @State private var distractor1 = ""
    @State private var distractor2 = ""
    @State private var distractor3 = ""
    @State private var exampleSentence = ""

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        field(label: "英単語", text: $english)
                            .accessibilityIdentifier("wordEnglishField")
                        field(label: "日本語", text: $japanese)
                            .accessibilityIdentifier("wordJapaneseField")
                        field(label: "誤答 1", text: $distractor1)
                            .accessibilityIdentifier("wordDistractor1Field")
                        field(label: "誤答 2", text: $distractor2)
                            .accessibilityIdentifier("wordDistractor2Field")
                        field(label: "誤答 3", text: $distractor3)
                            .accessibilityIdentifier("wordDistractor3Field")
                        field(label: "例文 (任意)", text: $exampleSentence)

                        Button("保存") {
                            onSubmit(
                                WordInput(
                                    projectId: "",
                                    english: english.trimmingCharacters(in: .whitespacesAndNewlines),
                                    japanese: japanese.trimmingCharacters(in: .whitespacesAndNewlines),
                                    distractors: [distractor1, distractor2, distractor3].map {
                                        $0.trimmingCharacters(in: .whitespacesAndNewlines)
                                    },
                                    exampleSentence: exampleSentence.isEmpty ? nil : exampleSentence,
                                    exampleSentenceJa: nil,
                                    pronunciation: nil
                                )
                            )
                            dismiss()
                        }
                        .buttonStyle(PrimaryGlassButton())
                        .accessibilityIdentifier("saveWordButton")
                        .disabled(!canSubmit)
                        .opacity(canSubmit ? 1 : 0.55)
                    }
                    .padding(16)
                }
            }
            .navigationTitle(mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if case .edit(let existing) = mode {
                    english = existing.english
                    japanese = existing.japanese
                    distractor1 = existing.distractors.indices.contains(0) ? existing.distractors[0] : ""
                    distractor2 = existing.distractors.indices.contains(1) ? existing.distractors[1] : ""
                    distractor3 = existing.distractors.indices.contains(2) ? existing.distractors[2] : ""
                    exampleSentence = existing.exampleSentence ?? ""
                }
            }
        }
    }

    private var canSubmit: Bool {
        !english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !japanese.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && [distractor1, distractor2, distractor3].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private func field(label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(MerkenTheme.secondaryText)
            TextField(label, text: text)
                .textFieldStyle(.plain)
                .solidTextField()
        }
    }
}
