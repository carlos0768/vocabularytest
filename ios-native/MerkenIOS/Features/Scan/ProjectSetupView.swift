import SwiftUI
import PhotosUI

/// Pre-scan setup: project name + optional thumbnail
struct ProjectSetupView: View {
    let images: [SelectedScanImage]
    @Binding var projectTitle: String
    @Binding var thumbnailImage: UIImage?
    let onBack: () -> Void
    let onStart: () -> Void

    @FocusState private var titleFocused: Bool
    @State private var showingPhotoPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                // Header
                Text("単語帳の設定")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.top, 20)
                    .padding(.bottom, 16)

                ScrollView {
                    VStack(spacing: 24) {
                        // Thumbnail picker
                        thumbnailSection

                        // Project name field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("単語帳の名前")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(MerkenTheme.secondaryText)

                            TextField("例: 英検2級 第3章", text: $projectTitle)
                                .font(.system(size: 16))
                                .foregroundStyle(MerkenTheme.primaryText)
                                .focused($titleFocused)
                                .solidTextField()
                        }
                        .padding(.horizontal, 16)

                        // Image count info
                        if images.count > 0 {
                            HStack(spacing: 6) {
                                Image(systemName: "doc.text.image")
                                    .font(.system(size: 13))
                                    .foregroundStyle(MerkenTheme.mutedText)
                                Text("\(images.count)枚の画像を解析します")
                                    .font(.system(size: 13))
                                    .foregroundStyle(MerkenTheme.mutedText)
                            }
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
        .onChange(of: selectedPhotoItem) { _, newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self),
                   let uiImage = UIImage(data: data) {
                    thumbnailImage = uiImage
                }
            }
        }
    }

    // MARK: - Thumbnail Section

    private var thumbnailSection: some View {
        VStack(spacing: 10) {
            // Thumbnail preview or placeholder
            ZStack {
                if let thumb = thumbnailImage {
                    Image(uiImage: thumb)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 100, height: 100)
                        .clipShape(.rect(cornerRadius: 18))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(MerkenTheme.border, lineWidth: 1.5)
                        )
                } else {
                    // Placeholder matching web's colored square
                    RoundedRectangle(cornerRadius: 18)
                        .fill(MerkenTheme.accentBlue.opacity(0.15))
                        .frame(width: 100, height: 100)
                        .overlay(
                            Image(systemName: "photo.badge.plus")
                                .font(.system(size: 28))
                                .foregroundStyle(MerkenTheme.accentBlue.opacity(0.5))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(MerkenTheme.borderLight, style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                        )
                }
            }
            .onTapGesture { showingPhotoPicker = true }

            // Action buttons
            HStack(spacing: 12) {
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    Text(thumbnailImage == nil ? "サムネを設定" : "変更")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(MerkenTheme.accentBlue)
                }

                if thumbnailImage != nil {
                    Button {
                        thumbnailImage = nil
                        selectedPhotoItem = nil
                    } label: {
                        Text("削除")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(MerkenTheme.danger)
                    }
                }
            }

            Text("未設定の場合、カラーアイコンが表示されます")
                .font(.system(size: 11))
                .foregroundStyle(MerkenTheme.mutedText)
        }
    }
}
