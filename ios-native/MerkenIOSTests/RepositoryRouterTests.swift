import XCTest
@testable import MerkenIOS

final class RepositoryRouterTests: XCTestCase {
    private struct DummyRepository: WordRepositoryProtocol {
        func fetchProjects(userId: String) async throws -> [Project] { [] }
        func createProject(title: String, userId: String, iconImage: String?) async throws -> Project {
            Project(userId: userId, title: title, iconImage: iconImage)
        }
        func updateProject(id: String, title: String) async throws {}
        func updateProjectIcon(id: String, iconImage: String?) async throws {}
        func updateProjectFavorite(id: String, isFavorite: Bool) async throws {}
        func updateProjectSourceLabels(id: String, sourceLabels: [String]) async throws {}
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
            currentPeriodEnd: nil,
            cancelAtPeriodEnd: false
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
            currentPeriodEnd: Date().addingTimeInterval(3600),
            cancelAtPeriodEnd: false
        )

        XCTAssertEqual(router.mode(for: subscription), .proCloud)
    }

    func testModeReturnsReadonlyCloudForCancelledPro() {
        let router = RepositoryRouter(localRepository: DummyRepository(), cloudRepository: DummyRepository())
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .cancelled,
            plan: .pro,
            proSource: "billing",
            testProExpiresAt: nil,
            currentPeriodEnd: Date().addingTimeInterval(-3600),
            cancelAtPeriodEnd: false
        )

        XCTAssertEqual(router.mode(for: subscription), .readonlyCloud)
    }

    func testTestSourceWithoutExpiryStaysActiveEvenWhenCurrentPeriodEndIsPast() {
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .active,
            plan: .pro,
            proSource: "test",
            testProExpiresAt: nil,
            currentPeriodEnd: Date().addingTimeInterval(-3600),
            cancelAtPeriodEnd: false
        )

        XCTAssertTrue(subscription.isActivePro)
    }

    func testTestSourceWithPastExpiryIsInactive() {
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .active,
            plan: .pro,
            proSource: "test",
            testProExpiresAt: Date().addingTimeInterval(-60),
            currentPeriodEnd: Date().addingTimeInterval(3600),
            cancelAtPeriodEnd: false
        )

        XCTAssertFalse(subscription.isActivePro)
    }

    func testDisplayDateUsesTestExpiryInsteadOfStaleCurrentPeriodEnd() {
        let expiry = Date().addingTimeInterval(3600)
        let stalePeriodEnd = Date().addingTimeInterval(-3600)
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .active,
            plan: .pro,
            proSource: "test",
            testProExpiresAt: expiry,
            currentPeriodEnd: stalePeriodEnd,
            cancelAtPeriodEnd: false
        )

        XCTAssertEqual(subscription.displayDateLabel, "有効期限")
        XCTAssertEqual(subscription.displayDateValue, expiry)
    }

    func testDisplayDateUsesCancellationLabelForBillingCancellation() {
        let periodEnd = Date().addingTimeInterval(3600)
        let subscription = SubscriptionState(
            id: "s1",
            userId: "u1",
            status: .active,
            plan: .pro,
            proSource: "billing",
            testProExpiresAt: nil,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: true
        )

        XCTAssertEqual(subscription.displayDateLabel, "解約予定日")
        XCTAssertEqual(subscription.displayDateValue, periodEnd)
    }
}
