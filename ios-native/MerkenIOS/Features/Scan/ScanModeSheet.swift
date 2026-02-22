import SwiftUI

struct ScanModeSheet: View {
    let isPro: Bool
    let onSelect: (ScanMode, EikenLevel?) -> Void
    let onCancel: () -> Void

    @State private var selectedEikenLevel: EikenLevel = .grade3
    @State private var showEikenPicker = false

    private func iconColor(for mode: ScanMode) -> Color {
        switch mode {
        case .all: return MerkenTheme.accentBlue
        case .circled: return MerkenTheme.warning
        case .highlighted: return MerkenTheme.accentBlue
        case .eiken: return MerkenTheme.accentBlue
        case .idiom: return MerkenTheme.success
        case .wrong: return MerkenTheme.danger
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 10) {
                        Text("抽出モードを選択")
                            .font(.title2.bold())
                            .foregroundStyle(MerkenTheme.primaryText)
                            .padding(.bottom, 2)

                        Text("どのように単語を抽出しますか？")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.mutedText)
                            .padding(.bottom, 8)

                        ForEach(ScanMode.allCases) { mode in
                            let locked = mode.requiresPro && !isPro

                            Button {
                                if locked { return }
                                if mode == .eiken {
                                    showEikenPicker = true
                                } else {
                                    onSelect(mode, nil)
                                }
                            } label: {
                                SolidPane(cornerRadius: 20) {
                                    HStack(spacing: 16) {
                                        IconBadge(
                                            systemName: mode.iconName,
                                            color: locked ? MerkenTheme.mutedText : iconColor(for: mode),
                                            size: 52
                                        )

                                        VStack(alignment: .leading, spacing: 4) {
                                            HStack(spacing: 6) {
                                                Text(mode.displayName)
                                                    .font(.headline)
                                                    .foregroundStyle(locked ? MerkenTheme.mutedText : MerkenTheme.primaryText)

                                                if locked {
                                                    Image(systemName: "lock.fill")
                                                        .font(.caption)
                                                        .foregroundStyle(MerkenTheme.mutedText)
                                                }
                                            }

                                            Text(mode.subtitle)
                                                .font(.caption)
                                                .foregroundStyle(locked ? MerkenTheme.mutedText.opacity(0.6) : MerkenTheme.secondaryText)
                                        }

                                        Spacer()
                                    }
                                }
                                .opacity(locked ? 0.6 : 1)
                            }
                            .disabled(locked)
                        }

                        if !isPro {
                            HStack {
                                Image(systemName: "sparkles")
                                    .foregroundStyle(MerkenTheme.warning)
                                Text("Proプランですべてのモードが使えます")
                                    .font(.caption)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                            }
                            .padding(.top, 8)
                        }

                        Button {
                            onCancel()
                        } label: {
                            Text("キャンセル")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 20)
                                        .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
                                )
                        }
                        .padding(.top, 8)
                    }
                    .padding(16)
                }
            }
            .sheet(isPresented: $showEikenPicker) {
                eikenPickerSheet
            }
        }
    }

    private var eikenPickerSheet: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(spacing: 16) {
                    Text("英検レベルを選択")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                        .padding(.top, 16)

                    ForEach(EikenLevel.allCases) { level in
                        Button {
                            selectedEikenLevel = level
                            showEikenPicker = false
                            onSelect(.eiken, level)
                        } label: {
                            SolidPane {
                                HStack {
                                    Text(level.displayName)
                                        .font(.headline)
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    Spacer()
                                    if level == selectedEikenLevel {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(MerkenTheme.accentBlue)
                                    }
                                }
                            }
                        }
                    }

                    Spacer()
                }
                .padding(16)
            }
            .navigationTitle("英検レベル")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("戻る") {
                        showEikenPicker = false
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
