import Foundation

struct AppConfig: Sendable {
    let supabaseURL: URL
    let supabaseAnonKey: String
    let webAPIBaseURL: URL

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
    }
}
