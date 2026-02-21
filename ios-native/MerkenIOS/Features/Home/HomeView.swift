import SwiftUI

/// Wrapper to distinguish quiz navigation from project detail navigation
private struct QuizDestination: Hashable {
    let project: Project
}

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel = HomeViewModel()

    @State private var quizDestination: QuizDestination?
    @State private var detailProject: Project?

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header

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
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("今日の学習")
                                    .font(.headline)
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                HStack {
                                    statItem(title: "総単語数", value: "\(viewModel.totalWordCount)")
                                    Spacer()
                                    statItem(title: "復習対象", value: "\(viewModel.dueWordCount)")
                                }
                            }
                        }

                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("クイックスタート")
                                    .font(.headline)
                                Text("最近の単語帳から4択クイズを開始できます。")
                                    .font(.subheadline)
                                    .foregroundStyle(MerkenTheme.secondaryText)

                                if let firstProject = viewModel.projects.first {
                                    Button {
                                        quizDestination = QuizDestination(project: firstProject)
                                    } label: {
                                        Text("\(firstProject.title) でクイズ")
                                    }
                                    .buttonStyle(PrimaryGlassButton())
                                } else {
                                    Text("まず単語帳を作成してください。")
                                        .font(.subheadline)
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }
                            }
                        }

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
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await viewModel.load(using: appState)
            }
        }
        .navigationTitle("Dashboard")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $quizDestination) { dest in
            QuizView(project: dest.project)
        }
        .navigationDestination(item: $detailProject) { project in
            ProjectDetailView(project: project)
        }
        .task(id: "\(appState.repositoryMode)-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var header: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("MERKEN")
                    .font(.title3.bold())
                    .foregroundStyle(MerkenTheme.secondaryText)
                Text("ようこそ。語彙を広げる準備はできていますか？")
                    .font(.title2.bold())
                    .foregroundStyle(MerkenTheme.primaryText)
            }
        }
    }

    private func statItem(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(MerkenTheme.primaryText)
        }
    }
}
