import Foundation

struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        self.encodeClosure = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

extension Error {
    var isCancellationError: Bool {
        if self is CancellationError {
            return true
        }

        if let urlError = self as? URLError, urlError.code == .cancelled {
            return true
        }

        let nsError = self as NSError
        if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled {
            return true
        }

        if let repositoryError = self as? RepositoryError,
           case .underlying(let message) = repositoryError,
           message.lowercased().contains("cancel") {
            return true
        }

        if localizedDescription.lowercased() == "cancelled" {
            return true
        }

        return false
    }
}
