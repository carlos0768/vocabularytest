import Foundation
import SwiftData

@ModelActor
actor LocalWordRepository: WordRepositoryProtocol {

    func fetchProjects(userId: String) async throws -> [Project] {
        var descriptor = FetchDescriptor<LocalProjectRecord>(
            predicate: #Predicate { $0.userId == userId },
            sortBy: [SortDescriptor(\LocalProjectRecord.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = 200

        let records = try modelContext.fetch(descriptor)
        return records.map {
            Project(
                id: $0.id,
                userId: $0.userId,
                title: $0.title,
                iconImage: $0.iconImage,
                createdAt: $0.createdAt,
                shareId: $0.shareId,
                isFavorite: $0.isFavorite
            )
        }
    }

    func createProject(title: String, userId: String, iconImage: String? = nil) async throws -> Project {
        let project = Project(userId: userId, title: title, iconImage: iconImage)
        let record = LocalProjectRecord(
            id: project.id,
            userId: project.userId,
            title: project.title,
            iconImage: project.iconImage,
            createdAt: project.createdAt,
            shareId: project.shareId,
            isFavorite: project.isFavorite
        )
        modelContext.insert(record)
        try modelContext.save()
        return project
    }

    func updateProject(id: String, title: String) async throws {
        guard let record = try fetchProjectRecord(id: id) else {
            throw RepositoryError.notFound
        }

        record.title = title
        try modelContext.save()
    }

    func updateProjectIcon(id: String, iconImage: String) async throws {
        guard let record = try fetchProjectRecord(id: id) else {
            throw RepositoryError.notFound
        }

        record.iconImage = iconImage
        try modelContext.save()
    }

    func updateProjectFavorite(id: String, isFavorite: Bool) async throws {
        guard let record = try fetchProjectRecord(id: id) else {
            throw RepositoryError.notFound
        }

        record.isFavorite = isFavorite
        try modelContext.save()
    }

    func deleteProject(id: String) async throws {
        guard let record = try fetchProjectRecord(id: id) else {
            return
        }

        let words = try modelContext.fetch(
            FetchDescriptor<LocalWordRecord>(predicate: #Predicate { $0.projectId == id })
        )
        words.forEach { modelContext.delete($0) }
        modelContext.delete(record)
        try modelContext.save()
    }

    func fetchWords(projectId: String) async throws -> [Word] {
        let descriptor = FetchDescriptor<LocalWordRecord>(
            predicate: #Predicate { $0.projectId == projectId },
            sortBy: [SortDescriptor(\LocalWordRecord.createdAt, order: .forward)]
        )

        let records = try modelContext.fetch(descriptor)
        return records.map(mapWord)
    }

    func fetchAllWords(userId: String) async throws -> [Word] {
        let projectDescriptor = FetchDescriptor<LocalProjectRecord>(
            predicate: #Predicate { $0.userId == userId }
        )
        let projectIds = Set(try modelContext.fetch(projectDescriptor).map(\.id))

        let wordDescriptor = FetchDescriptor<LocalWordRecord>(
            sortBy: [SortDescriptor(\LocalWordRecord.createdAt, order: .reverse)]
        )
        let allRecords = try modelContext.fetch(wordDescriptor)
        return allRecords.filter { projectIds.contains($0.projectId) }.map(mapWord)
    }

    func createWords(_ inputs: [WordInput]) async throws -> [Word] {
        var created: [Word] = []

        for input in inputs {
            let word = Word(
                projectId: input.projectId,
                english: input.english,
                japanese: input.japanese,
                distractors: input.distractors,
                exampleSentence: input.exampleSentence,
                exampleSentenceJa: input.exampleSentenceJa,
                pronunciation: input.pronunciation
            )

            let record = LocalWordRecord(
                id: word.id,
                projectId: word.projectId,
                english: word.english,
                japanese: word.japanese,
                distractorsBlob: try encodeDistractors(word.distractors),
                exampleSentence: word.exampleSentence,
                exampleSentenceJa: word.exampleSentenceJa,
                pronunciation: word.pronunciation,
                statusRaw: word.status.rawValue,
                createdAt: word.createdAt,
                lastReviewedAt: word.lastReviewedAt,
                nextReviewAt: word.nextReviewAt,
                easeFactor: word.easeFactor,
                intervalDays: word.intervalDays,
                repetition: word.repetition,
                isFavorite: word.isFavorite
            )

            modelContext.insert(record)
            created.append(word)
        }

        try modelContext.save()
        return created
    }

    func updateWord(id: String, patch: WordPatch) async throws {
        guard let record = try fetchWordRecord(id: id) else {
            throw RepositoryError.notFound
        }

        if let english = patch.english { record.english = english }
        if let japanese = patch.japanese { record.japanese = japanese }
        if let distractors = patch.distractors {
            record.distractorsBlob = try encodeDistractors(distractors)
        }

        if let sentence = patch.exampleSentence {
            record.exampleSentence = sentence
        }

        if let sentenceJa = patch.exampleSentenceJa {
            record.exampleSentenceJa = sentenceJa
        }

        if let pronunciation = patch.pronunciation {
            record.pronunciation = pronunciation
        }

        if let status = patch.status {
            record.statusRaw = status.rawValue
        }

        if let lastReviewed = patch.lastReviewedAt {
            record.lastReviewedAt = lastReviewed
        }

        if let nextReview = patch.nextReviewAt {
            record.nextReviewAt = nextReview
        }

        if let easeFactor = patch.easeFactor {
            record.easeFactor = easeFactor
        }

        if let interval = patch.intervalDays {
            record.intervalDays = interval
        }

        if let repetition = patch.repetition {
            record.repetition = repetition
        }

        if let isFavorite = patch.isFavorite {
            record.isFavorite = isFavorite
        }

        try modelContext.save()
    }

    func deleteWord(id: String) async throws {
        guard let record = try fetchWordRecord(id: id) else {
            return
        }

        modelContext.delete(record)
        try modelContext.save()
    }

    private func fetchProjectRecord(id: String) throws -> LocalProjectRecord? {
        let descriptor = FetchDescriptor<LocalProjectRecord>(predicate: #Predicate { $0.id == id })
        return try modelContext.fetch(descriptor).first
    }

    private func fetchWordRecord(id: String) throws -> LocalWordRecord? {
        let descriptor = FetchDescriptor<LocalWordRecord>(predicate: #Predicate { $0.id == id })
        return try modelContext.fetch(descriptor).first
    }

    private func mapWord(_ record: LocalWordRecord) -> Word {
        Word(
            id: record.id,
            projectId: record.projectId,
            english: record.english,
            japanese: record.japanese,
            distractors: decodeDistractors(record.distractorsBlob),
            exampleSentence: record.exampleSentence,
            exampleSentenceJa: record.exampleSentenceJa,
            pronunciation: record.pronunciation,
            status: WordStatus(rawValue: record.statusRaw) ?? .new,
            createdAt: record.createdAt,
            lastReviewedAt: record.lastReviewedAt,
            nextReviewAt: record.nextReviewAt,
            easeFactor: record.easeFactor,
            intervalDays: record.intervalDays,
            repetition: record.repetition,
            isFavorite: record.isFavorite
        )
    }

    private func encodeDistractors(_ value: [String]) throws -> Data {
        try JSONEncoder().encode(value)
    }

    private func decodeDistractors(_ data: Data) -> [String] {
        (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }
}
