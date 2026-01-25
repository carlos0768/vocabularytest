import Dexie, { type EntityTable } from 'dexie';
import type { Project, Word } from '@/types';

// Dexie database definition for local IndexedDB storage
// This serves as the Free tier storage backend

export class WordSnapDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  words!: EntityTable<Word, 'id'>;

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

    // Version 3: Add isFavorite for favorite marking
    this.version(3).stores({
      projects: 'id, userId, createdAt',
      words: 'id, projectId, status, createdAt, nextReviewAt, isFavorite',
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
    _db = new WordSnapDB();
  }
  return _db;
}

// For backward compatibility - use getDb() instead
export const db = typeof window !== 'undefined' ? new WordSnapDB() : (null as unknown as WordSnapDB);
