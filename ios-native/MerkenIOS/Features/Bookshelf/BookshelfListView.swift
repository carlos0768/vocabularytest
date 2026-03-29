import SwiftUI
import UIKit

private enum SharedProjectListSection: String, CaseIterable, Identifiable {
    case publicCatalog
    case ownedProjects
    case joinedProjects

    var id: Self { self }

    var pickerLabel: String {
        switch self {
        case .publicCatalog:
            return "公開"
        case .ownedProjects:
            return "共有中"
        case .joinedProjects:
            return "参加中"
        }
    }

    var title: String {
        switch self {
        case .publicCatalog:
            return "公開単語帳"
        case .ownedProjects:
            return "自分が共有中"
        case .joinedProjects:
            return "参加中"
        }
    }

    var subtitle: String {
        switch self {
        case .publicCatalog:
            return "公開設定された単語帳をこのページからそのまま開けます。"
        case .ownedProjects:
            return "自分が公開した単語帳や、招待コードで共有している単語帳です。"
        case .joinedProjects:
            return "招待コードや共有リンクから参加した単語帳です。"
        }
    }

    var emptyMessage: String {
        switch self {
        case .publicCatalog:
            return "まだ公開中の単語帳はありません。"
        case .ownedProjects:
            return "まだ共有中の単語帳はありません。"
        case .joinedProjects:
            return "招待コードやリンクで参加するとここに表示されます。"
        }
    }
}

struct SharedProjectListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var viewModel = SharedProjectsViewModel()

    @State private var inviteText = ""
    @State private var selectedProject: SharedProjectSummary?
    @State private var scrollOffset: CGFloat = 0
    @State private var selectedSection: SharedProjectListSection = .publicCatalog
    @State private var showingInviteComposer = false

    private var currentItems: [SharedProjectSummary] {
        switch selectedSection {
        case .publicCatalog:
            return viewModel.publicProjects
        case .ownedProjects:
            return viewModel.ownedProjects
        case .joinedProjects:
            return viewModel.joinedProjects
        }
    }

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

                    sectionTabs

                    if let errorMessage = viewModel.errorMessage, !errorMessage.isEmpty {
                        SolidCard {
                            Text(errorMessage)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(MerkenTheme.warning)
                        }
                    }

                    sectionContext

                    if selectedSection == .joinedProjects {
                        inviteSection
                    }

                    projectContent
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

    private var inviteSection: some View {
        SharedInviteComposerCard(
            inviteText: $inviteText,
            joining: viewModel.joining,
            isExpanded: showingInviteComposer,
            onToggle: toggleInviteComposer,
            onPaste: pasteInviteCode,
            onJoin: joinSharedProject
        )
    }

    private var sectionTabs: some View {
        HStack(spacing: 0) {
            ForEach(SharedProjectListSection.allCases) { section in
                Button {
                    withAnimation(.easeOut(duration: 0.18)) {
                        selectedSection = section
                    }
                } label: {
                    VStack(spacing: 10) {
                        Text(section.pickerLabel)
                            .font(.system(size: 19, weight: selectedSection == section ? .black : .bold))
                            .foregroundStyle(
                                selectedSection == section
                                    ? MerkenTheme.primaryText
                                    : MerkenTheme.mutedText
                            )
                            .frame(maxWidth: .infinity)

                        Capsule()
                            .fill(
                                selectedSection == section
                                    ? MerkenTheme.accentBlue
                                    : Color.clear
                            )
                            .frame(height: 4)
                            .padding(.horizontal, 18)
                    }
                    .padding(.top, 6)
                }
                .buttonStyle(.plain)
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(MerkenTheme.borderLight)
                .frame(height: 1)
        }
    }

    private var sectionContext: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(selectedSection.subtitle)
                .font(.system(size: 13))
                .foregroundStyle(MerkenTheme.secondaryText)

            Spacer(minLength: 12)

            if viewModel.loading && currentItems.isEmpty {
                ProgressView()
                    .controlSize(.small)
            } else {
                Text("\(currentItems.count)件")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(MerkenTheme.mutedText)
            }
        }
    }

    @ViewBuilder
    private var projectContent: some View {
        if viewModel.loading && currentItems.isEmpty {
            SolidCard {
                HStack(spacing: 10) {
                    ProgressView()
                        .progressViewStyle(.circular)
                    Text("読み込み中...")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                }
            }
        } else if currentItems.isEmpty {
            SolidCard {
                Text(selectedSection.emptyMessage)
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
            }
        } else {
            LazyVStack(spacing: 12) {
                ForEach(currentItems) { item in
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

    private func toggleInviteComposer() {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            showingInviteComposer.toggle()
        }
    }

    private func pasteInviteCode() {
        inviteText = UIPasteboard.general.string ?? inviteText

        if !inviteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                showingInviteComposer = true
            }
        }
    }

    private func joinSharedProject() {
        Task {
            if let summary = await viewModel.join(codeOrLink: inviteText, using: appState) {
                inviteText = ""
                switch summary.accessRole {
                case .owner:
                    selectedSection = .ownedProjects
                case .editor:
                    selectedSection = .joinedProjects
                case .viewer:
                    selectedSection = .publicCatalog
                }

                withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                    showingInviteComposer = false
                }

                selectedProject = summary
            }
        }
    }
}

private struct SharedInviteComposerCard: View {
    @Binding var inviteText: String
    let joining: Bool
    let isExpanded: Bool
    let onToggle: () -> Void
    let onPaste: () -> Void
    let onJoin: () -> Void

    var body: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: isExpanded ? 14 : 0) {
                Button(action: onToggle) {
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(MerkenTheme.surfaceAlt)
                                .frame(width: 48, height: 48)

                            Image(systemName: "person.crop.circle.badge.plus")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(MerkenTheme.accentBlue)
                        }

                        VStack(alignment: .leading, spacing: 3) {
                            Text("非公開の単語帳に参加")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)

                            Text("必要なときだけ開いて、招待コードだけで参加できます。")
                                .font(.system(size: 13))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 12)

                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.mutedText)
                    }
                }
                .buttonStyle(.plain)

                if isExpanded {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            TextField("例: abcd-1234-ef56", text: $inviteText)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .textFieldStyle(.plain)
                                .solidTextField()

                            Button("貼り付け", action: onPaste)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(
                                    MerkenTheme.surfaceAlt,
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                                )
                                .buttonStyle(.plain)
                        }

                        Text("リンク末尾のコードだけでも参加できます。")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(MerkenTheme.mutedText)

                        Button(action: onJoin) {
                            HStack(spacing: 8) {
                                if joining {
                                    ProgressView()
                                        .progressViewStyle(.circular)
                                        .tint(.white)
                                } else {
                                    Image(systemName: "arrow.right.circle.fill")
                                        .font(.system(size: 15, weight: .semibold))
                                }

                                Text(joining ? "参加中..." : "コードで参加")
                            }
                        }
                        .buttonStyle(PrimaryGlassButton())
                        .disabled(joining)
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
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
        SolidCard(padding: 0) {
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

                    Text(summaryText)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .lineLimit(2)

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
