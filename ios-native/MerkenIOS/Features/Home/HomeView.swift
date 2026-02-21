import SwiftUI

/// Wrapper to distinguish quiz navigation from project detail navigation
private struct QuizDestination: Hashable {
    let project: Project
}

private struct FlashcardDestination: Hashable {
    let project: Project
}

private struct SentenceQuizDestination: Hashable {
    let project: Project
}

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = HomeViewModel()

    @State private var quizDestination: QuizDestination?
    @State private var flashcardDestination: FlashcardDestination?
    @State private var sentenceQuizDestination: SentenceQuizDestination?
    @State private var detailProject: Project?

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                GlassEffectContainer(spacing: 12) {
                VStack(alignment: .leading, spacing: 16) {
                    heroSection

                    if let errorMessage = viewModel.errorMessage {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("データの取得に失敗しました", systemImage: "exclamationmark.triangle.fill")
                                    .foregroundStyle(MerkenTheme.warning)
                                    .font(.headline)
                                Text(errorMessage)
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)

                                Button("再試行") {
                                    Task {
                                        await viewModel.load(using: appState)
                                    }
                                }
                                .buttonStyle(PrimaryGlassButton())
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        if !viewModel.projects.isEmpty {
                            Text("最近の単語帳")
                                .font(.headline)
                                .foregroundStyle(MerkenTheme.secondaryText)

                            ForEach(viewModel.projects.prefix(5)) { project in
                                GlassPane {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(project.title)
                                                .font(.headline)
                                                .foregroundStyle(MerkenTheme.primaryText)
                                            Text("作成日: \(Formatters.shortDate.string(from: project.createdAt))")
                                                .font(.caption)
                                                .foregroundStyle(MerkenTheme.mutedText)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundStyle(MerkenTheme.secondaryText)
                                    }
                                }
                                .contentShape(.rect)
                                .onTapGesture {
                                    detailProject = project
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
                } // GlassEffectContainer
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(using: appState)
            }
        }
        .navigationTitle("Dashboard")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    SearchView()
                } label: {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(MerkenTheme.accentBlue)
                }
            }
        }
        .navigationDestination(item: $quizDestination) { dest in
            QuizView(project: dest.project)
        }
        .navigationDestination(item: $flashcardDestination) { dest in
            FlashcardView(project: dest.project)
        }
        .navigationDestination(item: $sentenceQuizDestination) { dest in
            SentenceQuizView(project: dest.project)
        }
        .navigationDestination(item: $detailProject) { project in
            ProjectDetailView(project: project)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    // MARK: - Hero Section

    private var heroSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 14) {
                // Tier A: Streak + motivation
                HStack(spacing: 12) {
                    Image(systemName: "flame.fill")
                        .font(.title2)
                        .foregroundStyle(.orange)
                        .frame(width: 44, height: 44)
                        .background(.white.opacity(0.15), in: .circle)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(heroHeading)
                            .font(.title3.bold())
                            .foregroundStyle(.white)
                        Text(heroSubheading)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }

                // Tier B: Compact stats (only when there's activity today)
                if viewModel.todayAnswered > 0 {
                    HStack(spacing: 8) {
                        statPill(icon: "checkmark.circle", text: "\(viewModel.accuracyPercent)% 正答率")
                        statPill(icon: "graduationcap", text: "\(viewModel.totalWordCount) 語")
                        if viewModel.dueWordCount > 0 {
                            statPill(icon: "clock", text: "\(viewModel.dueWordCount) 復習待ち")
                        }
                    }
                }

                // Tier C: Primary CTA
                if let firstProject = viewModel.projects.first {
                    if viewModel.dueWordCount > 0 {
                        Button {
                            quizDestination = QuizDestination(project: firstProject)
                        } label: {
                            Label("復習を始める (\(viewModel.dueWordCount)問)", systemImage: "arrow.trianglehead.2.clockwise")
                        }
                        .buttonStyle(PrimaryGlassButton())
                    } else {
                        Button {
                            quizDestination = QuizDestination(project: firstProject)
                        } label: {
                            Label("クイズに挑戦", systemImage: "play.fill")
                        }
                        .buttonStyle(PrimaryGlassButton())
                    }

                    HStack(spacing: 8) {
                        Button {
                            flashcardDestination = FlashcardDestination(project: firstProject)
                        } label: {
                            Label("カード", systemImage: "rectangle.on.rectangle.angled")
                                .font(.subheadline)
                        }
                        .buttonStyle(GhostGlassButton())

                        if appState.isPro {
                            Button {
                                sentenceQuizDestination = SentenceQuizDestination(project: firstProject)
                            } label: {
                                Label("例文", systemImage: "text.bubble")
                                    .font(.subheadline)
                            }
                            .buttonStyle(GhostGlassButton())
                        }
                    }
                } else {
                    Text("まず単語帳を作成してください。")
                        .font(.subheadline)
                        .foregroundStyle(MerkenTheme.mutedText)
                }
            }
        }
    }

    private var heroHeading: String {
        if viewModel.streakDays > 0 {
            return "\(viewModel.streakDays)日連続学習中"
        } else if viewModel.todayAnswered > 0 {
            return "今日も頑張っています"
        } else {
            return "今日の学習を始めよう"
        }
    }

    private var heroSubheading: String {
        if viewModel.todayAnswered > 0 {
            return "今日 \(viewModel.todayAnswered)問回答"
        } else {
            return "クイズに挑戦して単語を覚えよう"
        }
    }

    private func statPill(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.caption2.bold())
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.white.opacity(0.15), in: .capsule)
        .foregroundStyle(.white)
    }
}
