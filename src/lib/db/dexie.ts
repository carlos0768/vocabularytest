import Dexie, { type EntityTable } from 'dexie';
import type { LexiconEntry, Project, Word, Collection, CollectionProject, GrammarPattern } from '@/types';

// Sync Queue item for offline changes
export interface SyncQueueItem {
  id?: number; // Auto-increment
  operation: 'create' | 'update' | 'delete';
  table: 'projects' | 'words' | 'grammarPatterns';
  entityId: string; // ID of the entity being synced
  data: unknown; // The data to sync
  createdAt: string; // ISO string
  retryCount: number;
}

// Dexie database definition for local IndexedDB storage
// This serves as the Free tier storage backend and offline cache for Pro

export class WordSnapDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  words!: EntityTable<Word, 'id'>;
  lexiconEntries!: EntityTable<LexiconEntry, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  grammarPatterns!: EntityTable<GrammarPattern, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  collectionProjects!: EntityTable<CollectionProject & { id?: number }, 'id'>;

  constructor() {
    super('WordSnapDB');

    this.version(1).stores({
      // Index definitions - only indexed fields listed here
      projects: 'id, userId, createdAt',
      words: 'id, projectId, status, createdAt',
    });

    // Version 2: Add spaced repetition fields
    this.version(2).stores({
      projects: 'id, userId, createdAt',
      words: 'id, projectId, status, createdAt, nextReviewAt',
    });

    // Version 3: Add isFavorite for favorite marking (words)
    this.version(3).stores({
      projects: 'id, userId, createdAt',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite',
    });

    // Version 4: Add isFavorite for project bookmarking
    this.version(4).stores({
      projects: 'id, userId, createdAt, isFavorite',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite',
    });

    // Version 5: Add sync queue for offline support
    this.version(5).stores({
      projects: 'id, userId, createdAt, isFavorite',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite',
      syncQueue: '++id, table, entityId, createdAt',
    });

    // Version 6: Add pronunciation & lexical insight fields (no new indexes needed)
    this.version(6).stores({
      projects: 'id, userId, createdAt, isFavorite',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite',
      syncQueue: '++id, table, entityId, createdAt',
    });

    // Version 7: Add collections, collectionProjects, and local lexicon cache
    this.version(7).stores({
      projects: 'id, userId, createdAt, isFavorite',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite, lexiconEntryId',
      lexiconEntries: 'id, normalizedHeadword, pos, cefrLevel',
      syncQueue: '++id, table, entityId, createdAt',
      collections: 'id, userId, createdAt',
      collectionProjects: '++id, [collectionId+projectId], collectionId, projectId',
    });

    // Version 8: Add grammarPatterns table for grammar learning feature
    this.version(8).stores({
      projects: 'id, userId, createdAt, isFavorite',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite, lexiconEntryId',
      lexiconEntries: 'id, normalizedHeadword, pos, cefrLevel',
      grammarPatterns: 'id, projectId, level, createdAt, nextReviewAt',
      syncQueue: '++id, table, entityId, createdAt',
      collections: 'id, userId, createdAt',
      collectionProjects: '++id, [collectionId+projectId], collectionId, projectId',
    });
  }
}

// Lazy singleton instance - only initialize on client side
let _db: WordSnapDB | null = null;

export function getDb(): WordSnapDB {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is not available on server side');
  }
  if (!_db) {
    try {
      _db = new WordSnapDB();
    } catch (e) {
      console.error('Failed to initialize IndexedDB:', e);
      throw new Error('IndexedDB is not available in this browser');
    }
  }
  return _db;
}

// For backward compatibility - use getDb() instead
// Wrapped in try/catch to handle environments where IndexedDB is unavailable
function createDbSafe(): WordSnapDB | null {
  if (typeof window === 'undefined') return null;
  try {
    return new WordSnapDB();
  } catch (e) {
    console.error('Failed to initialize IndexedDB:', e);
    return null;
  }
}
export const db = createDbSafe() as WordSnapDB;
