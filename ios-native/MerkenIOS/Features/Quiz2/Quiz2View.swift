import SwiftUI
import AVFoundation
import UIKit

struct Quiz2View: View {
    let project: Project
    let preloadedWords: [Word]?

    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = Quiz2ViewModel()
    @Environment(\.dismiss) private var dismiss

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
            if let preloadedWords, !preloadedWords.isEmpty {
                viewModel.setSourceWords(preloadedWords)
            } else {
                await viewModel.load(projectId: project.id, using: appState)
            }
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(MerkenTheme.accentBlue)
                .scaleEffect(1.2)
            Text("自己評価を準備中...")
                .font(.subheadline)
                .foregroundStyle(MerkenTheme.mutedText)
        }
    }

    // MARK: - Playing

    private var playingView: some View {
        VStack(spacing: 0) {
            // Header: close + progress counter + badge
            HStack(spacing: 12) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.title3)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()

                HStack(spacing: 4) {
                    Text("\(viewModel.currentIndex + 1)")
                        .font(.subheadline.bold())
                        .foregroundStyle(MerkenTheme.accentBlue)
                    Text("/")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                    Text("\(viewModel.words.count)")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(MerkenTheme.surface, in: .capsule)
                .overlay(Capsule().stroke(MerkenTheme.borderLight, lineWidth: 1))

                Spacer()

                Image(systemName: "brain.head.profile")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.accentBlue)
                    .frame(width: 36, height: 36)
                    .background(MerkenTheme.accentBlueLight, in: .circle)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)

            // Card
            ScrollView {
                VStack(spacing: 16) {
                    if let word = viewModel.currentWord {
                        questionCard(word: word)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 24)
            }

            // Bottom buttons
            bottomActions
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
        }
    }

    private func questionCard(word: Word) -> some View {
        SolidCard {
            VStack(spacing: 0) {
                // Question label
                Text("問題")
                    .font(.caption.bold())
                    .foregroundStyle(MerkenTheme.mutedText)
                    .textCase(.uppercase)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)

                // English word
                Text(word.english)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)

                // Answer (revealed)
                if viewModel.showAnswer {
                    Divider()
                        .padding(.vertical, 12)

                    Text("答え")
                        .font(.caption.bold())
                        .foregroundStyle(MerkenTheme.mutedText)
                        .textCase(.uppercase)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 4)

                    Text(word.japanese)
                        .font(.title2.bold())
                        .foregroundStyle(MerkenTheme.accentBlue)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)

                    // Example sentence
                    if let example = word.exampleSentence, !example.isEmpty {
                        Divider()
                            .padding(.vertical, 8)

                        Text("例文")
                            .font(.caption.bold())
                            .foregroundStyle(MerkenTheme.mutedText)
                            .textCase(.uppercase)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.bottom, 4)

                        Text(example)
                            .font(.subheadline)
                            .foregroundStyle(MerkenTheme.secondaryText)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        if let exampleJa = word.exampleSentenceJa, !exampleJa.isEmpty {
                            Text(exampleJa)
                                .font(.caption)
                                .foregroundStyle(MerkenTheme.mutedText)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 2)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var bottomActions: some View {
        if !viewModel.showAnswer {
            Button {
                viewModel.revealAnswer()
            } label: {
                Text("答えを見る")
            }
            .buttonStyle(PrimaryGlassButton())
        } else {
            VStack(spacing: 8) {
                Text("評価を選ぶと次の問題へ進みます")
                    .font(.caption)
                    .foregroundStyle(MerkenTheme.mutedText)

                let columns = [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)
                ]
                LazyVGrid(columns: columns, spacing: 8) {
                    gradeButton(.again, color: MerkenTheme.danger, lightColor: MerkenTheme.dangerLight)
                    gradeButton(.hard, color: MerkenTheme.warning, lightColor: MerkenTheme.warningLight)
                    gradeButton(.good, color: MerkenTheme.accentBlue, lightColor: MerkenTheme.accentBlueLight)
                    gradeButton(.easy, color: MerkenTheme.success, lightColor: MerkenTheme.successLight)
                }
            }
        }
    }

    private func gradeButton(_ grade: Quiz2ViewModel.Quiz2Grade, color: Color, lightColor: Color) -> some View {
        let isSelected = viewModel.selectedGrade == grade
        return Button {
            viewModel.submitGrade(grade, using: appState)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(grade.label)
                    .font(.subheadline.bold())
                    .foregroundStyle(color)
                Text(grade.helper)
                    .font(.caption2)
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(
                isSelected ? lightColor : MerkenTheme.surface,
                in: .rect(cornerRadius: 16)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? color : MerkenTheme.border, lineWidth: 2)
            )
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(MerkenTheme.border)
                    .offset(y: 3)
            )
        }
        .disabled(viewModel.isSubmittingGrade)
    }

    // MARK: - Completed

    private var completedView: some View {
        VStack(spacing: 16) {
            SolidCard {
                VStack(spacing: 8) {
                    Text("完了！")
                        .font(.title2.bold())
                        .foregroundStyle(MerkenTheme.primaryText)

                    Text("\(viewModel.totalCount)語を1周しました")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)

                    // 2x2 grade counts grid
                    let columns = [
                        GridItem(.flexible(), spacing: 8),
                        GridItem(.flexible(), spacing: 8)
                    ]
                    LazyVGrid(columns: columns, spacing: 8) {
                        gradeCountCell("Again", count: viewModel.gradeCounts[.again] ?? 0, color: MerkenTheme.danger, bgColor: MerkenTheme.dangerLight)
                        gradeCountCell("Hard", count: viewModel.gradeCounts[.hard] ?? 0, color: MerkenTheme.warning, bgColor: MerkenTheme.warningLight)
                        gradeCountCell("Good", count: viewModel.gradeCounts[.good] ?? 0, color: MerkenTheme.accentBlue, bgColor: MerkenTheme.accentBlueLight)
                        gradeCountCell("Easy", count: viewModel.gradeCounts[.easy] ?? 0, color: MerkenTheme.success, bgColor: MerkenTheme.successLight)
                    }
                    .padding(.top, 8)
                }
            }

            Button {
                Task {
                    await viewModel.restart(projectId: project.id, using: appState)
                }
            } label: {
                Text("もう一度")
            }
            .buttonStyle(PrimaryGlassButton())

            Button {
                dismiss()
            } label: {
                Text("戻る")
            }
            .buttonStyle(GhostGlassButton())
        }
        .padding(16)
        .onAppear {
            if viewModel.isPerfectScore {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }

    private func gradeCountCell(_ label: String, count: Int, color: Color, bgColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
            Text("\(count)")
                .font(.title2.bold())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(bgColor, in: .rect(cornerRadius: 12))
    }
}
