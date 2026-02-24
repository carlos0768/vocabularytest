import Foundation
import OSLog

@MainActor
final class BookshelfDetailViewModel: ObservableObject {
    @Published private(set) var collection: Collection?
    @Published private(set) var collectionProjects: [CollectionProject] = []
    @Published private(set) var projects: [Project] = []
    @Published private(set) var allWords: [Word] = []
    @Published private(set) var loading = false
    @Published var errorMessage: String?
    @Published var searchText = ""

    private let logger = Logger(subsystem: "MerkenIOS", category: "BookshelfDetailVM")

    var masteredCount: Int { allWords.filter { $0.status == .mastered }.count }
    var reviewCount: Int { allWords.filter { $0.status == .review }.count }
    var newCount: Int { allWords.filter { $0.status == .new }.count }

    var filteredWords: [Word] {
        guard !searchText.isEmpty else { return allWords }
        let query = searchText.lowercased()
        return allWords.filter {
            $0.english.lowercased().contains(query) ||
            $0.japanese.contains(query)
        }
    }

    func load(collectionId: String, using state: AppState) async {
        loading = true
        errorMessage = nil

        do {
            let collections = try await state.collectionRepository.fetchCollections(userId: state.activeUserId)
            collection = collections.first { $0.id == collectionId }

            let cps = try await state.collectionRepository.fetchCollectionProjects(collectionId: collectionId)
            collectionProjects = cps

            let projectIds = Set(cps.map(\.projectId))
            let allProjects = try await state.activeRepository.fetchProjects(userId: state.activeUserId)
            projects = allProjects.filter { projectIds.contains($0.id) }

            var words: [Word] = []
            await withTaskGroup(of: [Word].self) { group in
                for project in projects {
                    group.addTask {
                        (try? await state.activeRepository.fetchWords(projectId: project.id)) ?? []
                    }
                }
                for await projectWords in group {
                    words.append(contentsOf: projectWords)
                }
            }
            allWords = words
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfDetail load failed: \(error.localizedDescription)")
        }

        loading = false
    }

    func removeProject(collectionId: String, projectId: String, using state: AppState) async {
        do {
            try await state.collectionRepository.removeProject(collectionId: collectionId, projectId: projectId)
            collectionProjects.removeAll { $0.projectId == projectId }
            let removedWords = allWords.filter { $0.projectId == projectId }
            allWords.removeAll { $0.projectId == projectId }
            projects.removeAll { $0.id == projectId }
            _ = removedWords // suppress unused warning
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfDetail removeProject failed: \(error.localizedDescription)")
        }
    }

    func addProjects(collectionId: String, projectIds: [String], using state: AppState) async {
        do {
            try await state.collectionRepository.addProjects(collectionId: collectionId, projectIds: projectIds)
            await load(collectionId: collectionId, using: state)
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfDetail addProjects failed: \(error.localizedDescription)")
        }
    }

    func updateCollection(id: String, name: String, description: String?, using state: AppState) async {
        do {
            try await state.collectionRepository.updateCollection(id: id, name: name, description: description)
            collection?.name = name
            collection?.description = description
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfDetail updateCollection failed: \(error.localizedDescription)")
        }
    }

    func deleteCollection(id: String, using state: AppState) async {
        do {
            try await state.collectionRepository.deleteCollection(id: id)
            state.bumpDataVersion()
        } catch {
            if error.isCancellationError { return }
            errorMessage = error.localizedDescription
            logger.error("BookshelfDetail deleteCollection failed: \(error.localizedDescription)")
        }
    }
}
