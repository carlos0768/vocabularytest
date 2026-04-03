import Photos
import SwiftUI
import UIKit

private struct ShareMetric: Identifiable {
    let id: String
    let label: String
    let count: Int
    let icon: String
    let tint: Color
}

private struct ShareActivityPayload: Identifiable {
    let id = UUID()
    let items: [Any]
}

struct ProjectShareSheet: View {
    let project: Project
    let projectTitle: String
    let words: [Word]
    let shareURL: URL
    let onUpdateShareScope: (_ shareScope: ProjectShareScope) async throws -> Void
    let onDismiss: () -> Void

    @State private var activityPayload: ShareActivityPayload?
    @State private var feedbackMessage: String?
    @State private var isOpeningInstagram = false
    @State private var selectedShareScope: ProjectShareScope
    @State private var isUpdatingShareScope = false

    init(
        project: Project,
        projectTitle: String,
        words: [Word],
        shareURL: URL,
        onUpdateShareScope: @escaping (_ shareScope: ProjectShareScope) async throws -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.project = project
        self.projectTitle = projectTitle
        self.words = words
        self.shareURL = shareURL
        self.onUpdateShareScope = onUpdateShareScope
        self.onDismiss = onDismiss
        _selectedShareScope = State(initialValue: project.shareScope)
    }

    private var shareCode: String {
        shareURL.lastPathComponent
    }

    private var formattedShareCode: String {
        stride(from: 0, to: shareCode.count, by: 4).map { offset in
            let start = shareCode.index(shareCode.startIndex, offsetBy: offset)
            let end = shareCode.index(start, offsetBy: min(4, shareCode.distance(from: start, to: shareCode.endIndex)), limitedBy: shareCode.endIndex) ?? shareCode.endIndex
            return String(shareCode[start..<end])
        }
        .joined(separator: "-")
    }

    private var shareMessage: String {
        """
        \(selectedShareScope == .publicListed ? "Merken の「共有」タブにある公開単語帳からそのまま見られます。" : "Merken の「共有」タブで招待コードを入力して参加してください。")
        単語帳: \(projectTitle)

        招待コード: \(formattedShareCode)
        リンク: \(shareURL.absoluteString)
        """
    }

    private var shareScopeSummary: String {
        switch selectedShareScope {
        case .publicListed:
            return "公開単語帳として共有ページに表示されます"
        case .inviteOnly:
            return "非公開のまま招待コードで参加できます"
        }
    }

    private var shareScopeDescription: String {
        switch selectedShareScope {
        case .publicListed:
            return "共有タブの公開単語帳一覧からそのまま見つけられます。リンク入力は不要です。"
        case .inviteOnly:
            return "非公開の単語帳です。フルリンクではなく招待コードだけで参加できます。"
        }
    }

    private var metrics: [ShareMetric] {
        let normalizedCounts = Dictionary(grouping: words) { word in
            normalizedPartOfSpeechKey(from: word.partOfSpeechTags)
        }
        .mapValues(\.count)

        let sorted = normalizedCounts
            .map { key, count in
                ShareMetric(
                    id: key,
                    label: label(for: key),
                    count: count,
                    icon: icon(for: key),
                    tint: tint(for: key)
                )
            }
            .sorted {
                if $0.count != $1.count {
                    return $0.count > $1.count
                }
                return sortOrder(for: $0.id) < sortOrder(for: $1.id)
            }

        if sorted.isEmpty {
            return [
                ShareMetric(
                    id: "other",
                    label: "その他",
                    count: words.count,
                    icon: "square.grid.2x2.fill",
                    tint: MerkenTheme.mutedText
                )
            ]
        }

        return Array(sorted.prefix(4))
    }

    private var renderedImage: UIImage? {
        let renderer = ImageRenderer(content: shareCard.padding(20).background(Color.white))
        renderer.scale = UIScreen.main.scale
        return renderer.uiImage
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                HStack {
                    Button {
                        onDismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(MerkenTheme.primaryText)
                            .frame(width: 44, height: 44)
                            .background(MerkenTheme.surfaceAlt, in: Circle())
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Text("共有")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)

                    Spacer()

                    Color.clear.frame(width: 44, height: 44)
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 18)

                Divider()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        shareCard
                        accessSettingsCard

                        HStack(spacing: 14) {
                            shareActionButton(title: "Instagram", action: shareToInstagram, icon: {
                                InstagramBrandIcon()
                            })

                            shareActionButton(
                                title: "保存",
                                systemImage: "square.and.arrow.down"
                            ) {
                                saveRenderedImage()
                            }

                            shareActionButton(
                                title: "共有",
                                systemImage: "ellipsis"
                            ) {
                                openSystemShare()
                            }

                            shareActionButton(
                                title: "リンク",
                                systemImage: "link"
                            ) {
                                copyShareLink()
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .padding(.bottom, 24)
                }
            }
        }
        .sheet(item: $activityPayload) { payload in
            ShareSheet(items: payload.items)
        }
        .overlay(alignment: .bottom) {
            if let feedbackMessage {
                Text(feedbackMessage)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.black.opacity(0.84), in: Capsule())
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: feedbackMessage)
        .onChange(of: project.shareScope) { _, newValue in
            if !isUpdatingShareScope {
                selectedShareScope = newValue
            }
        }
    }

    private var shareCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "text.book.closed.fill")
                    .font(.system(size: 13, weight: .bold))
                Text("Merken")
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundStyle(MerkenTheme.primaryText)

            Text(projectTitle)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(MerkenTheme.primaryText)
                .lineLimit(2)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    sharePill(
                        text: selectedShareScope == .publicListed ? "公開" : "非公開",
                        tint: selectedShareScope == .publicListed ? MerkenTheme.success : MerkenTheme.secondaryText,
                        background: selectedShareScope == .publicListed ? MerkenTheme.success.opacity(0.12) : MerkenTheme.surfaceAlt
                    )
                    sharePill(
                        text: formattedShareCode,
                        tint: MerkenTheme.primaryText,
                        background: MerkenTheme.surfaceAlt
                    )
                }

                Text(shareScopeDescription)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                ForEach(metrics) { metric in
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .stroke(MerkenTheme.borderLight, lineWidth: 4)

                            Circle()
                                .trim(from: 0, to: metricProgress(for: metric))
                                .stroke(metric.tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                                .rotationEffect(.degrees(-90))

                            Image(systemName: metric.icon)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(metric.tint)
                        }
                        .frame(width: 48, height: 48)

                        VStack(spacing: 3) {
                            Text("\(metric.count)")
                                .font(.system(size: 18, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(MerkenTheme.primaryText)
                            Text(metric.label)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(MerkenTheme.secondaryText)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(MerkenTheme.border, lineWidth: 1)
                    )
                }
            }
        }
        .padding(18)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(MerkenTheme.border, lineWidth: 1)
        )
    }

    private var accessSettingsCard: some View {
        SolidCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("公開設定")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)

                Text("公開単語帳は共有ページの一覧からそのまま見られます。非公開の単語帳は招待コードだけで参加できます。")
                    .font(.system(size: 14))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 10) {
                    shareScopeOption(
                        scope: .publicListed,
                        title: "公開",
                        subtitle: "共有ページに一覧表示",
                        accent: MerkenTheme.success
                    )
                    shareScopeOption(
                        scope: .inviteOnly,
                        title: "非公開",
                        subtitle: "招待コードで参加",
                        accent: MerkenTheme.accentBlue
                    )
                }

                if isUpdatingShareScope {
                    HStack(spacing: 10) {
                        ProgressView()
                            .progressViewStyle(.circular)
                        Text("公開設定を更新中...")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.secondaryText)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("招待コード")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(MerkenTheme.secondaryText)
                        Spacer()
                        Button("コピー") {
                            copyInviteCode()
                        }
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(MerkenTheme.primaryText)
                    }

                    Text(formattedShareCode)
                        .font(.system(size: 22, weight: .bold, design: .monospaced))
                        .foregroundStyle(MerkenTheme.primaryText)

                    Text(shareScopeSummary)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(MerkenTheme.border, lineWidth: 1)
                )
            }
        }
    }

    private func shareScopeOption(
        scope: ProjectShareScope,
        title: String,
        subtitle: String,
        accent: Color
    ) -> some View {
        let isSelected = selectedShareScope == scope

        return Button {
            Task {
                await updateShareScope(scope)
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(title)
                        .font(.system(size: 15, weight: .bold))
                    Spacer(minLength: 0)
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 16, weight: .semibold))
                }

                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(isSelected ? accent : MerkenTheme.primaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                (isSelected ? accent.opacity(0.12) : MerkenTheme.surface),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isSelected ? accent.opacity(0.45) : MerkenTheme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isUpdatingShareScope)
        .opacity(isUpdatingShareScope && !isSelected ? 0.6 : 1)
    }

    private func shareActionButton(
        title: String,
        systemImage: String,
        accent: Color = MerkenTheme.primaryText,
        action: @escaping () -> Void
    ) -> some View {
        shareActionButton(title: title, action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(accent)
        }
    }

    private func shareActionButton<Icon: View>(
        title: String,
        action: @escaping () -> Void,
        @ViewBuilder icon: () -> Icon
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 10) {
                icon()
                    .frame(width: 54, height: 54)
                    .background(MerkenTheme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(MerkenTheme.border, lineWidth: 1)
                    )

                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(MerkenTheme.primaryText)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func metricProgress(for metric: ShareMetric) -> Double {
        guard let maximum = metrics.map(\.count).max(), maximum > 0 else { return 0 }
        return Double(metric.count) / Double(maximum)
    }

    private func openSystemShare() {
        guard let renderedImage else { return }
        activityPayload = ShareActivityPayload(items: [renderedImage, shareMessage])
    }

    private func copyInviteCode() {
        UIPasteboard.general.string = formattedShareCode
        feedbackMessage = "招待コードをコピーしました"
        hideFeedbackLater()
    }

    private func shareToInstagram() {
        guard !isOpeningInstagram else { return }
        guard let renderedImage else {
            feedbackMessage = "共有画像の準備に失敗しました"
            hideFeedbackLater()
            return
        }

        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        guard
            let storiesURL = URL(string: "instagram-stories://share?source_application=\(bundleIdentifier)"),
            UIApplication.shared.canOpenURL(storiesURL),
            let imageData = renderedImage.pngData()
        else {
            openSystemShare()
            return
        }

        isOpeningInstagram = true
        UIPasteboard.general.setItems(
            [[
                "com.instagram.sharedSticker.stickerImage": imageData,
                "com.instagram.sharedSticker.backgroundTopColor": "#FFFFFF",
                "com.instagram.sharedSticker.backgroundBottomColor": "#FFFFFF"
            ]],
            options: [
                UIPasteboard.OptionsKey.expirationDate: Date().addingTimeInterval(300)
            ]
        )

        UIApplication.shared.open(storiesURL, options: [:]) { success in
            Task { @MainActor in
                isOpeningInstagram = false
                if success {
                    feedbackMessage = "Instagramを開きました"
                } else {
                    self.openSystemShare()
                }
                hideFeedbackLater()
            }
        }
    }

    private func saveRenderedImage() {
        guard let renderedImage else { return }

        let authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch authorizationStatus {
        case .authorized, .limited:
            UIImageWriteToSavedPhotosAlbum(renderedImage, nil, nil, nil)
            feedbackMessage = "画像を保存しました"
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                DispatchQueue.main.async {
                    if status == .authorized || status == .limited {
                        UIImageWriteToSavedPhotosAlbum(renderedImage, nil, nil, nil)
                        feedbackMessage = "画像を保存しました"
                    } else {
                        feedbackMessage = "写真への保存が許可されていません"
                    }
                }
            }
        default:
            feedbackMessage = "写真への保存が許可されていません"
        }

        hideFeedbackLater()
    }

    private func copyShareLink() {
        UIPasteboard.general.string = shareURL.absoluteString
        feedbackMessage = "リンクをコピーしました"
        hideFeedbackLater()
    }

    private func updateShareScope(_ shareScope: ProjectShareScope) async {
        guard selectedShareScope != shareScope else { return }

        let previousScope = selectedShareScope
        selectedShareScope = shareScope
        isUpdatingShareScope = true

        do {
            try await onUpdateShareScope(shareScope)
            feedbackMessage = shareScope == .publicListed
                ? "共有ページに公開しました"
                : "招待コード専用に変更しました"
        } catch {
            selectedShareScope = previousScope
            feedbackMessage = error.localizedDescription
        }

        isUpdatingShareScope = false
        hideFeedbackLater()
    }

    private func sharePill(text: String, tint: Color, background: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(background, in: Capsule())
    }

    private func hideFeedbackLater() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            feedbackMessage = nil
        }
    }

    private func normalizedPartOfSpeechKey(from tags: [String]?) -> String {
        for tag in tags ?? [] {
            let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            switch trimmed.lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: " ", with: "_") {
            case "noun", "n", "名詞":
                return "noun"
            case "verb", "v", "動詞":
                return "verb"
            case "adjective", "adj", "形容詞":
                return "adjective"
            case "adverb", "adv", "副詞":
                return "adverb"
            case "idiom", "熟語", "イディオム", "phrase", "フレーズ", "idiomatic_expression":
                return "idiom"
            case "phrasal_verb", "句動詞":
                return "phrasal_verb"
            case "preposition", "前置詞":
                return "preposition"
            case "conjunction", "接続詞":
                return "conjunction"
            default:
                return "other"
            }
        }
        return "other"
    }

    private func label(for key: String) -> String {
        switch key {
        case "noun": return "名詞"
        case "verb": return "動詞"
        case "adjective": return "形容詞"
        case "adverb": return "副詞"
        case "idiom": return "イディオム"
        case "phrasal_verb": return "句動詞"
        case "preposition": return "前置詞"
        case "conjunction": return "接続詞"
        default: return "その他"
        }
    }

    private func icon(for key: String) -> String {
        switch key {
        case "noun": return "tag.fill"
        case "verb": return "bolt.fill"
        case "adjective": return "sparkles"
        case "adverb": return "waveform.path.ecg"
        case "idiom": return "quote.opening"
        case "phrasal_verb": return "arrow.triangle.branch"
        case "preposition": return "point.topleft.down.curvedto.point.bottomright.up"
        case "conjunction": return "link"
        default: return "square.grid.2x2.fill"
        }
    }

    private func tint(for key: String) -> Color {
        switch key {
        case "noun": return MerkenTheme.accentBlue
        case "verb": return MerkenTheme.danger
        case "adjective": return MerkenTheme.warning
        case "adverb": return MerkenTheme.chartBlue
        case "idiom": return MerkenTheme.success
        case "phrasal_verb": return .purple
        case "preposition": return .teal
        case "conjunction": return .indigo
        default: return MerkenTheme.mutedText
        }
    }

    private func sortOrder(for key: String) -> Int {
        switch key {
        case "noun": return 0
        case "verb": return 1
        case "adjective": return 2
        case "idiom": return 3
        case "adverb": return 4
        case "phrasal_verb": return 5
        case "preposition": return 6
        case "conjunction": return 7
        default: return 99
        }
    }
}

private struct InstagramBrandIcon: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.99, green: 0.78, blue: 0.18),
                            Color(red: 0.96, green: 0.33, blue: 0.26),
                            Color(red: 0.84, green: 0.18, blue: 0.48),
                            Color(red: 0.38, green: 0.20, blue: 0.91)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(Color.white, lineWidth: 2.4)
                .frame(width: 24, height: 24)

            Circle()
                .stroke(Color.white, lineWidth: 2.4)
                .frame(width: 10, height: 10)

            Circle()
                .fill(Color.white)
                .frame(width: 3.8, height: 3.8)
                .offset(x: 8, y: -8)
        }
    }
}
