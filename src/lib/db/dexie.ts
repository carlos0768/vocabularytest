import Dexie, { type EntityTable } from 'dexie';
import type { Project, Word } from '@/types';

// Dexie database definition for local IndexedDB storage
// This serves as the Free tier storage backend

export class ScanVocabDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  words!: EntityTable<Word, 'id'>;

  constructor() {
    super('ScanVocabDB');

    this.version(1).stores({
      // Index definitions - only indexed fields listed here
      projects: 'id, userId, createdAt',
      words: 'id, projectId, status, createdAt',
    });

    // Version 2: Add isFavorite for favorite marking
    this.version(2).stores({
      projects: 'id, userId, createdAt',
      words: 'id, projectId, status, createdAt, isFavorite',
    });
  }
}

// Singleton instance
export const db = new ScanVocabDB();
