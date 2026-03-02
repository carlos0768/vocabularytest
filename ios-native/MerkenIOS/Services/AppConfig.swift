import Foundation

struct AppConfig: Sendable {
    let supabaseURL: URL
    let supabaseAnonKey: String
    let webAPIBaseURL: URL
    let iosScanJobsAlwaysOn: Bool
    let iosOfflineCacheEnabled: Bool
    let iapProProductIds: [String]

    static func parseCSVList(_ raw: String?) -> [String] {
        guard let raw, !raw.isEmpty else { return [] }

        var seen = Set<String>()
        var values: [String] = []
        for token in raw.split(separator: ",", omittingEmptySubsequences: true) {
            let normalized = token.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalized.isEmpty else { continue }
            guard !seen.contains(normalized) else { continue }
            seen.insert(normalized)
            values.append(normalized)
        }
        return values
    }

    init() throws {
        let info = Bundle.main.infoDictionary ?? [:]

        guard let rawSupabaseURL = info["SUPABASE_URL"] as? String,
              let supabaseURL = URL(string: rawSupabaseURL),
              !rawSupabaseURL.isEmpty
        else {
            throw RepositoryError.misconfigured("SUPABASE_URL")
        }

        guard let supabaseAnonKey = info["SUPABASE_ANON_KEY"] as? String,
              !supabaseAnonKey.isEmpty
        else {
            throw RepositoryError.misconfigured("SUPABASE_ANON_KEY")
        }

        let rawAPI = (info["WEB_API_BASE_URL"] as? String) ?? rawSupabaseURL
        guard let webAPIBaseURL = URL(string: rawAPI), !rawAPI.isEmpty else {
            throw RepositoryError.misconfigured("WEB_API_BASE_URL")
        }

        self.supabaseURL = supabaseURL
        self.supabaseAnonKey = supabaseAnonKey
        self.webAPIBaseURL = webAPIBaseURL
        self.iosScanJobsAlwaysOn = (info["IOS_SCAN_JOBS_ALWAYS_ON"] as? Bool) ?? true
        self.iosOfflineCacheEnabled = (info["IOS_OFFLINE_CACHE_ENABLED"] as? Bool) ?? true
        self.iapProProductIds = Self.parseCSVList(info["IAP_PRO_PRODUCT_IDS"] as? String)
    }
}
