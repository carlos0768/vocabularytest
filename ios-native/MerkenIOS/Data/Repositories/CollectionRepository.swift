import Foundation

protocol CollectionRepositoryProtocol: Sendable {
    func fetchCollections(userId: String) async throws -> [Collection]
    func createCollection(userId: String, name: String, description: String?) async throws -> Collection
    func updateCollection(id: String, name: String, description: String?) async throws
    func deleteCollection(id: String) async throws
    func fetchCollectionProjects(collectionId: String) async throws -> [CollectionProject]
    func addProjects(collectionId: String, projectIds: [String]) async throws
    func removeProject(collectionId: String, projectId: String) async throws
}

final class CloudCollectionRepository: CollectionRepositoryProtocol {
    private let restClient: SupabaseRESTClient
    private let accessTokenProvider: @Sendable () async throws -> String

    init(
        restClient: SupabaseRESTClient,
        accessTokenProvider: @escaping @Sendable () async throws -> String
    ) {
        self.restClient = restClient
        self.accessTokenProvider = accessTokenProvider
    }

    func fetchCollections(userId: String) async throws -> [Collection] {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "select", value: "id,user_id,name,description,created_at,updated_at"),
            URLQueryItem(name: "order", value: "updated_at.desc")
        ]

        do {
            let rows: [CollectionDTO] = try await restClient.get(
                path: "/rest/v1/collections",
                query: query,
                bearerToken: token
            )
            return rows.map(SupabaseMapper.collection(from:))
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func createCollection(userId: String, name: String, description: String?) async throws -> Collection {
        let token = try await accessTokenProvider()
        let payload = [CollectionInsertDTO(userId: userId, name: name, description: description)]

        do {
            let rows: [CollectionDTO] = try await restClient.post(
                path: "/rest/v1/collections",
                body: payload,
                bearerToken: token,
                preferReturnRepresentation: true
            )
            guard let created = rows.first else { throw RepositoryError.invalidResponse }
            return SupabaseMapper.collection(from: created)
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func updateCollection(id: String, name: String, description: String?) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let payload = CollectionUpdateDTO(name: name, description: description)

        do {
            let _: [CollectionDTO] = try await restClient.patch(
                path: "/rest/v1/collections",
                body: payload,
                query: query,
                bearerToken: token,
                preferReturnRepresentation: true
            )
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func deleteCollection(id: String) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        do {
            let _: [CollectionDTO] = try await restClient.delete(
                path: "/rest/v1/collections",
                query: query,
                bearerToken: token,
                preferReturnRepresentation: true
            )
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func fetchCollectionProjects(collectionId: String) async throws -> [CollectionProject] {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "collection_id", value: "eq.\(collectionId)"),
            URLQueryItem(name: "select", value: "collection_id,project_id,sort_order,added_at"),
            URLQueryItem(name: "order", value: "sort_order.asc")
        ]

        do {
            let rows: [CollectionProjectDTO] = try await restClient.get(
                path: "/rest/v1/collection_projects",
                query: query,
                bearerToken: token
            )
            return rows.map(SupabaseMapper.collectionProject(from:))
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func addProjects(collectionId: String, projectIds: [String]) async throws {
        guard !projectIds.isEmpty else { return }

        let token = try await accessTokenProvider()
        let payload = projectIds.enumerated().map { index, projectId in
            CollectionProjectInsertDTO(
                collectionId: collectionId,
                projectId: projectId,
                sortOrder: index
            )
        }

        do {
            let _: [CollectionProjectDTO] = try await restClient.post(
                path: "/rest/v1/collection_projects",
                body: payload,
                bearerToken: token,
                preferReturnRepresentation: true
            )
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func removeProject(collectionId: String, projectId: String) async throws {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "collection_id", value: "eq.\(collectionId)"),
            URLQueryItem(name: "project_id", value: "eq.\(projectId)")
        ]

        do {
            let _: [CollectionProjectDTO] = try await restClient.delete(
                path: "/rest/v1/collection_projects",
                query: query,
                bearerToken: token,
                preferReturnRepresentation: true
            )
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }
}
