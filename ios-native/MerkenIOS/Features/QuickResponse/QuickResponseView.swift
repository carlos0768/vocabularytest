import SwiftUI
import UIKit

struct QuickResponseView: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = QuickResponseViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var isPressing = false

    init(project: Project, preloadedWords: [Word]? = nil) {
        self.project = project
        self.preloadedWords = preloadedWords
    }

    var body: some View {
        ZStack {
            AppBackground()

            switch viewModel.stage {
            case .loading:
                loadingView
            case .unsupported:
                unsupportedView
            case .playing:
                playingView
            case .completed:
                completedView
            }
        }
        .navigationBarBackButtonHidden(true)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: project.id) {
            await viewModel.load(
                projectId: project.id,
                preloadedWords: preloadedWords,
                using: appState
            )
        }
        .onDisappear {
            viewModel.cleanup()
        }
        .onChange(of: viewModel.phase) { _, newPhase in
            if newPhase == .answered || newPhase == .ready {
                isPressing = false
            }
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(MerkenTheme.accentBlue)
                .scaleEffect(1.2)
            Text("音声認識を準備中...")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Unsupported

    private var unsupportedView: some View {
        VStack(spacing: 0) {
            HStack {
                closeButton
                Spacer()
            }
            .padding(16)

            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "mic.slash.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(MerkenTheme.warning)
                    .frame(width: 80, height: 80)
                    .background(MerkenTheme.warningLight, in: .circle)

                Text("音声認識を利用できません")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)

                Text("設定アプリで音声認識とマイクの\nアクセスを許可してください。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .multilineTextAlignment(.center)

                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("設定を開く")
                }
                .buttonStyle(PrimaryGlassButton())
                .padding(.horizontal, 40)
                .padding(.top, 8)

                Button {
                    dismiss()
                } label: {
                    Text("戻る")
                }
                .buttonStyle(GhostGlassButton())
            }
            .padding(24)

            Spacer()
        }
    }

    // MARK: - Playing

    private var playingView: some View {
        VStack(spacing: 0) {
            // Header: close + progress + counter
            HStack(spacing: 12) {
                closeButton

                ProgressView(value: viewModel.progress)
                    .tint(MerkenTheme.accentBlue)
                    .background(MerkenTheme.borderLight, in: .capsule)

                Text("\(viewModel.currentIndex + 1)/\(viewModel.words.count)")
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)

            // Timer bar (listening only)
            if viewModel.phase == .listening {
                timerBar
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
            }

            Spacer()

            // Main content
            if let word = viewModel.currentWord {
                if viewModel.phase == .ready {
                    readyContent
                } else {
                    VStack(spacing: 32) {
                        Text(word.japanese)
                            .font(.system(size: 36, weight: .heavy))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)

                        if viewModel.phase == .listening {
                            listeningContent
                        } else {
                            answeredContent(word: word)
                        }
                    }
                }
            }

            Spacer()

            // Bottom buttons
            if viewModel.phase == .ready || viewModel.phase == .listening {
                holdButton
                    .padding(.bottom, 16)
            } else if viewModel.phase == .answered {
                Button {
                    viewModel.moveToNext(using: appState)
                } label: {
                    HStack(spacing: 4) {
                        Text("次へ")
                            .font(.headline)
                        Image(systemName: "chevron.right")
                            .font(.headline)
                    }
                }
                .buttonStyle(PrimaryGlassButton())
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
    }

    private var timerBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(MerkenTheme.borderLight)

                RoundedRectangle(cornerRadius: 3)
                    .fill(timerColor)
                    .frame(width: geo.size.width * timerFraction)
                    .animation(.linear(duration: 0.05), value: viewModel.timeLeft)
            }
        }
        .frame(height: 6)
    }

    private var timerFraction: Double {
        max(0, viewModel.timeLeft / QuickResponseViewModel.timerDuration)
    }

    private var timerColor: Color {
        if viewModel.timeLeft <= 0.5 {
            return MerkenTheme.danger
        } else if viewModel.timeLeft <= 1.0 {
            return MerkenTheme.warning
        } else {
            return MerkenTheme.accentBlue
        }
    }

    private var readyContent: some View {
        VStack(spacing: 16) {
            Text("準備ができたら\nボタンを押してください")
                .font(.title3)
                .foregroundStyle(MerkenTheme.mutedText)
                .multilineTextAlignment(.center)
        }
    }

    private var holdButton: some View {
        Image(systemName: "mic.fill")
            .font(.system(size: 28))
            .foregroundStyle(.white)
            .frame(width: 72, height: 72)
            .background(isPressing ? MerkenTheme.accentBlue.opacity(0.7) : MerkenTheme.accentBlue, in: .circle)
            .shadow(color: MerkenTheme.accentBlue.opacity(isPressing ? 0.2 : 0.4), radius: isPressing ? 6 : 12, y: isPressing ? 2 : 4)
            .scaleEffect(isPressing ? 0.9 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isPressing)
            .overlay(
                PressGestureView(
                    onPress: {
                        isPressing = true
                        viewModel.beginListening()
                    },
                    onRelease: {
                        isPressing = false
                        viewModel.onRelease()
                    }
                )
                .frame(width: 72, height: 72)
                .clipShape(.circle)
            )
    }

    private var listeningContent: some View {
        VStack(spacing: 16) {
            // Pulsing mic icon
            Image(systemName: "mic.fill")
                .font(.system(size: 36))
                .foregroundStyle(.white)
                .frame(width: 80, height: 80)
                .background(MerkenTheme.accentBlue, in: .circle)
                .shadow(color: MerkenTheme.accentBlue.opacity(0.4), radius: 12)
                .symbolEffect(.pulse)

            // Recognized text or placeholder
            if viewModel.recognizedText.isEmpty {
                Text("英語で答えてください...")
                    .font(.body)
                    .foregroundStyle(MerkenTheme.mutedText)
            } else {
                Text(viewModel.recognizedText)
                    .font(.title3.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
            }
        }
    }

    private func answeredContent(word: Word) -> some View {
        VStack(spacing: 16) {
            if viewModel.isCorrect {
                // Correct
                Image(systemName: "checkmark")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 80, height: 80)
                    .background(MerkenTheme.success, in: .circle)

                Text("正解!")
                    .font(.title2.bold())
                    .foregroundStyle(MerkenTheme.success)

                Text(word.english)
                    .font(.title.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
            } else {
                // Wrong or timed out
                Image(systemName: viewModel.isTimedOut ? "timer" : "xmark")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 80, height: 80)
                    .background(MerkenTheme.danger, in: .circle)

                Text(viewModel.isTimedOut ? "時間切れ!" : "不正解")
                    .font(.title2.bold())
                    .foregroundStyle(MerkenTheme.danger)

                if !viewModel.recognizedText.isEmpty && !viewModel.isTimedOut {
                    Text(viewModel.recognizedText)
                        .font(.body)
                        .foregroundStyle(MerkenTheme.mutedText)
                        .strikethrough()
                }

                // Correct answer card
                VStack(spacing: 4) {
                    Text("正解")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.mutedText)
                    Text(word.english)
                        .font(.title.bold())
                        .foregroundStyle(MerkenTheme.primaryText)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(MerkenTheme.surface, in: .rect(cornerRadius: 20))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(MerkenTheme.borderLight, lineWidth: 1.5)
                )
            }
        }
    }

    // MARK: - Completed

    private var completedView: some View {
        let percentage = viewModel.totalCount > 0
            ? Int(round(Double(viewModel.correctCount) / Double(viewModel.totalCount) * 100))
            : 0

        return VStack(spacing: 0) {
            HStack {
                closeButton
                Spacer()
            }
            .padding(16)

            Spacer()

            SolidCard {
                VStack(spacing: 20) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(MerkenTheme.success)
                        .frame(width: 80, height: 80)
                        .background(MerkenTheme.successLight, in: .circle)

                    Text("即答チャレンジ完了!")
                        .font(.title2.bold())
                        .foregroundStyle(MerkenTheme.primaryText)

                    VStack(spacing: 4) {
                        Text("\(percentage)%")
                            .font(.system(size: 48, weight: .bold))
                            .foregroundStyle(MerkenTheme.accentBlue)

                        Text("\(viewModel.totalCount)問中 \(viewModel.correctCount)問正解")
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)

                        if viewModel.timeoutCount > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "timer")
                                    .font(.caption2)
                                Text("時間切れ \(viewModel.timeoutCount)回")
                                    .font(.caption)
                            }
                            .foregroundStyle(MerkenTheme.danger)
                            .padding(.top, 2)
                        }
                    }

                    Text(completionMessage(percentage: percentage))
                        .font(.body)
                        .foregroundStyle(MerkenTheme.primaryText)
                        .multilineTextAlignment(.center)

                    VStack(spacing: 10) {
                        Button {
                            Task {
                                await viewModel.restart(projectId: project.id, using: appState)
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.headline)
                                Text("もう一度")
                                    .font(.headline)
                            }
                        }
                        .buttonStyle(PrimaryGlassButton())

                        Button {
                            dismiss()
                        } label: {
                            Text("単語一覧に戻る")
                        }
                        .buttonStyle(GhostGlassButton())
                    }
                }
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 16)

            Spacer()
        }
    }

    private func completionMessage(percentage: Int) -> String {
        if percentage == 100 {
            return "パーフェクト! 素晴らしい!"
        } else if percentage >= 80 {
            return "よくできました!"
        } else if percentage >= 60 {
            return "もう少し! 復習しましょう"
        } else {
            return "繰り返し練習しましょう!"
        }
    }

    // MARK: - Shared components

    private var closeButton: some View {
        Button {
            dismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.title3)
                .foregroundStyle(MerkenTheme.secondaryText)
                .frame(width: 40, height: 40)
        }
    }
}

// MARK: - UIKit press gesture bridge

private struct PressGestureView: UIViewRepresentable {
    let onPress: () -> Void
    let onRelease: () -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let recognizer = UILongPressGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleGesture(_:))
        )
        recognizer.minimumPressDuration = 0
        recognizer.cancelsTouchesInView = false
        view.addGestureRecognizer(recognizer)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onPress = onPress
        context.coordinator.onRelease = onRelease
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onPress: onPress, onRelease: onRelease)
    }

    final class Coordinator: NSObject {
        var onPress: () -> Void
        var onRelease: () -> Void
        private var didFire = false

        init(onPress: @escaping () -> Void, onRelease: @escaping () -> Void) {
            self.onPress = onPress
            self.onRelease = onRelease
        }

        @objc func handleGesture(_ gesture: UILongPressGestureRecognizer) {
            switch gesture.state {
            case .began:
                didFire = true
                DispatchQueue.main.async { self.onPress() }
            case .ended, .cancelled, .failed:
                guard didFire else { return }
                didFire = false
                DispatchQueue.main.async { self.onRelease() }
            default:
                break
            }
        }
    }
}
