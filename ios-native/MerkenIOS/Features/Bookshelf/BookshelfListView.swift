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

                    sharedHeader
                        .padding(.top, -28)

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

            if viewModel.loading && viewModel.allSharedProjects.isEmpty {
                ProgressView()
                    .controlSize(.small)
            } else {
                Text("\(viewModel.allSharedProjects.count)件")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    private var sharedHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            SolidPageHeader(
                kicker: "COMMUNITY",
                title: "共有単語帳",
                subtitle: "みんなが作った単語帳をインポートして、自分の学習に取り込めます。"
            )

            HStack(spacing: 8) {
                SolidChip(title: "すべて", count: viewModel.allSharedProjects.count, isSelected: true) {}
                SolidChip(title: "参加中", count: viewModel.joinedProjects.count, isSelected: false) {}
                SolidChip(title: "公開中", count: viewModel.publicProjectCount, isSelected: false) {}
            }
        }
    }

    private func sharedFilterChip(title: String, count: Int, selected: Bool) -> some View {
        HStack(spacing: 6) {
            Text(title)
            Text("\(count)")
        }
        .font(.system(size: 12, weight: .black))
        .foregroundStyle(selected ? MerkenTheme.inverseText : MerkenTheme.solidInk)
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .background(selected ? MerkenTheme.inverseSurface : MerkenTheme.surface, in: Capsule())
        .overlay(
            Capsule()
                .stroke(selected ? MerkenTheme.solidBorder : MerkenTheme.border, lineWidth: 1.2)
        )
    }

    @ViewBuilder
    private var publicProjectContent: some View {
        if viewModel.loading && viewModel.allSharedProjects.isEmpty {
            SolidCard(bordered: false) {
                HStack(spacing: 10) {
                    ProgressView()
                        .progressViewStyle(.circular)
                    Text("読み込み中...")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        } else if viewModel.allSharedProjects.isEmpty {
            SolidCard(bordered: false) {
                Text("表示できる共有単語帳はまだありません。")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        } else {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.allSharedProjects) { item in
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

    private var badgeTitle: String {
        switch item.accessRole {
        case .owner:
            return item.project.shareScope == .publicListed ? "公開中" : "共有中"
        case .editor:
            return "共同編集"
        case .viewer:
            return "共有中"
        }
    }

    private var badgeColor: Color {
        switch item.accessRole {
        case .owner:
            return item.project.shareScope == .publicListed ? MerkenTheme.success : MerkenTheme.chartBlue
        case .editor:
            return MerkenTheme.chartBlue
        case .viewer:
            return MerkenTheme.solidInk.opacity(0.22)
        }
    }

    private var ownerLabel: String {
        switch item.accessRole {
        case .owner:
            return "自分"
        case .editor, .viewer:
            guard let ownerUsername = item.ownerUsername?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !ownerUsername.isEmpty else {
                return "共有ユーザー"
            }
            return "@\(ownerUsername)"
        }
    }

    var body: some View {
        HStack(spacing: 13) {
            thumbnail
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(MerkenTheme.solidInk, lineWidth: MerkenSolid.borderWidth)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(item.project.title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(MerkenTheme.solidInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(item.wordCount)")
                        .font(.system(size: 18, weight: .heavy))
                        .monospacedDigit()
                        .foregroundStyle(MerkenTheme.solidInk)
                    Text("語")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(MerkenTheme.mutedText)
                }

                HStack(spacing: 10) {
                    sharedProjectMetric(color: badgeColor, text: badgeTitle)
                    sharedProjectMetric(color: MerkenTheme.solidInk.opacity(0.22), text: "メンバー \(item.collaboratorCount)")
                    sharedProjectMetric(color: MerkenTheme.chartBlue.opacity(0.65), text: ownerLabel)
                }
                .padding(.top, 1)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(13)
        .solidSurface(
            tone: .surface,
            depth: .small,
            cornerRadius: 14,
            borderColor: MerkenTheme.solidInk,
            shadowOffset: CGSize(width: 2.5, height: 2.5)
        )
    }

    private func sharedProjectMetric(color: Color, text: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)

            Text(text)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(MerkenTheme.mutedText)
                .lineLimit(1)
                .truncationMode(.tail)
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
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
    }
}
