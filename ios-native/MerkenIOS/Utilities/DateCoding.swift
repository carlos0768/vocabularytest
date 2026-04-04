import Foundation

enum DateCoding {
    static let parserWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let parser: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func decode(_ value: String) -> Date? {
        if let date = parserWithFractionalSeconds.date(from: value) ?? parser.date(from: value) {
            return date
        }
        // Postgres / SQL style: "2026-04-04 12:34:56.123456+00" (space between date and time)
        if value.count > 10 {
            let sep = value.index(value.startIndex, offsetBy: 10)
            if value[sep] == " " {
                var normalized = value
                normalized.replaceSubrange(sep ... sep, with: "T")
                if let date = parserWithFractionalSeconds.date(from: normalized) ?? parser.date(from: normalized) {
                    return date
                }
            }
        }
        return nil
    }

    static func encode(_ value: Date) -> String {
        parserWithFractionalSeconds.string(from: value)
    }
}

extension JSONDecoder.DateDecodingStrategy {
    static var supabaseISO8601: JSONDecoder.DateDecodingStrategy {
        .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = DateCoding.decode(string) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO8601 date: \(string)"
            )
        }
    }
}

extension JSONEncoder.DateEncodingStrategy {
    static var supabaseISO8601: JSONEncoder.DateEncodingStrategy {
        .custom { value, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(DateCoding.encode(value))
        }
    }
}
