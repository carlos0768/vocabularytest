import XCTest
@testable import MerkenIOS

final class AppConfigTests: XCTestCase {
    func testParseCSVListTrimsAndDeduplicates() {
        let parsed = AppConfig.parseCSVList(" com.example.pro.monthly , com.example.pro.yearly,com.example.pro.monthly,,")
        XCTAssertEqual(parsed, ["com.example.pro.monthly", "com.example.pro.yearly"])
    }

    func testParseCSVListHandlesEmptyInput() {
        XCTAssertEqual(AppConfig.parseCSVList(nil), [])
        XCTAssertEqual(AppConfig.parseCSVList(""), [])
        XCTAssertEqual(AppConfig.parseCSVList("   "), [])
    }
}

