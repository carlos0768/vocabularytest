import Dexie, { type EntityTable } from 'dexie';
import type { Project, Word } from '@/types';

// Sync Queue item for offline changes
export interface SyncQueueItem {
  id?: number; // Auto-increment
  operation: 'create' | 'update' | 'delete';
  table: 'projects' | 'words';
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
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

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
