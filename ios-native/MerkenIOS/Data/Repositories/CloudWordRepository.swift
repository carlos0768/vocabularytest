import Foundation

final class CloudWordRepository: WordRepositoryProtocol {
    private let restClient: SupabaseRESTClient
    private let accessTokenProvider: @Sendable () async throws -> String

    init(
        restClient: SupabaseRESTClient,
        accessTokenProvider: @escaping @Sendable () async throws -> String
    ) {
        self.restClient = restClient
        self.accessTokenProvider = accessTokenProvider
    }

    func fetchProjects(userId: String) async throws -> [Project] {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "select", value: "id,user_id,title,icon_image,created_at,share_id,is_favorite"),
            URLQueryItem(name: "order", value: "created_at.desc")
        ]

        do {
            let rows: [ProjectDTO] = try await restClient.get(
                path: "/rest/v1/projects",
                query: query,
                bearerToken: token
            )
            return rows.map(SupabaseMapper.project(from:))
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func createProject(title: String, userId: String) async throws -> Project {
        let token = try await accessTokenProvider()
        let payload = [ProjectInsertDTO(userId: userId, title: title, iconImage: nil, isFavorite: false)]

        do {
            let rows: [ProjectDTO] = try await restClient.post(
                path: "/rest/v1/projects",
                body: payload,
                bearerToken: token,
                preferReturnRepresentation: true
            )

            guard let created = rows.first else { throw RepositoryError.invalidResponse }
            return SupabaseMapper.project(from: created)
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func updateProject(id: String, title: String) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        struct ProjectPatch: Encodable {
            let title: String
        }

        do {
            let _: [ProjectDTO] = try await restClient.patch(
                path: "/rest/v1/projects",
                body: ProjectPatch(title: title),
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

    func deleteProject(id: String) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        do {
            let _: [ProjectDTO] = try await restClient.delete(
                path: "/rest/v1/projects",
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

    func fetchWords(projectId: String) async throws -> [Word] {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "project_id", value: "eq.\(projectId)"),
            URLQueryItem(name: "select", value: "id,project_id,english,japanese,distractors,example_sentence,example_sentence_ja,pronunciation,status,created_at,last_reviewed_at,next_review_at,ease_factor,interval_days,repetition,is_favorite"),
            URLQueryItem(name: "order", value: "created_at.asc")
        ]

        do {
            let rows: [WordDTO] = try await restClient.get(
                path: "/rest/v1/words",
                query: query,
                bearerToken: token
            )
            return rows.map(SupabaseMapper.word(from:))
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func fetchAllWords(userId: String) async throws -> [Word] {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "select", value: "id,project_id,english,japanese,distractors,example_sentence,example_sentence_ja,pronunciation,status,created_at,last_reviewed_at,next_review_at,ease_factor,interval_days,repetition,is_favorite,projects!inner(user_id)"),
            URLQueryItem(name: "projects.user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "3000")
        ]

        do {
            let rows: [WordDTO] = try await restClient.get(
                path: "/rest/v1/words",
                query: query,
                bearerToken: token
            )
            return rows.map(SupabaseMapper.word(from:))
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func createWords(_ inputs: [WordInput]) async throws -> [Word] {
        guard !inputs.isEmpty else { return [] }

        let token = try await accessTokenProvider()
        let payload = inputs.map(SupabaseMapper.wordInsert(from:))

        do {
            let rows: [WordDTO] = try await restClient.post(
                path: "/rest/v1/words",
                body: payload,
                bearerToken: token,
                preferReturnRepresentation: true
            )
            return rows.map(SupabaseMapper.word(from:))
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func updateWord(id: String, patch: WordPatch) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let payload = SupabaseMapper.wordUpdate(from: patch)

        do {
            let _: [WordDTO] = try await restClient.patch(
                path: "/rest/v1/words",
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

    func deleteWord(id: String) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        do {
            let _: [WordDTO] = try await restClient.delete(
                path: "/rest/v1/words",
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
