import Foundation

struct ShareImportInput: Sendable {
    let text: String
    let sourceApp: String?
}

struct ShareImportPreviewCandidateDTO: Decodable, Sendable {
    let english: String
    let japanese: String
    let wasSentence: Bool
    let warnings: [String]
}

private struct ShareImportPreviewResponseDTO: Decodable {
    let success: Bool
    let candidate: ShareImportPreviewCandidateDTO?
    let error: String?
}

struct ShareImportProjectOptionDTO: Decodable, Sendable, Identifiable {
    let id: String
    let title: String
    let updatedAt: String?
}

private struct ShareImportProjectsResponseDTO: Decodable {
    let success: Bool
    let projects: [ShareImportProjectOptionDTO]
    let error: String?
}

struct ShareImportCommitResultDTO: Decodable, Sendable {
    let success: Bool
    let projectId: String
    let projectTitle: String
    let wordId: String?
    let created: Bool
    let duplicate: Bool
    let error: String?
}

struct ShareImportPreviewRequestDTO: Encodable {
    let text: String
    let sourceApp: String?
    let locale: String?
}

struct ShareImportCommitRequestDTO: Encodable {
    let targetProjectId: String?
    let newProjectTitle: String?
    let english: String
    let japanese: String
    let originalText: String?
    let sourceApp: String?
}

enum ShareImportDecode {
    static func preview(from data: Data) throws -> ShareImportPreviewCandidateDTO {
        let decoded = try JSONDecoder().decode(ShareImportPreviewResponseDTO.self, from: data)
        guard decoded.success, let candidate = decoded.candidate else {
            throw ShareImportServiceError.server(decoded.error ?? "プレビューの生成に失敗しました。")
        }
        return candidate
    }

    static func projects(from data: Data) throws -> [ShareImportProjectOptionDTO] {
        let decoded = try JSONDecoder().decode(ShareImportProjectsResponseDTO.self, from: data)
        guard decoded.success else {
            throw ShareImportServiceError.server(decoded.error ?? "単語帳一覧の取得に失敗しました。")
        }
        return decoded.projects
    }

    static func commit(from data: Data) throws -> ShareImportCommitResultDTO {
        let decoded = try JSONDecoder().decode(ShareImportCommitResultDTO.self, from: data)
        guard decoded.success else {
            throw ShareImportServiceError.server(decoded.error ?? "保存に失敗しました。")
        }
        return decoded
    }
}
