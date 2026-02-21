import SwiftUI

struct ScanModeSheet: View {
    let isPro: Bool
    let onSelect: (ScanMode, EikenLevel?) -> Void
    let onCancel: () -> Void

    @State private var selectedEikenLevel: EikenLevel = .grade3
    @State private var showEikenPicker = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 12) {
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
                                GlassPane {
                                    HStack(spacing: 12) {
                                        Image(systemName: mode.iconName)
                                            .font(.title2)
                                            .foregroundStyle(locked ? MerkenTheme.mutedText : MerkenTheme.accentBlue)
                                            .frame(width: 36)

                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 6) {
                                                Text(mode.displayName)
                                                    .font(.headline)
                                                    .foregroundStyle(locked ? MerkenTheme.mutedText : .white)

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

                                        if !locked {
                                            Image(systemName: "chevron.right")
                                                .foregroundStyle(MerkenTheme.secondaryText)
                                        }
                                    }
                                }
                                .opacity(locked ? 0.6 : 1)
                            }
                            .disabled(locked)
                        }

                        if !isPro {
                            GlassPane {
                                HStack {
                                    Image(systemName: "sparkles")
                                        .foregroundStyle(MerkenTheme.warning)
                                    Text("Proプランですべてのモードが使えます")
                                        .font(.caption)
                                        .foregroundStyle(MerkenTheme.secondaryText)
                                }
                            }
                            .padding(.top, 8)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("スキャンモード")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("キャンセル") {
                        onCancel()
                    }
                    .foregroundStyle(MerkenTheme.accentBlue)
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
                        .foregroundStyle(.white)
                        .padding(.top, 16)

                    ForEach(EikenLevel.allCases) { level in
                        Button {
                            selectedEikenLevel = level
                            showEikenPicker = false
                            onSelect(.eiken, level)
                        } label: {
                            GlassPane {
                                HStack {
                                    Text(level.displayName)
                                        .font(.headline)
                                        .foregroundStyle(.white)
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
