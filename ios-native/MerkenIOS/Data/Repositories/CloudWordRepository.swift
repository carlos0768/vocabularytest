import Foundation

final class CloudWordRepository: WordRepositoryProtocol, ProjectShareServiceProtocol {
    private let restClient: SupabaseRESTClient
    private let accessTokenProvider: @Sendable () async throws -> String

    init(
        restClient: SupabaseRESTClient,
        accessTokenProvider: @escaping @Sendable () async throws -> String
    ) {
        self.restClient = restClient
        self.accessTokenProvider = accessTokenProvider
    }

    private func isMissingProjectSourceLabelsColumn(_ error: Error) -> Bool {
        guard case let SupabaseClientError.requestFailed(code, message) = error else {
            return false
        }

        guard code == 400 else { return false }
        let normalized = message.lowercased()
        return normalized.contains("projects.source_labels")
            || normalized.contains("column projects.source_labels does not exist")
            || normalized.contains("'source_labels' column of 'projects'")
            || normalized.contains("source_labels")
    }

    func fetchProjects(userId: String) async throws -> [Project] {
        let token = try await accessTokenProvider()
        let query = [
            URLQueryItem(name: "user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "select", value: "id,user_id,title,icon_image,created_at,share_id,is_favorite,source_labels"),
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
            if isMissingProjectSourceLabelsColumn(error) {
                let legacyQuery = [
                    URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                    URLQueryItem(name: "select", value: "id,user_id,title,icon_image,created_at,share_id,is_favorite"),
                    URLQueryItem(name: "order", value: "created_at.desc")
                ]

                do {
                    let rows: [ProjectDTO] = try await restClient.get(
                        path: "/rest/v1/projects",
                        query: legacyQuery,
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
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func createProject(title: String, userId: String, iconImage: String? = nil) async throws -> Project {
        let token = try await accessTokenProvider()
        let payload = [ProjectInsertDTO(userId: userId, title: title, iconImage: iconImage, isFavorite: false, sourceLabels: nil)]

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

    func updateProjectIcon(id: String, iconImage: String) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        struct IconPatch: Encodable {
            let iconImage: String

            enum CodingKeys: String, CodingKey {
                case iconImage = "icon_image"
            }
        }

        do {
            let _: [ProjectDTO] = try await restClient.patch(
                path: "/rest/v1/projects",
                body: IconPatch(iconImage: iconImage),
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

    func updateProjectFavorite(id: String, isFavorite: Bool) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        struct FavoritePatch: Encodable {
            let isFavorite: Bool

            enum CodingKeys: String, CodingKey {
                case isFavorite = "is_favorite"
            }
        }

        do {
            let _: [ProjectDTO] = try await restClient.patch(
                path: "/rest/v1/projects",
                body: FavoritePatch(isFavorite: isFavorite),
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

    func updateProjectSourceLabels(id: String, sourceLabels: [String]) async throws {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(id)")]

        struct SourceLabelsPatch: Encodable {
            let sourceLabels: [String]

            enum CodingKeys: String, CodingKey {
                case sourceLabels = "source_labels"
            }
        }

        do {
            let _: [ProjectDTO] = try await restClient.patch(
                path: "/rest/v1/projects",
                body: SourceLabelsPatch(sourceLabels: normalizeProjectSourceLabels(sourceLabels)),
                query: query,
                bearerToken: token,
                preferReturnRepresentation: true
            )
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if isMissingProjectSourceLabelsColumn(error) {
                return
            }
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
        let baseQuery = [
            URLQueryItem(name: "project_id", value: "eq.\(projectId)"),
            URLQueryItem(name: "select", value: "id,project_id,english,japanese,distractors,example_sentence,example_sentence_ja,pronunciation,part_of_speech_tags,related_words,usage_patterns,insights_generated_at,insights_version,status,created_at,last_reviewed_at,next_review_at,ease_factor,interval_days,repetition,is_favorite"),
            URLQueryItem(name: "order", value: "created_at.asc")
        ]

        do {
            return try await fetchAllPagedWords(query: baseQuery, token: token)
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    func fetchAllWords(userId: String) async throws -> [Word] {
        let token = try await accessTokenProvider()
        let baseQuery = [
            URLQueryItem(name: "select", value: "id,project_id,english,japanese,distractors,example_sentence,example_sentence_ja,pronunciation,part_of_speech_tags,related_words,usage_patterns,insights_generated_at,insights_version,status,created_at,last_reviewed_at,next_review_at,ease_factor,interval_days,repetition,is_favorite,projects!inner(user_id)"),
            URLQueryItem(name: "projects.user_id", value: "eq.\(userId)"),
            URLQueryItem(name: "order", value: "created_at.desc")
        ]

        do {
            return try await fetchAllPagedWords(query: baseQuery, token: token)
        } catch SupabaseClientError.unauthorized {
            throw RepositoryError.unauthorized
        } catch {
            if error.isCancellationError { throw error }
            throw RepositoryError.underlying(error.localizedDescription)
        }
    }

    /// Fetches all words using pagination with Range header (1000 rows per page).
    private func fetchAllPagedWords(query: [URLQueryItem], token: String) async throws -> [Word] {
        let pageSize = 1000
        var allRows: [WordDTO] = []
        var offset = 0

        while true {
            let rangeEnd = offset + pageSize - 1
            let rows: [WordDTO] = try await restClient.get(
                path: "/rest/v1/words",
                query: query,
                bearerToken: token,
                rangeHeader: "\(offset)-\(rangeEnd)"
            )
            allRows.append(contentsOf: rows)

            if rows.count < pageSize {
                break
            }
            offset += pageSize
        }

        return allRows.map(SupabaseMapper.word(from:))
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

    func generateShareId(projectId: String) async throws -> String {
        let token = try await accessTokenProvider()
        let query = [URLQueryItem(name: "id", value: "eq.\(projectId)")]

        // Generate a random 12-character alphanumeric string (matches web logic)
        let bytes = (0..<9).map { _ in UInt8.random(in: 0...255) }
        let shareId = String(bytes.map { String(format: "%02x", $0) }.joined().prefix(12))

        struct SharePatch: Encodable {
            let shareId: String
            enum CodingKeys: String, CodingKey {
                case shareId = "share_id"
            }
        }

        do {
            let _: [ProjectDTO] = try await restClient.patch(
                path: "/rest/v1/projects",
                body: SharePatch(shareId: shareId),
                query: query,
                bearerToken: token,
                preferReturnRepresentation: true
            )
            return shareId
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
