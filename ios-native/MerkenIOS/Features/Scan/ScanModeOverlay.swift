import SwiftUI

struct ScanModeOverlay: View {
    private enum Stage: Equatable {
        case modes
        case eiken
    }

    let isPro: Bool
    let onSelectMode: (ScanMode, EikenLevel?) -> Void
    let onDismiss: () -> Void

    @State private var selectedEikenLevel: EikenLevel = .grade3
    @State private var stage: Stage = .modes
    @State private var appeared = false

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
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
            MerkenHaptic.selection()
            onSelectMode(mode, nil)
        }
    }

    private func selectEikenLevel(_ level: EikenLevel) {
        selectedEikenLevel = level
        MerkenHaptic.selection()
        onSelectMode(.eiken, level)
    }

    private func goBack() {
        switch stage {
        case .modes:
            onDismiss()
        case .eiken:
            stage = .modes
        }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(appeared ? 0.42 : 0)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack {
                Spacer()
                overlayContent
                    .padding(.horizontal, 18)
                    .padding(.bottom, 156)
            }
        }
        .opacity(appeared ? 1 : 0)
        .scaleEffect(appeared ? 1 : 0.985)
        .animation(.easeOut(duration: 0.18), value: appeared)
        .animation(MerkenSpring.snappy, value: stage)
        .onAppear { appeared = true }
    }

    @ViewBuilder
    private var overlayContent: some View {
        switch stage {
        case .modes:
            modeGrid
        case .eiken:
            eikenLevelGrid
        }
    }

    private var modeGrid: some View {
        VStack(spacing: 10) {
            LazyVGrid(columns: columns, spacing: 10) {
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
        .frame(maxWidth: 560)
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
        .frame(maxWidth: 560)
    }

    private func modeCard(mode: ScanMode, locked: Bool) -> some View {
        Button {
            if locked { return }
            MerkenHaptic.selection()
            selectMode(mode)
        } label: {
            VStack(spacing: 8) {
                Image(systemName: mode.iconName)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(locked ? MerkenTheme.mutedText : iconColor(for: mode))
                    .frame(height: 28)

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
            }
            .frame(maxWidth: .infinity)
            .frame(height: 92)
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

}
