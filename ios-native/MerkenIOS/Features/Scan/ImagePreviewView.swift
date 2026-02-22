import SwiftUI

struct ImagePreviewView: View {
    let image: UIImage
    var retakeButtonTitle: String = "撮り直す"
    let onRetake: () -> Void
    let onUseImage: () -> Void

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                Text("撮影した画像")
                    .font(.headline)
                    .foregroundStyle(MerkenTheme.primaryText)
                    .padding(.top, 20)
                    .padding(.bottom, 12)

                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .padding(.horizontal, 16)

                Spacer()

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
            }
        }
    }
}

struct MultiImagePreviewView: View {
    let images: [SelectedScanImage]
    let onDelete: (UUID) -> Void
    let onMove: (IndexSet, Int) -> Void
    let onRepick: () -> Void
    let onUseImages: () -> Void

    @State private var editMode: EditMode = .active

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 0) {
                headerSection
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                List {
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
