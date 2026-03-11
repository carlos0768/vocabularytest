import SwiftUI

enum ScanSource {
    case camera
    case photoLibrary
}

struct ScanModeSheet: View {
    let isPro: Bool
    let onSelect: (ScanMode, EikenLevel?, ScanSource) -> Void
    let onCancel: () -> Void

    @State private var selectedEikenLevel: EikenLevel = .grade3
    @State private var showEikenPicker = false

    private var visibleModes: [ScanMode] {
        ScanMode.allCases.filter { mode in
            mode != .highlighted && mode != .wrong
        }
    }

    private func iconName(for mode: ScanMode) -> String {
        mode.iconName
    }

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
        ZStack {
            AppBackground()

            ScrollView {
                VStack(spacing: 12) {
                    // Header
                    Text("抽出モードを選択")
                        .font(.title3.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                        .padding(.top, 4)

                    Text("どのように単語を抽出しますか？")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .padding(.bottom, 4)

                    // Mode buttons
                    ForEach(visibleModes) { mode in
                        let locked = mode.requiresPro && !isPro
                        modeButton(mode: mode, locked: locked)
                    }

                    if !isPro {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.warning)
                            Text("Proプランですべてのモードが使えます")
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.secondaryText)
                        }
                        .padding(.top, 4)
                    }

                    // Cancel button
                    Button {
                        onCancel()
                    } label: {
                        Text("キャンセル")
                            .font(.headline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(MerkenTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(MerkenTheme.borderLight, lineWidth: 1)
                            )
                    }
                    .padding(.top, 4)
                }
                .padding(20)
            }
            .scrollIndicators(.hidden)
        }
        .sheet(isPresented: $showEikenPicker) {
            eikenPickerSheet
        }
    }

    private func modeButton(mode: ScanMode, locked: Bool) -> some View {
        Button {
            if locked { return }
            if mode == .eiken {
                showEikenPicker = true
            } else {
                onSelect(mode, nil, .camera)
            }
        } label: {
            HStack(spacing: 16) {
                // Circle icon (matching web's rounded-full icon container)
                ZStack {
                    Circle()
                        .fill((locked ? MerkenTheme.mutedText : iconColor(for: mode)).opacity(0.1))
                        .frame(width: 48, height: 48)

                    Image(systemName: iconName(for: mode))
                        .font(.system(size: 22))
                        .foregroundStyle(locked ? MerkenTheme.mutedText : iconColor(for: mode))
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(mode.displayName)
                            .font(.headline)
                            .foregroundStyle(locked ? MerkenTheme.mutedText : MerkenTheme.primaryText)

                        if locked {
                            HStack(spacing: 2) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 10))
                                Text("Pro")
                                    .font(.caption2.bold())
                            }
                            .foregroundStyle(MerkenTheme.warning)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(MerkenTheme.warning.opacity(0.15))
                            .clipShape(Capsule())
                        }
                    }
                }

                Spacer()
            }
            .padding(14)
            .background(MerkenTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(MerkenTheme.borderLight, lineWidth: 1)
            )
            .opacity(locked ? 0.6 : 1)
        }
        .disabled(locked)
    }

    private var eikenPickerSheet: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(EikenLevel.allCases) { level in
                            Button {
                                selectedEikenLevel = level
                                showEikenPicker = false
                                onSelect(.eiken, level, .camera)
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
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
            }
            .navigationTitle("英検レベルを選択")
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
        .presentationDetents([.large])
    }
}
