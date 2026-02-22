import SwiftUI

struct ImagePreviewView: View {
    let image: UIImage
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
                        Label("撮り直す", systemImage: "camera.rotate")
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
