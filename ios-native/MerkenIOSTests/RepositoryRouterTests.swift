import XCTest
@testable import MerkenIOS

final class RepositoryRouterTests: XCTestCase {
    private struct DummyRepository: WordRepositoryProtocol {
        func fetchProjects(userId: String) async throws -> [Project] { [] }
        func createProject(title: String, userId: String) async throws -> Project { Project(userId: userId, title: title) }
        func updateProject(id: String, title: String) async throws {}
        func deleteProject(id: String) async throws {}
        func fetchWords(projectId: String) async throws -> [Word] { [] }
        func fetchAllWords(userId: String) async throws -> [Word] { [] }
        func createWords(_ inputs: [WordInput]) async throws -> [Word] { [] }
        func updateWord(id: String, patch: WordPatch) async throws {}
        func deleteWord(id: String) async throws {}
    }

    func testModeReturnsGuestLocalWhenSubscriptionMissing() {
        let router = RepositoryRouter(localRepository: DummyRepository(), cloudRepository: DummyRepository())
        XCTAssertEqual(router.mode(for: nil), .guestLocal)
    }

    func testModeReturnsGuestLocalForNonPro() {
        let router = RepositoryRouter(localRepository: DummyRepository(), cloudRepository: DummyRepository())
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .active,
            plan: .free,
            proSource: "none",
            testProExpiresAt: nil,
            currentPeriodEnd: nil
        )

        XCTAssertEqual(router.mode(for: subscription), .guestLocal)
    }

    func testModeReturnsProCloudForActivePro() {
        let router = RepositoryRouter(localRepository: DummyRepository(), cloudRepository: DummyRepository())
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .active,
            plan: .pro,
            proSource: "billing",
            testProExpiresAt: nil,
            currentPeriodEnd: Date().addingTimeInterval(3600)
        )

        XCTAssertEqual(router.mode(for: subscription), .proCloud)
    }
}
