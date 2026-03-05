import SwiftUI

struct AppBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if colorScheme == .dark {
                LinearGradient(
                    colors: [
                        Color(red: 0.06, green: 0.07, blue: 0.14),
                        Color(red: 0.08, green: 0.06, blue: 0.18),
                        Color(red: 0.05, green: 0.05, blue: 0.12)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            } else {
                LinearGradient(
                    colors: [
                        Color(red: 0.98, green: 0.98, blue: 1.0),
                        Color(red: 0.93, green: 0.96, blue: 1.0),
                        Color(red: 0.96, green: 0.97, blue: 1.0)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
    }
}
