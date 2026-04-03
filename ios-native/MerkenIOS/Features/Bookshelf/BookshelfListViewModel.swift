import Foundation
import OSLog

@MainActor
final class SharedProjectsViewModel: ObservableObject {
    @Published private(set) var ownedProjects: [SharedProjectSummary] = []
    @Published private(set) var joinedProjects: [SharedProjectSummary] = []
    @Published private(set) var publicProjects: [SharedProjectSummary] = []
    @Published private(set) var loading = false

    var allPublicProjects: [SharedProjectSummary] {
        let ownedPublic = ownedProjects.filter { $0.project.shareScope == .publicListed }
        return ownedPublic + publicProjects
    }
    @Published private(set) var joining = false
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "SharedProjectsVM")

    func load(using state: AppState) async {
        guard state.isLoggedIn else {
            ownedProjects = []
            joinedProjects = []
            publicProjects = []
            errorMessage = nil
            loading = false
            return
        }

        loading = true
        defer { loading = false }

        do {
            let catalog = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.fetchSharedProjects(bearerToken: bearerToken)
            }
            ownedProjects = catalog.owned
            joinedProjects = catalog.joined
            publicProjects = catalog.publicProjects
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Shared projects load failed: \(error.localizedDescription)")
        }
    }

    func join(codeOrLink: String, using state: AppState) async -> SharedProjectSummary? {
        let trimmed = codeOrLink.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "共有コードまたはリンクを入力してください。"
            return nil
        }

        joining = true
        defer { joining = false }

        do {
            let summary = try await state.performWebAPIRequest { bearerToken in
                try await state.webAPIClient.joinSharedProject(
                    codeOrLink: trimmed,
                    bearerToken: bearerToken
                )
            }
            await load(using: state)
            state.bumpDataVersion()
            return summary
        } catch {
            if error.isCancellationError {
                return nil
            }
            errorMessage = error.localizedDescription
            logger.error("Shared project join failed: \(error.localizedDescription)")
            return nil
        }
    }
}
