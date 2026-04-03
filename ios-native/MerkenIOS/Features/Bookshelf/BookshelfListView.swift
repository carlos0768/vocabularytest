import SwiftUI
import UIKit

struct SharedProjectListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = SharedProjectsViewModel()

    @State private var selectedProject: SharedProjectSummary?
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    Color.clear
                        .frame(height: 0)
                        .background(
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: TopSafeAreaScrollOffsetKey.self,
                                    value: proxy.frame(in: .named("sharedProjectScroll")).minY
                                )
                            }
                        )

                    if let errorMessage = viewModel.errorMessage, !errorMessage.isEmpty {
                        SolidCard(bordered: false) {
                            Text(errorMessage)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    listContext

                    publicProjectContent
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 120)
            }
            .coordinateSpace(name: "sharedProjectScroll")
            .scrollIndicators(.hidden)
            .disableTopScrollEdgeEffectIfAvailable()
            .refreshable {
                await viewModel.load(using: appState)
            }
        }
        .navigationTitle("共有")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $selectedProject) { summary in
            SharedProjectDetailView(summary: summary)
        }
        .cameraAreaGlassOverlay(scrollOffset: scrollOffset)
        .onPreferenceChange(TopSafeAreaScrollOffsetKey.self) { value in
            scrollOffset = value
        }
        .task(id: "\(appState.session?.userId ?? "guest")-\(appState.dataVersion)") {
            await viewModel.load(using: appState)
        }
    }

    private var listContext: some View {
        HStack(spacing: 8) {
            Text("公開単語帳")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(MerkenTheme.secondaryText)

            Spacer(minLength: 0)

            if viewModel.loading && viewModel.allPublicProjects.isEmpty {
                ProgressView()
                    .controlSize(.small)
            } else {
                Text("\(viewModel.allPublicProjects.count)件")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    @ViewBuilder
    private var publicProjectContent: some View {
        if viewModel.loading && viewModel.allPublicProjects.isEmpty {
            SolidCard(bordered: false) {
                HStack(spacing: 10) {
                    ProgressView()
                        .progressViewStyle(.circular)
                    Text("読み込み中...")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        } else if viewModel.allPublicProjects.isEmpty {
            SolidCard(bordered: false) {
                Text("まだ公開中の単語帳はありません。")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        } else {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.allPublicProjects) { item in
                    Button {
                        selectedProject = item
                    } label: {
                        SharedProjectCard(item: item, colorScheme: colorScheme)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

}

private struct SharedProjectCard: View {
    let item: SharedProjectSummary
    let colorScheme: ColorScheme

    private var badge: SharedProjectCardBadge? {
        switch item.accessRole {
        case .owner:
            if item.project.shareScope == .publicListed {
                return SharedProjectCardBadge(
                    title: "公開中",
                    foreground: MerkenTheme.success,
                    background: MerkenTheme.success.opacity(0.12)
                )
            }

            return SharedProjectCardBadge(
                title: "共有中",
                foreground: MerkenTheme.accentBlue,
                background: MerkenTheme.accentBlue.opacity(0.12)
            )
        case .editor:
            return SharedProjectCardBadge(
                title: "共同編集",
                foreground: MerkenTheme.accentBlue,
                background: MerkenTheme.accentBlue.opacity(0.12)
            )
        case .viewer:
            return nil
        }
    }

    private var summaryText: String {
        switch item.accessRole {
        case .owner:
            return item.project.shareScope == .publicListed
                ? "公開一覧に表示され、編集もできます。"
                : "招待したメンバーと共同編集できます。"
        case .editor:
            return "参加済み。内容は最新状態に追従します。"
        case .viewer:
            return "公開ページからそのまま閲覧できます。"
        }
    }

    var body: some View {
        SolidCard(padding: 0, bordered: false) {
            HStack(spacing: 12) {
                thumbnail
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 7) {
                    HStack(alignment: .top, spacing: 8) {
                        Text(item.project.title)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .lineLimit(2)

                        Spacer(minLength: 4)

                        if let badge {
                            Text(badge.title)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(badge.foreground)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(badge.background, in: Capsule())
                        }
                    }

                    if let ownerName = item.ownerUsername, !ownerName.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 10, weight: .semibold))
                            Text(ownerName)
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(MerkenTheme.accentBlue)
                    }

                    HStack(spacing: 10) {
                        SharedProjectMetricLabel(
                            icon: "text.book.closed.fill",
                            text: "\(item.wordCount)語"
                        )

                        Circle()
                            .fill(MerkenTheme.border)
                            .frame(width: 4, height: 4)

                        SharedProjectMetricLabel(
                            icon: "person.2.fill",
                            text: "\(item.collaboratorCount)人"
                        )
                    }
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
            .padding(14)
        }
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let iconImage = item.project.iconImage,
           let uiImage = ImageCompressor.decodeBase64Image(iconImage) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else {
            ZStack {
                MerkenTheme.placeholderColor(for: item.project.id, isDark: colorScheme == .dark)

                Text(String(item.project.title.prefix(1)))
                    .font(.system(size: 26, weight: .black))
                    .foregroundStyle(.white.opacity(0.92))
            }
        }
    }
}

private struct SharedProjectMetricLabel: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(text)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(MerkenTheme.secondaryText)
    }
}

private struct SharedProjectCardBadge {
    let title: String
    let foreground: Color
    let background: Color
}
