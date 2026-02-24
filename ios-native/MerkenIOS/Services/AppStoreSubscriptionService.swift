import Foundation
import StoreKit

enum AppStoreSubscriptionServiceError: LocalizedError {
    case notConfigured
    case productsNotFound
    case purchasePending
    case userCancelled
    case unverifiedTransaction(String)
    case noRestorableSubscription

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "アプリ内課金の設定が見つかりません。"
        case .productsNotFound:
            return "購入可能な商品が見つかりませんでした。"
        case .purchasePending:
            return "購入処理は保留中です。確認後に再度お試しください。"
        case .userCancelled:
            return "購入をキャンセルしました。"
        case .unverifiedTransaction(let message):
            return "購入情報の検証に失敗しました。(\(message))"
        case .noRestorableSubscription:
            return "復元できるProサブスクリプションが見つかりませんでした。"
        }
    }
}

enum AppStoreVerifySource: String, Sendable {
    case purchase
    case restore
    case launchSync = "launch_sync"
}

@MainActor
final class AppStoreSubscriptionService {
    private let productIds: [String]
    private let webAPIClient: WebAPIClient

    init(productIds: [String], webAPIClient: WebAPIClient) {
        self.productIds = productIds
        self.webAPIClient = webAPIClient
    }

    var isConfigured: Bool {
        !productIds.isEmpty
    }

    func purchaseProSubscription(bearerToken: String) async throws {
        let product = try await loadPrimaryProduct()
        let purchaseResult = try await product.purchase()

        switch purchaseResult {
        case .success(let verificationResult):
            let transaction = try verifiedTransaction(from: verificationResult)
            try await verifyWithServer(
                transactionId: String(transaction.id),
                source: .purchase,
                bearerToken: bearerToken
            )
            await transaction.finish()
        case .pending:
            throw AppStoreSubscriptionServiceError.purchasePending
        case .userCancelled:
            throw AppStoreSubscriptionServiceError.userCancelled
        @unknown default:
            throw AppStoreSubscriptionServiceError.unverifiedTransaction("unknown purchase state")
        }
    }

    func restorePurchases(bearerToken: String) async throws {
        guard isConfigured else {
            throw AppStoreSubscriptionServiceError.notConfigured
        }

        try await AppStore.sync()
        guard let transaction = try await latestEligibleTransaction() else {
            throw AppStoreSubscriptionServiceError.noRestorableSubscription
        }

        try await verifyWithServer(
            transactionId: String(transaction.id),
            source: .restore,
            bearerToken: bearerToken
        )
    }

    func syncOnLaunchIfNeeded(bearerToken: String) async throws -> Bool {
        guard isConfigured else { return false }

        guard let transaction = try await latestEligibleTransaction() else {
            return false
        }

        try await verifyWithServer(
            transactionId: String(transaction.id),
            source: .launchSync,
            bearerToken: bearerToken
        )
        return true
    }

    private func loadPrimaryProduct() async throws -> Product {
        guard isConfigured else {
            throw AppStoreSubscriptionServiceError.notConfigured
        }

        let products = try await Product.products(for: productIds)
        guard !products.isEmpty else {
            throw AppStoreSubscriptionServiceError.productsNotFound
        }

        for productId in productIds {
            if let matched = products.first(where: { $0.id == productId }) {
                return matched
            }
        }

        throw AppStoreSubscriptionServiceError.productsNotFound
    }

    private func latestEligibleTransaction() async throws -> Transaction? {
        var latest: Transaction?

        for await entitlement in Transaction.currentEntitlements {
            let transaction = try verifiedTransaction(from: entitlement)
            guard productIds.contains(transaction.productID) else { continue }
            guard transaction.revocationDate == nil else { continue }

            if let expirationDate = transaction.expirationDate, expirationDate <= Date() {
                continue
            }

            if let currentLatest = latest {
                if transaction.purchaseDate > currentLatest.purchaseDate {
                    latest = transaction
                }
            } else {
                latest = transaction
            }
        }

        return latest
    }

    private func verifyWithServer(
        transactionId: String,
        source: AppStoreVerifySource,
        bearerToken: String
    ) async throws {
        _ = try await webAPIClient.verifyAppStoreTransaction(
            transactionId: transactionId,
            source: source.rawValue,
            bearerToken: bearerToken
        )
    }

    private func verifiedTransaction(
        from result: VerificationResult<Transaction>
    ) throws -> Transaction {
        switch result {
        case .verified(let transaction):
            return transaction
        case .unverified(_, let error):
            throw AppStoreSubscriptionServiceError.unverifiedTransaction(error.localizedDescription)
        }
    }
}
