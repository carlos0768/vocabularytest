import SwiftUI

struct ScanProcessingView: View {
    @State private var dotCount = 0
    private let timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            AppBackground()

            VStack(spacing: 24) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(MerkenTheme.accentBlue)
                    .scaleEffect(1.5)

                Text("画像を解析中\(String(repeating: ".", count: dotCount))")
                    .font(.headline)
                    .foregroundStyle(.white)

                Text("AIが単語を抽出しています。\n10〜30秒ほどかかります。")
                    .font(.subheadline)
                    .foregroundStyle(MerkenTheme.secondaryText)
                    .multilineTextAlignment(.center)
            }
        }
        .onReceive(timer) { _ in
            dotCount = (dotCount + 1) % 4
        }
    }
}
