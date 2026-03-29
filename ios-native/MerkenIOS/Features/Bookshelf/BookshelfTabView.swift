import SwiftUI

struct SharedProjectsTabView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        if !appState.isLoggedIn {
            LoginGateView(
                icon: "person.2.fill",
                title: "共有単語帳に参加しよう",
                message: "ログインすると、共有リンクから単語帳に参加して共同編集できます。"
            ) {
                appState.selectedTab = 4
            }
        } else {
            SharedProjectListView()
        }
    }
}
