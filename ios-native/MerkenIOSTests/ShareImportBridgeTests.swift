import XCTest
@testable import MerkenIOS

final class ShareImportBridgeTests: XCTestCase {
    override func setUp() {
        super.setUp()
        ShareImportBridge.clearAuthSnapshot()
        _ = ShareImportBridge.consumeImportEvent()
    }

    override func tearDown() {
        ShareImportBridge.clearAuthSnapshot()
        _ = ShareImportBridge.consumeImportEvent()
        super.tearDown()
    }

    func testAuthSnapshotRoundTrip() {
        let snapshot = SharedAuthSnapshot(
            userId: "user-1",
            email: "user@example.com",
            accessToken: "token-1",
            refreshToken: "refresh-1",
            expiresAt: Date().addingTimeInterval(3600),
            tokenType: "bearer"
        )

        ShareImportBridge.saveAuthSnapshot(snapshot)
        let loaded = ShareImportBridge.loadAuthSnapshot()

        XCTAssertEqual(loaded?.userId, snapshot.userId)
        XCTAssertEqual(loaded?.accessToken, snapshot.accessToken)
        XCTAssertEqual(loaded?.refreshToken, snapshot.refreshToken)
        XCTAssertEqual(loaded?.tokenType, snapshot.tokenType)
    }

    func testImportEventIsConsumedOnce() {
        let event = SharedImportEvent(
            id: "event-1",
            projectId: "project-1",
            projectTitle: "TOEFL",
            wordCount: 1,
            createdAt: Date()
        )

        ShareImportBridge.saveImportEvent(event)

        let first = ShareImportBridge.consumeImportEvent()
        let second = ShareImportBridge.consumeImportEvent()

        XCTAssertEqual(first?.id, "event-1")
        XCTAssertNil(second)
    }
}
