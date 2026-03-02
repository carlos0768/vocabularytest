import Foundation
import OSLog

@MainActor
final class ProjectListViewModel: ObservableObject {
    @Published private(set) var projects: [Project] = []
    @Published private(set) var wordCounts: [String: Int] = [:]
    @Published private(set) var masteredCounts: [String: Int] = [:]
    @Published var errorMessage: String?
    @Published private(set) var loading = false

    private let logger = Logger(subsystem: "MerkenIOS", category: "ProjectListVM")

    func load(using state: AppState) async {
        loading = true
        defer { loading = false }

        do {
            projects = try await state.activeRepository.fetchProjects(userId: state.activeUserId)

            // Fetch all words to compute per-project counts
            let allWords = try await state.activeRepository.fetchAllWords(userId: state.activeUserId)
            var counts: [String: Int] = [:]
            var mastered: [String: Int] = [:]
            for word in allWords {
                counts[word.projectId, default: 0] += 1
                if word.status == .mastered {
                    mastered[word.projectId, default: 0] += 1
                }
            }
            wordCounts = counts
            masteredCounts = mastered

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

    func toggleFavorite(projectId: String, using state: AppState) async {
        guard let index = projects.firstIndex(where: { $0.id == projectId }) else { return }
        let newValue = !projects[index].isFavorite

        do {
            try await state.activeRepository.updateProjectFavorite(id: projectId, isFavorite: newValue)
            projects[index] = Project(
                id: projects[index].id,
                userId: projects[index].userId,
                title: projects[index].title,
                iconImage: projects[index].iconImage,
                createdAt: projects[index].createdAt,
                shareId: projects[index].shareId,
                isFavorite: newValue
            )
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Toggle favorite failed: \(error.localizedDescription)")
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

    func renameProject(id: String, title: String, using state: AppState) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        do {
            try await state.activeRepository.updateProject(id: id, title: trimmedTitle)
            if let index = projects.firstIndex(where: { $0.id == id }) {
                projects[index].title = trimmedTitle
            }
            state.bumpDataVersion()
            errorMessage = nil
        } catch {
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Project rename failed: \(error.localizedDescription)")
        }
    }
}
