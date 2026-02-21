import Foundation

struct RepositoryRouter {
    let localRepository: WordRepositoryProtocol
    let cloudRepository: WordRepositoryProtocol

    func mode(for subscription: SubscriptionState?) -> RepositoryMode {
        guard let subscription, subscription.isActivePro else {
            return .guestLocal
        }
        return .proCloud
    }

    func repository(for mode: RepositoryMode) -> WordRepositoryProtocol {
        switch mode {
        case .guestLocal:
            return localRepository
        case .proCloud:
            return cloudRepository
        }
    }
}
