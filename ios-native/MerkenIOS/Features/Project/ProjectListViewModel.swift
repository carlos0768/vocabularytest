import Foundation
import OSLog

@MainActor
final class ProjectListViewModel: ObservableObject {
    @Published private(set) var projects: [Project] = []
    @Published var errorMessage: String?
    @Published private(set) var loading = false

    private let logger = Logger(subsystem: "MerkenIOS", category: "ProjectListVM")

    func load(using state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            projects = try await state.activeRepository.fetchProjects(userId: state.activeUserId)
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project list load failed: \(error.localizedDescription)")
        }
    }

    func createProject(title: String, using state: AppState) async {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        do {
            let created = try await state.activeRepository.createProject(title: title, userId: state.activeUserId, iconImage: nil)
            projects.insert(created, at: 0)
            projects.sort { $0.createdAt > $1.createdAt }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project create failed: \(error.localizedDescription)")
        }
    }

    func deleteProject(id: String, using state: AppState) async {
        do {
            try await state.activeRepository.deleteProject(id: id)
            projects.removeAll { $0.id == id }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project delete failed: \(error.localizedDescription)")
        }
    }
}
