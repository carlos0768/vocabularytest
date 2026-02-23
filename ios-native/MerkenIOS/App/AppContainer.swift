import Foundation
import SwiftData

@MainActor
struct AppContainer {
    let appState: AppState
    let modelContainer: ModelContainer

    static func make() -> AppContainer {
        let modelContainer: ModelContainer
        do {
            modelContainer = try ModelContainer(
                for: LocalProjectRecord.self,
                LocalWordRecord.self
            )
        } catch {
            fatalError("Failed to initialize SwiftData container: \(error)")
        }

        let config: AppConfig
        do {
            config = try AppConfig()
        } catch {
            fatalError("Failed to initialize app config: \(error)")
        }

        let restClient = SupabaseRESTClient(config: config)
        let authService = AuthService(restClient: restClient)
        let localRepository = LocalWordRepository(modelContainer: modelContainer)
        let cloudRepository = CloudWordRepository(
            restClient: restClient,
            accessTokenProvider: {
                guard let session = await MainActor.run(body: { authService.session }) else {
                    throw AuthServiceError.missingSession
                }
                if session.isExpired {
                    throw AuthServiceError.sessionExpired
                }
                return session.accessToken
            }
        )

        let router = RepositoryRouter(
            localRepository: localRepository,
            cloudRepository: cloudRepository
        )

        let collectionRepository = CloudCollectionRepository(
            restClient: restClient,
            accessTokenProvider: {
                guard let session = await MainActor.run(body: { authService.session }) else {
                    throw AuthServiceError.missingSession
                }
                if session.isExpired {
                    throw AuthServiceError.sessionExpired
                }
                return session.accessToken
            }
        )

        let webAPIClient = WebAPIClient(
            baseURL: config.webAPIBaseURL,
            supabaseURL: config.supabaseURL,
            supabaseAnonKey: config.supabaseAnonKey
        )
        let quizStatsStore = QuizStatsStore()
        let sentenceQuizProgressStore = SentenceQuizProgressStore()
        let scanNotificationService = ScanNotificationService()

        let appState = AppState(
            authService: authService,
            repositoryRouter: router,
            guestSessionStore: GuestSessionStore(),
            webAPIClient: webAPIClient,
            quizStatsStore: quizStatsStore,
            sentenceQuizProgressStore: sentenceQuizProgressStore,
            collectionRepository: collectionRepository,
            scanNotificationService: scanNotificationService
        )

        return AppContainer(appState: appState, modelContainer: modelContainer)
    }
}
