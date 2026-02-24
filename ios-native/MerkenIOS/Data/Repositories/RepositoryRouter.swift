import Foundation

struct RepositoryRouter {
    let localRepository: WordRepositoryProtocol
    let cloudRepository: WordRepositoryProtocol

    func mode(for subscription: SubscriptionState?) -> RepositoryMode {
        guard let subscription else { return .guestLocal }
        if subscription.isActivePro { return .proCloud }
        if subscription.wasPro { return .readonlyCloud }
        return .guestLocal
    }

    func repository(for mode: RepositoryMode) -> WordRepositoryProtocol {
        switch mode {
        case .guestLocal:
            return localRepository
        case .proCloud, .readonlyCloud:
            return cloudRepository
        }
    }
}
