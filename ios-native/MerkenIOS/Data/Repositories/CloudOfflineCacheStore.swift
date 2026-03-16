import Foundation
import SwiftData

@ModelActor
actor CloudOfflineCacheStore {
    private let currentSourceVersion = 1

    func fetchProjects(userId: String) throws -> [Project] {
        let descriptor = FetchDescriptor<CachedCloudProjectRecord>(
            predicate: #Predicate { $0.userId == userId },
            sortBy: [SortDescriptor(\CachedCloudProjectRecord.createdAt, order: .reverse)]
        )

        let records = try modelContext.fetch(descriptor)
        return records.map(mapProject)
    }

    func fetchWords(projectId: String) throws -> [Word] {
        let descriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.projectId == projectId },
            sortBy: [SortDescriptor(\CachedCloudWordRecord.createdAt, order: .forward)]
        )

        let records = try modelContext.fetch(descriptor)
        return records.map(mapWord)
    }

    func fetchAllWords(userId: String) throws -> [Word] {
        let descriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.userId == userId },
            sortBy: [SortDescriptor(\CachedCloudWordRecord.createdAt, order: .reverse)]
        )

        let records = try modelContext.fetch(descriptor)
        return records.map(mapWord)
    }

    func replaceProjects(userId: String, projects: [Project], syncedAt: Date = .now) throws {
        let existingDescriptor = FetchDescriptor<CachedCloudProjectRecord>(
            predicate: #Predicate { $0.userId == userId }
        )
        let existing = try modelContext.fetch(existingDescriptor)
        let existingMap = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
        let incomingIds = Set(projects.map(\.id))

        for record in existing where !incomingIds.contains(record.id) {
            try deleteWords(projectId: record.id)
            modelContext.delete(record)
        }

        for project in projects {
            if let record = existingMap[project.id] {
                record.title = project.title
                record.iconImage = project.iconImage
                record.createdAt = project.createdAt
                record.shareId = project.shareId
                record.isFavorite = project.isFavorite
                record.sourceLabelsBlob = try encodeOptional(project.sourceLabels)
                record.lastSyncedAt = syncedAt
                record.sourceVersion = currentSourceVersion
            } else {
                let record = CachedCloudProjectRecord(
                    id: project.id,
                    userId: userId,
                    title: project.title,
                    iconImage: project.iconImage,
                    createdAt: project.createdAt,
                    shareId: project.shareId,
                    isFavorite: project.isFavorite,
                    sourceLabelsBlob: try encodeOptional(project.sourceLabels),
                    lastSyncedAt: syncedAt,
                    lastAccessedAt: syncedAt,
                    sourceVersion: currentSourceVersion
                )
                modelContext.insert(record)
            }
        }

        try modelContext.save()
    }

    func replaceWords(
        userId: String,
        projectId: String,
        words: [Word],
        markAsAccessed: Bool,
        syncedAt: Date = .now
    ) throws {
        let incomingWords = deduplicatedWordsByID(words)
        let existingDescriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.projectId == projectId && $0.userId == userId }
        )
        let existing = try modelContext.fetch(existingDescriptor)
        var existingMap: [String: CachedCloudWordRecord] = [:]
        existingMap.reserveCapacity(existing.count)
        for record in existing {
            if existingMap[record.id] == nil {
                existingMap[record.id] = record
            } else {
                modelContext.delete(record)
            }
        }
        let incomingIds = Set(incomingWords.map(\.id))

        for record in existing where !incomingIds.contains(record.id) {
            modelContext.delete(record)
        }

        for word in incomingWords {
            if let record = existingMap[word.id] {
                apply(
                    userId: userId,
                    word: word,
                    to: record,
                    syncedAt: syncedAt,
                    markAsAccessed: markAsAccessed
                )
            } else {
                let record = try makeWordRecord(
                    userId: userId,
                    word: word,
                    syncedAt: syncedAt,
                    markAsAccessed: markAsAccessed
                )
                modelContext.insert(record)
            }
        }

        if markAsAccessed {
            try touchProjectAccess(projectId: projectId, at: syncedAt)
        }

        try modelContext.save()
    }

    func replaceAllWords(userId: String, words: [Word], syncedAt: Date = .now) throws {
        let incomingWords = deduplicatedWordsByID(words)
        let existingDescriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.userId == userId }
        )
        let existing = try modelContext.fetch(existingDescriptor)
        var existingMap: [String: CachedCloudWordRecord] = [:]
        existingMap.reserveCapacity(existing.count)
        for record in existing {
            if existingMap[record.id] == nil {
                existingMap[record.id] = record
            } else {
                modelContext.delete(record)
            }
        }
        let incomingIds = Set(incomingWords.map(\.id))

        for record in existing where !incomingIds.contains(record.id) {
            modelContext.delete(record)
        }

        for word in incomingWords {
            if let record = existingMap[word.id] {
                apply(
                    userId: userId,
                    word: word,
                    to: record,
                    syncedAt: syncedAt,
                    markAsAccessed: false
                )
            } else {
                let record = try makeWordRecord(
                    userId: userId,
                    word: word,
                    syncedAt: syncedAt,
                    markAsAccessed: false
                )
                modelContext.insert(record)
            }
        }

        try modelContext.save()
    }

    func upsertProject(_ project: Project, markAsAccessed: Bool = true, syncedAt: Date = .now) throws {
        let descriptor = FetchDescriptor<CachedCloudProjectRecord>(predicate: #Predicate { $0.id == project.id })
        if let record = try modelContext.fetch(descriptor).first {
            record.userId = project.userId
            record.title = project.title
            record.iconImage = project.iconImage
            record.createdAt = project.createdAt
            record.shareId = project.shareId
            record.isFavorite = project.isFavorite
            record.sourceLabelsBlob = try encodeOptional(project.sourceLabels)
            record.lastSyncedAt = syncedAt
            if markAsAccessed {
                record.lastAccessedAt = syncedAt
            }
            record.sourceVersion = currentSourceVersion
        } else {
            let record = CachedCloudProjectRecord(
                id: project.id,
                userId: project.userId,
                title: project.title,
                iconImage: project.iconImage,
                createdAt: project.createdAt,
                shareId: project.shareId,
                isFavorite: project.isFavorite,
                sourceLabelsBlob: try encodeOptional(project.sourceLabels),
                lastSyncedAt: syncedAt,
                lastAccessedAt: syncedAt,
                sourceVersion: currentSourceVersion
            )
            modelContext.insert(record)
        }

        try modelContext.save()
    }

    func updateProjectTitle(id: String, title: String, syncedAt: Date = .now) throws {
        guard let record = try fetchProjectRecord(id: id) else { return }
        record.title = title
        record.lastSyncedAt = syncedAt
        try modelContext.save()
    }

    func updateProjectIcon(id: String, iconImage: String?, syncedAt: Date = .now) throws {
        guard let record = try fetchProjectRecord(id: id) else { return }
        record.iconImage = iconImage
        record.lastSyncedAt = syncedAt
        try modelContext.save()
    }

    func updateProjectFavorite(id: String, isFavorite: Bool, syncedAt: Date = .now) throws {
        guard let record = try fetchProjectRecord(id: id) else { return }
        record.isFavorite = isFavorite
        record.lastSyncedAt = syncedAt
        try modelContext.save()
    }

    func updateProjectSourceLabels(id: String, sourceLabels: [String], syncedAt: Date = .now) throws {
        guard let record = try fetchProjectRecord(id: id) else { return }
        record.sourceLabelsBlob = try encodeOptional(normalizeProjectSourceLabels(sourceLabels))
        record.lastSyncedAt = syncedAt
        try modelContext.save()
    }

    func updateProjectShareId(id: String, shareId: String, syncedAt: Date = .now) throws {
        guard let record = try fetchProjectRecord(id: id) else { return }
        record.shareId = shareId
        record.lastSyncedAt = syncedAt
        try modelContext.save()
    }

    func deleteProject(id: String) throws {
        if let record = try fetchProjectRecord(id: id) {
            modelContext.delete(record)
        }
        try deleteWords(projectId: id)
        try modelContext.save()
    }

    func upsertWords(userId: String, words: [Word], markAsAccessed: Bool = true, syncedAt: Date = .now) throws {
        let incomingWords = deduplicatedWordsByID(words)

        for word in incomingWords {
            if let record = try fetchWordRecord(id: word.id) {
                apply(
                    userId: userId,
                    word: word,
                    to: record,
                    syncedAt: syncedAt,
                    markAsAccessed: markAsAccessed
                )
            } else {
                let record = try makeWordRecord(
                    userId: userId,
                    word: word,
                    syncedAt: syncedAt,
                    markAsAccessed: markAsAccessed
                )
                modelContext.insert(record)
            }
        }

        if markAsAccessed {
            let ids = Set(incomingWords.map(\.projectId))
            for projectId in ids {
                try touchProjectAccess(projectId: projectId, at: syncedAt)
            }
        }

        try modelContext.save()
    }

    func patchWord(id: String, patch: WordPatch, syncedAt: Date = .now) throws {
        guard let record = try fetchWordRecord(id: id) else { return }

        if let english = patch.english { record.english = english }
        if let japanese = patch.japanese { record.japanese = japanese }
        if let distractors = patch.distractors {
            record.distractorsBlob = try JSONEncoder().encode(distractors)
        }
        if let exampleSentence = patch.exampleSentence {
            record.exampleSentence = exampleSentence
        }
        if let exampleSentenceJa = patch.exampleSentenceJa {
            record.exampleSentenceJa = exampleSentenceJa
        }
        if let pronunciation = patch.pronunciation {
            record.pronunciation = pronunciation
        }
        if let partOfSpeechTags = patch.partOfSpeechTags {
            record.partOfSpeechTagsBlob = try encodeOptional(partOfSpeechTags)
        }
        if let relatedWords = patch.relatedWords {
            record.relatedWordsBlob = try encodeOptional(relatedWords)
        }
        if let usagePatterns = patch.usagePatterns {
            record.usagePatternsBlob = try encodeOptional(usagePatterns)
        }
        if let insightsGeneratedAt = patch.insightsGeneratedAt {
            record.insightsGeneratedAt = insightsGeneratedAt
        }
        if let insightsVersion = patch.insightsVersion {
            record.insightsVersion = insightsVersion
        }
        if let status = patch.status {
            record.statusRaw = status.rawValue
        }
        if let lastReviewedAt = patch.lastReviewedAt {
            record.lastReviewedAt = lastReviewedAt
        }
        if let nextReviewAt = patch.nextReviewAt {
            record.nextReviewAt = nextReviewAt
        }
        if let easeFactor = patch.easeFactor {
            record.easeFactor = easeFactor
        }
        if let intervalDays = patch.intervalDays {
            record.intervalDays = intervalDays
        }
        if let repetition = patch.repetition {
            record.repetition = repetition
        }
        if let isFavorite = patch.isFavorite {
            record.isFavorite = isFavorite
        }

        record.lastSyncedAt = syncedAt
        record.lastAccessedAt = syncedAt
        try touchProjectAccess(projectId: record.projectId, at: syncedAt)
        try modelContext.save()
    }

    func deleteWord(id: String) throws {
        guard let record = try fetchWordRecord(id: id) else { return }
        modelContext.delete(record)
        try modelContext.save()
    }

    func markProjectAccessed(projectId: String, at: Date = .now) throws {
        try touchProjectAccess(projectId: projectId, at: at)
        let descriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.projectId == projectId }
        )
        let words = try modelContext.fetch(descriptor)
        for word in words {
            word.lastAccessedAt = at
        }
        try modelContext.save()
    }

    func recentProjectIDs(userId: String, limit: Int) throws -> [String] {
        let descriptor = FetchDescriptor<CachedCloudProjectRecord>(
            predicate: #Predicate { $0.userId == userId },
            sortBy: [SortDescriptor(\CachedCloudProjectRecord.lastAccessedAt, order: .reverse)]
        )
        let records = try modelContext.fetch(descriptor)
        return Array(records.prefix(limit).map(\.id))
    }

    func userIdForProject(projectId: String) throws -> String? {
        try fetchProjectRecord(id: projectId)?.userId
    }

    func enforceWordLimit(userId: String, maxWords: Int, protectedProjectIDs: Set<String> = []) throws {
        let descriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.userId == userId }
        )
        let currentWords = try modelContext.fetch(descriptor)
        var total = currentWords.count
        guard total > maxWords else { return }

        let projectDescriptor = FetchDescriptor<CachedCloudProjectRecord>(
            predicate: #Predicate { $0.userId == userId },
            sortBy: [SortDescriptor(\CachedCloudProjectRecord.lastAccessedAt, order: .forward)]
        )
        let projects = try modelContext.fetch(projectDescriptor)

        func removeProject(_ project: CachedCloudProjectRecord) throws {
            let removingProjectId = project.id
            let wordDescriptor = FetchDescriptor<CachedCloudWordRecord>(
                predicate: #Predicate { $0.projectId == removingProjectId && $0.userId == userId }
            )
            let words = try modelContext.fetch(wordDescriptor)
            total -= words.count
            words.forEach { modelContext.delete($0) }
            modelContext.delete(project)
        }

        for project in projects where total > maxWords {
            guard !protectedProjectIDs.contains(project.id) else { continue }
            try removeProject(project)
        }

        if total > maxWords {
            for project in projects where total > maxWords {
                guard protectedProjectIDs.contains(project.id) else { continue }
                try removeProject(project)
            }
        }

        try modelContext.save()
    }

    private func fetchProjectRecord(id: String) throws -> CachedCloudProjectRecord? {
        let descriptor = FetchDescriptor<CachedCloudProjectRecord>(
            predicate: #Predicate { $0.id == id }
        )
        return try modelContext.fetch(descriptor).first
    }

    private func fetchWordRecord(id: String) throws -> CachedCloudWordRecord? {
        let descriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.id == id }
        )
        return try modelContext.fetch(descriptor).first
    }

    private func deleteWords(projectId: String) throws {
        let descriptor = FetchDescriptor<CachedCloudWordRecord>(
            predicate: #Predicate { $0.projectId == projectId }
        )
        let words = try modelContext.fetch(descriptor)
        words.forEach { modelContext.delete($0) }
    }

    private func touchProjectAccess(projectId: String, at: Date) throws {
        guard let project = try fetchProjectRecord(id: projectId) else { return }
        project.lastAccessedAt = at
    }

    private func makeWordRecord(
        userId: String,
        word: Word,
        syncedAt: Date,
        markAsAccessed: Bool
    ) throws -> CachedCloudWordRecord {
        try CachedCloudWordRecord(
            id: word.id,
            userId: userId,
            projectId: word.projectId,
            english: word.english,
            japanese: word.japanese,
            distractorsBlob: JSONEncoder().encode(word.distractors),
            exampleSentence: word.exampleSentence,
            exampleSentenceJa: word.exampleSentenceJa,
            pronunciation: word.pronunciation,
            partOfSpeechTagsBlob: encodeOptional(word.partOfSpeechTags),
            relatedWordsBlob: encodeOptional(word.relatedWords),
            usagePatternsBlob: encodeOptional(word.usagePatterns),
            insightsGeneratedAt: word.insightsGeneratedAt,
            insightsVersion: word.insightsVersion,
            statusRaw: word.status.rawValue,
            createdAt: word.createdAt,
            lastReviewedAt: word.lastReviewedAt,
            nextReviewAt: word.nextReviewAt,
            easeFactor: word.easeFactor,
            intervalDays: word.intervalDays,
            repetition: word.repetition,
            isFavorite: word.isFavorite,
            lastSyncedAt: syncedAt,
            lastAccessedAt: markAsAccessed ? syncedAt : word.createdAt,
            sourceVersion: currentSourceVersion
        )
    }

    private func apply(
        userId: String,
        word: Word,
        to record: CachedCloudWordRecord,
        syncedAt: Date,
        markAsAccessed: Bool
    ) {
        record.userId = userId
        record.projectId = word.projectId
        record.english = word.english
        record.japanese = word.japanese
        record.distractorsBlob = (try? JSONEncoder().encode(word.distractors)) ?? Data()
        record.exampleSentence = word.exampleSentence
        record.exampleSentenceJa = word.exampleSentenceJa
        record.pronunciation = word.pronunciation
        record.partOfSpeechTagsBlob = try? encodeOptional(word.partOfSpeechTags)
        record.relatedWordsBlob = try? encodeOptional(word.relatedWords)
        record.usagePatternsBlob = try? encodeOptional(word.usagePatterns)
        record.insightsGeneratedAt = word.insightsGeneratedAt
        record.insightsVersion = word.insightsVersion
        record.statusRaw = word.status.rawValue
        record.createdAt = word.createdAt
        record.lastReviewedAt = word.lastReviewedAt
        record.nextReviewAt = word.nextReviewAt
        record.easeFactor = word.easeFactor
        record.intervalDays = word.intervalDays
        record.repetition = word.repetition
        record.isFavorite = word.isFavorite
        record.lastSyncedAt = syncedAt
        if markAsAccessed {
            record.lastAccessedAt = syncedAt
        }
        record.sourceVersion = currentSourceVersion
    }

    private func mapProject(_ record: CachedCloudProjectRecord) -> Project {
        Project(
            id: record.id,
            userId: record.userId,
            title: record.title,
            iconImage: record.iconImage,
            createdAt: record.createdAt,
            shareId: record.shareId,
            isFavorite: record.isFavorite,
            sourceLabels: decodeOptional(record.sourceLabelsBlob, as: [String].self) ?? []
        )
    }

    private func mapWord(_ record: CachedCloudWordRecord) -> Word {
        Word(
            id: record.id,
            projectId: record.projectId,
            english: record.english,
            japanese: record.japanese,
            distractors: (try? JSONDecoder().decode([String].self, from: record.distractorsBlob)) ?? [],
            exampleSentence: record.exampleSentence,
            exampleSentenceJa: record.exampleSentenceJa,
            pronunciation: record.pronunciation,
            partOfSpeechTags: decodeOptional(record.partOfSpeechTagsBlob, as: [String].self),
            relatedWords: decodeOptional(record.relatedWordsBlob, as: [RelatedWord].self),
            usagePatterns: decodeOptional(record.usagePatternsBlob, as: [UsagePattern].self),
            insightsGeneratedAt: record.insightsGeneratedAt,
            insightsVersion: record.insightsVersion,
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

    private func encodeOptional<T: Encodable>(_ value: T?) throws -> Data? {
        guard let value else { return nil }
        return try JSONEncoder().encode(value)
    }

    private func decodeOptional<T: Decodable>(_ data: Data?, as _: T.Type) -> T? {
        guard let data else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func deduplicatedWordsByID(_ words: [Word]) -> [Word] {
        guard words.count > 1 else { return words }

        var seenIDs = Set<String>()
        var reversedUniqueWords: [Word] = []
        reversedUniqueWords.reserveCapacity(words.count)

        // Keep the latest value for each ID when duplicates exist.
        for word in words.reversed() {
            if seenIDs.insert(word.id).inserted {
                reversedUniqueWords.append(word)
            }
        }

        return reversedUniqueWords.reversed()
    }
}
