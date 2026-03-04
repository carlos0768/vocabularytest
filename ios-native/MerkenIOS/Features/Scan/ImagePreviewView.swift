import SwiftUI

struct ImagePreviewView: View {
    let image: UIImage
    var retakeButtonTitle: String = "撮り直す"
    @Binding var projectTitle: String
    @Binding var useThumbnail: Bool
    let onRetake: () -> Void
    let onUseImage: () -> Void

    @FocusState private var titleFocused: Bool

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                Text("撮影した画像")
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.top, 20)
                    .padding(.bottom, 12)

                ScrollView {
                    VStack(spacing: 16) {
                        // Image preview
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .padding(.horizontal, 16)

                        // Project settings card
                        VStack(alignment: .leading, spacing: 12) {
                            // Project name
                            VStack(alignment: .leading, spacing: 6) {
                                Text("単語帳の名前")
                                    .font(.system(size: 13, weight: .medium, design: .serif))
                                    .foregroundStyle(MerkenTheme.secondaryText)
                                TextField("例: 英検2級 第3章", text: $projectTitle)
                                    .font(.system(size: 15, design: .serif))
                                    .foregroundStyle(MerkenTheme.primaryText)
                                    .focused($titleFocused)
                                    .solidTextField()
                            }

                            // Thumbnail toggle
                            HStack(spacing: 12) {
                                // Mini preview of what thumbnail would look like
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 44, height: 44)
                                    .clipShape(.rect(cornerRadius: 10))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(MerkenTheme.borderLight, lineWidth: 1)
                                    )
                                    .opacity(useThumbnail ? 1 : 0.4)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("この画像をサムネイルに使う")
                                        .font(.system(size: 13, weight: .medium, design: .serif))
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    Text("単語帳の表紙として表示されます")
                                        .font(.system(size: 11, design: .serif))
                                        .foregroundStyle(MerkenTheme.mutedText)
                                }

                                Spacer()

                                Toggle("", isOn: $useThumbnail)
                                    .tint(MerkenTheme.accentBlue)
                                    .labelsHidden()
                            }
                            .padding(12)
                            .background(MerkenTheme.surfaceAlt, in: .rect(cornerRadius: 12))
                        }
                        .padding(.horizontal, 16)
                    }
                }

                // Bottom actions
                HStack(spacing: 16) {
                    Button {
                        onRetake()
                    } label: {
                        Label(retakeButtonTitle, systemImage: "camera.rotate")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GhostGlassButton())

                    Button {
                        onUseImage()
                    } label: {
                        Label("この画像を使う", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryGlassButton())
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
                .padding(.top, 12)
            }
        }
        .onTapGesture {
            titleFocused = false
        }
    }
}

struct MultiImagePreviewView: View {
    let images: [SelectedScanImage]
    @Binding var projectTitle: String
    @Binding var useThumbnail: Bool
    let onDelete: (UUID) -> Void
    let onMove: (IndexSet, Int) -> Void
    let onRepick: () -> Void
    let onUseImages: () -> Void

    @State private var editMode: EditMode = .active
    @FocusState private var titleFocused: Bool

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                List {
                    // Project settings section
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("単語帳の名前")
                                .font(.system(size: 13, weight: .medium, design: .serif))
                                .foregroundStyle(MerkenTheme.secondaryText)
                            TextField("例: 英検2級 第3章", text: $projectTitle)
                                .font(.system(size: 15, design: .serif))
                                .focused($titleFocused)
                        }
                        .padding(.vertical, 4)

                        if let firstImage = images.first {
                            HStack(spacing: 12) {
                                Image(uiImage: firstImage.image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 40, height: 40)
                                    .clipShape(.rect(cornerRadius: 8))
                                    .opacity(useThumbnail ? 1 : 0.4)

                                Text("1枚目をサムネイルに使う")
                                    .font(.system(size: 13, design: .serif))
                                    .foregroundStyle(MerkenTheme.primaryText)

                                Spacer()

                                Toggle("", isOn: $useThumbnail)
                                    .tint(MerkenTheme.accentBlue)
                                    .labelsHidden()
                            }
                        }
                    }
                    .listRowBackground(MerkenTheme.surface)

                    // Image list section
                    Section {
                        ForEach(Array(images.enumerated()), id: \.element.id) { index, item in
                            HStack(spacing: 12) {
                                Image(uiImage: item.image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 72, height: 72)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("ページ \(index + 1)")
                                        .font(.headline)
                                        .foregroundStyle(MerkenTheme.primaryText)
                                    Text("解析順: \(index + 1) 番目")
                                        .font(.caption)
                                        .foregroundStyle(MerkenTheme.secondaryText)
                                }

                                Spacer()

                                Button(role: .destructive) {
                                    onDelete(item.id)
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.headline)
                                        .foregroundStyle(MerkenTheme.danger)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.vertical, 4)
                        }
                        .onMove(perform: onMove)
                    }
                    .listRowBackground(MerkenTheme.surface)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.editMode, $editMode)

                bottomActions
            }
        }
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("解析前に画像を確認")
                        .font(.headline)
                        .foregroundStyle(MerkenTheme.primaryText)
                    Text("\(images.count)/\(ScanCoordinatorViewModel.maxPhotoSelection) 枚")
                        .font(.caption)
                        .foregroundStyle(MerkenTheme.secondaryText)
                }

                Spacer()

                Button(editMode == .active ? "並び替え終了" : "並び替え") {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        editMode = (editMode == .active) ? .inactive : .active
                    }
                }
                .font(.caption.bold())
                .foregroundStyle(MerkenTheme.accentBlue)
            }

            Text("順番変更・削除後に「この順番で解析」を押してください。")
                .font(.caption)
                .foregroundStyle(MerkenTheme.mutedText)
        }
    }

    private var bottomActions: some View {
        VStack(spacing: 10) {
            HStack(spacing: 16) {
                Button {
                    onRepick()
                } label: {
                    Label("選び直し", systemImage: "photo.on.rectangle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(GhostGlassButton())

                Button {
                    onUseImages()
                } label: {
                    Label("この順番で解析", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryGlassButton())
                .disabled(images.isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(MerkenTheme.surface)
    }
}
