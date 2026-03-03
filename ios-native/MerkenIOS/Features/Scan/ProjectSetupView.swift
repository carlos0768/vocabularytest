import SwiftUI

/// Pre-scan setup: project name + thumbnail selection
struct ProjectSetupView: View {
    let images: [SelectedScanImage]
    @Binding var projectTitle: String
    @Binding var useThumbnail: Bool
    let onBack: () -> Void
    let onStart: () -> Void

    @FocusState private var titleFocused: Bool

    private var firstImage: UIImage? {
        images.first?.image
    }

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Header
                Text("単語帳の設定")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.top, 20)
                    .padding(.bottom, 16)

                ScrollView {
                    VStack(spacing: 20) {
                        // Thumbnail preview
                        if let img = firstImage {
                            VStack(spacing: 10) {
                                Image(uiImage: img)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 120, height: 120)
                                    .clipShape(.rect(cornerRadius: 18))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 18)
                                            .stroke(MerkenTheme.border, lineWidth: 1.5)
                                    )
                                    .opacity(useThumbnail ? 1 : 0.4)

                                if images.count > 1 {
                                    Text("\(images.count)枚の画像を解析します")
                                        .font(.system(size: 12, design: .serif))
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }
                            }
                        }

                        // Project name field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("単語帳の名前")
                                .font(.system(size: 14, weight: .medium, design: .serif))
                                .foregroundStyle(MerkenTheme.secondaryText)

                            TextField("例: 英検2級 第3章", text: $projectTitle)
                                .font(.system(size: 16, design: .serif))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .focused($titleFocused)
                                .solidTextField()
                        }
                        .padding(.horizontal, 16)

                        // Thumbnail toggle
                        if firstImage != nil {
                            HStack(spacing: 14) {
                                Image(uiImage: firstImage!)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 48, height: 48)
                                    .clipShape(.rect(cornerRadius: 10))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(MerkenTheme.borderLight, lineWidth: 1)
                                    )
                                    .opacity(useThumbnail ? 1 : 0.4)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("この画像をサムネイルに使う")
                                        .font(.system(size: 14, weight: .medium, design: .serif))
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    Text("単語帳の表紙として表示されます")
                                        .font(.system(size: 12, design: .serif))
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }

                                Spacer()

                                Toggle("", isOn: $useThumbnail)
                                    .tint(MerkenTheme.accentBlue)
                                    .labelsHidden()
                            }
                            .padding(14)
                            .background(MerkenTheme.surface, in: .rect(cornerRadius: 14))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(MerkenTheme.borderLight, lineWidth: 1)
                            )
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.top, 8)
                }

                // Bottom actions
                HStack(spacing: 16) {
                    Button {
                        onBack()
                    } label: {
                        Label("戻る", systemImage: "arrow.left")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GhostGlassButton())

                    Button {
                        onStart()
                    } label: {
                        Label("解析開始", systemImage: "sparkles")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryGlassButton())
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
                .padding(.top, 12)
            }
        }
        .onTapGesture { titleFocused = false }
    }
}
