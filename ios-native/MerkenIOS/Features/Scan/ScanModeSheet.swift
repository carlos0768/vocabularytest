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

    // For source selection action sheet
    @State private var pendingMode: ScanMode?
    @State private var pendingEikenLevel: EikenLevel?
    @State private var showSourcePicker = false

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

    private func confirmSource(mode: ScanMode, eikenLevel: EikenLevel?) {
        pendingMode = mode
        pendingEikenLevel = eikenLevel
        showSourcePicker = true
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
                    ForEach(ScanMode.allCases) { mode in
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
        .confirmationDialog("画像の取得方法", isPresented: $showSourcePicker, titleVisibility: .visible) {
            Button {
                if let mode = pendingMode {
                    onSelect(mode, pendingEikenLevel, .camera)
                }
            } label: {
                Label("カメラで撮影", systemImage: "camera")
            }

            Button {
                if let mode = pendingMode {
                    onSelect(mode, pendingEikenLevel, .photoLibrary)
                }
            } label: {
                Label("写真から選択", systemImage: "photo.on.rectangle")
            }

            Button("キャンセル", role: .cancel) {}
        }
    }

    private func modeButton(mode: ScanMode, locked: Bool) -> some View {
        Button {
            if locked { return }
            if mode == .eiken {
                showEikenPicker = true
            } else {
                confirmSource(mode: mode, eikenLevel: nil)
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

                    Text(mode.subtitle)
                        .font(.caption)
                        .foregroundStyle(locked ? MerkenTheme.mutedText.opacity(0.6) : MerkenTheme.secondaryText)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
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

                VStack(spacing: 16) {
                    Text("英検レベルを選択")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                        .padding(.top, 16)

                    ForEach(EikenLevel.allCases) { level in
                        Button {
                            selectedEikenLevel = level
                            showEikenPicker = false
                            confirmSource(mode: .eiken, eikenLevel: level)
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
