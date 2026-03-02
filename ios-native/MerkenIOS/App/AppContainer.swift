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
                LocalWordRecord.self,
                CachedCloudProjectRecord.self,
                CachedCloudWordRecord.self
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
        let authService = AuthService(restClient: restClient, webAPIBaseURL: config.webAPIBaseURL)
        let guestSessionStore = GuestSessionStore()
        let localRepository = LocalWordRepository(modelContainer: modelContainer)
        let cloudRepository = CloudWordRepository(
            restClient: restClient,
            accessTokenProvider: {
                let session = try await authService.refreshSessionIfNeeded(forceRefresh: false)
                return session.accessToken
            }
        )
        let cacheStore = CloudOfflineCacheStore(modelContainer: modelContainer)

        let offlineCloudRepository: OfflineFirstCloudRepository?
        if config.iosOfflineCacheEnabled {
            offlineCloudRepository = OfflineFirstCloudRepository(
                cloudRepository: cloudRepository,
                cacheStore: cacheStore,
                userIdProvider: {
                    await MainActor.run {
                        authService.session?.userId
                    }
                },
                forceAuthRefresh: {
                    _ = try? await authService.refreshSessionIfNeeded(forceRefresh: true)
                }
            )
        } else {
            offlineCloudRepository = nil
        }

        let routedCloudRepository: WordRepositoryProtocol = offlineCloudRepository ?? cloudRepository
        let projectShareService: ProjectShareServiceProtocol = offlineCloudRepository ?? cloudRepository

        let router = RepositoryRouter(
            localRepository: localRepository,
            cloudRepository: routedCloudRepository
        )

        let collectionRepository = CloudCollectionRepository(
            restClient: restClient,
            accessTokenProvider: {
                let session = try await authService.refreshSessionIfNeeded(forceRefresh: false)
                return session.accessToken
            }
        )

        let webAPIClient = WebAPIClient(
            baseURL: config.webAPIBaseURL,
            supabaseURL: config.supabaseURL,
            supabaseAnonKey: config.supabaseAnonKey
        )
        let appStoreSubscriptionService = AppStoreSubscriptionService(
            productIds: config.iapProProductIds,
            webAPIClient: webAPIClient
        )
        let quizStatsStore = QuizStatsStore()
        let sentenceQuizProgressStore = SentenceQuizProgressStore()
        let scanNotificationService = ScanNotificationService()

        let appState = AppState(
            authService: authService,
            repositoryRouter: router,
            guestSessionStore: guestSessionStore,
            webAPIClient: webAPIClient,
            appStoreSubscriptionService: appStoreSubscriptionService,
            quizStatsStore: quizStatsStore,
            sentenceQuizProgressStore: sentenceQuizProgressStore,
            collectionRepository: collectionRepository,
            scanNotificationService: scanNotificationService,
            projectShareService: projectShareService,
            offlinePrefetchRepository: offlineCloudRepository
        )

        return AppContainer(appState: appState, modelContainer: modelContainer)
    }
}
