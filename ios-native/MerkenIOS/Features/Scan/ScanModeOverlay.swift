import SwiftUI

struct ScanModeOverlay: View {
    private enum Stage: Equatable {
        case modes
        case eiken
        case source(ScanMode, EikenLevel?)
    }

    let isPro: Bool
    let onSelectMode: (ScanMode, EikenLevel?, ScanSource) -> Void
    let onDismiss: () -> Void

    @State private var selectedEikenLevel: EikenLevel = .grade3
    @State private var stage: Stage = .modes
    @State private var appeared = false

    private let columns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]

    private var visibleModes: [ScanMode] {
        ScanMode.allCases.filter { mode in
            mode != .highlighted && mode != .wrong
        }
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

    private func selectMode(_ mode: ScanMode) {
        if mode == .eiken {
            stage = .eiken
        } else {
            stage = .source(mode, nil)
        }
    }

    private func selectEikenLevel(_ level: EikenLevel) {
        selectedEikenLevel = level
        stage = .source(.eiken, level)
    }

    private func chooseSource(_ source: ScanSource, for mode: ScanMode, level: EikenLevel?) {
        MerkenHaptic.selection()
        onSelectMode(mode, level, source)
    }

    private func goBack() {
        switch stage {
        case .modes:
            onDismiss()
        case .eiken:
            stage = .modes
        case .source(let mode, _):
            stage = mode == .eiken ? .eiken : .modes
        }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(appeared ? 0.42 : 0)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack(spacing: 18) {
                Spacer()

                overlayHeader
                overlayContent
                    .padding(.horizontal, 18)
                    .padding(.bottom, 120)
            }
        }
        .opacity(appeared ? 1 : 0)
        .scaleEffect(appeared ? 1 : 0.98, anchor: .bottom)
        .animation(.easeOut(duration: 0.18), value: appeared)
        .animation(MerkenSpring.snappy, value: stage)
        .onAppear { appeared = true }
    }

    private var overlayHeader: some View {
        HStack {
            Button {
                goBack()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: stage == .modes ? "xmark" : "chevron.left")
                        .font(.system(size: 15, weight: .semibold))
                    Text(stage == .modes ? "閉じる" : "戻る")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.black.opacity(0.75), in: Capsule())
            }

            Spacer()
        }
        .padding(.horizontal, 18)
    }

    @ViewBuilder
    private var overlayContent: some View {
        switch stage {
        case .modes:
            modeGrid
        case .eiken:
            eikenLevelGrid
        case .source(let mode, let level):
            sourceGrid(mode: mode, level: level)
        }
    }

    private var modeGrid: some View {
        VStack(spacing: 14) {
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(visibleModes) { mode in
                    let locked = mode.requiresPro && !isPro
                    modeCard(mode: mode, locked: locked)
                }
            }

            if !isPro {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.warning)
                    Text("Proプランですべてのモードが使えます")
                        .font(.caption)
                        .foregroundStyle(Color.white.opacity(0.78))
                }
            }
        }
    }

    private var eikenLevelGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("英検レベル")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(EikenLevel.allCases) { level in
                    Button {
                        selectEikenLevel(level)
                    } label: {
                        VStack(spacing: 10) {
                            Image(systemName: "graduationcap.fill")
                                .font(.system(size: 22, weight: .medium))
                                .foregroundStyle(MerkenTheme.accentBlue)
                            Text(level.displayName)
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 120)
                        .background(tileBackground(isHighlighted: level == selectedEikenLevel))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func sourceGrid(mode: ScanMode, level: EikenLevel?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(sourceGridTitle(for: mode, level: level))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)

            LazyVGrid(columns: columns, spacing: 14) {
                sourceCard(
                    title: "カメラで撮影",
                    subtitle: "その場で読み取る",
                    systemImage: "camera.fill",
                    tint: MerkenTheme.accentBlue
                ) {
                    chooseSource(.camera, for: mode, level: level)
                }

                sourceCard(
                    title: "写真から選択",
                    subtitle: "ライブラリから追加",
                    systemImage: "photo.on.rectangle.angled",
                    tint: MerkenTheme.success
                ) {
                    chooseSource(.photoLibrary, for: mode, level: level)
                }
            }
        }
    }

    private func modeCard(mode: ScanMode, locked: Bool) -> some View {
        Button {
            if locked { return }
            MerkenHaptic.selection()
            selectMode(mode)
        } label: {
            VStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill((locked ? MerkenTheme.mutedText : iconColor(for: mode)).opacity(0.12))
                        .frame(width: 56, height: 56)

                    Image(systemName: mode.iconName)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(locked ? MerkenTheme.mutedText : iconColor(for: mode))
                }

                VStack(spacing: 4) {
                    HStack(spacing: 4) {
                        Text(mode.displayName)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(locked ? MerkenTheme.mutedText : MerkenTheme.primaryText)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)

                        if locked {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }
                    .frame(maxWidth: .infinity)

                    Text(mode.subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(locked ? MerkenTheme.mutedText.opacity(0.6) : MerkenTheme.secondaryText)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 164)
            .padding(.horizontal, 10)
            .background(tileBackground(isHighlighted: false))
            .opacity(locked ? 0.6 : 1)
        }
        .disabled(locked)
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func tileBackground(isHighlighted: Bool) -> some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(MerkenTheme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(
                        isHighlighted ? MerkenTheme.accentBlue.opacity(0.45) : MerkenTheme.borderLight,
                        lineWidth: isHighlighted ? 1.5 : 1
                    )
            )
            .shadow(color: .black.opacity(0.14), radius: 18, x: 0, y: 8)
    }

    private func sourceCard(
        title: String,
        subtitle: String,
        systemImage: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(tint.opacity(0.12))
                        .frame(width: 56, height: 56)

                    Image(systemName: systemImage)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(tint)
                }

                VStack(spacing: 4) {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)

                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 164)
            .padding(.horizontal, 10)
            .background(tileBackground(isHighlighted: false))
        }
        .buttonStyle(.plain)
    }

    private func sourceGridTitle(for mode: ScanMode, level: EikenLevel?) -> String {
        if mode == .eiken, let level {
            return "英検\(level.displayName)の取り込み方法"
        }
        return "\(mode.displayName)の取り込み方法"
    }
}
