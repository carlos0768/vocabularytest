import Foundation
import OSLog

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var projects: [Project] = []
    @Published private(set) var totalWordCount: Int = 0
    @Published private(set) var dueWordCount: Int = 0
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private let logger = Logger(subsystem: "MerkenIOS", category: "HomeVM")
    private var wordCountTask: Task<Void, Never>?

    func load(using state: AppState) async {
        wordCountTask?.cancel()
        loading = true

        do {
            let repository = state.activeRepository
            let projects = try await repository.fetchProjects(userId: state.activeUserId)
            self.projects = projects
            errorMessage = nil
            loading = false

            // Fetch counts — update once at the end to minimize re-renders
            wordCountTask = Task { [weak self] in
                var total = 0
                var due = 0

                for project in projects {
                    guard !Task.isCancelled else { return }
                    do {
                        let words = try await repository.fetchWords(projectId: project.id)
                        total += words.count
                        due += words.filter { word in
                            if word.status != .mastered { return true }
                            guard let nextReviewAt = word.nextReviewAt else { return false }
                            return nextReviewAt <= .now
                        }.count
                    } catch {
                        // skip failed project
                    }
                }

                guard !Task.isCancelled else { return }
                // Single update at the end — only one re-render
                self?.totalWordCount = total
                self?.dueWordCount = due
            }
        } catch {
            loading = false
            if error.isCancellationError {
                errorMessage = nil
                return
            }
            errorMessage = error.localizedDescription
            logger.error("Home load failed: \(error.localizedDescription)")
        }
    }
}
