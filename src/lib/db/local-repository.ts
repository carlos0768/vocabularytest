import { v4 as uuidv4 } from 'uuid';
import { getDb } from './dexie';
import type { Project, Word, WordRepository } from '@/types';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';

// Local implementation of WordRepository using Dexie (IndexedDB)
// Used for Free tier users - data stays on device

export class LocalWordRepository implements WordRepository {
  // ============ Projects ============

  async createProject(
    project: Omit<Project, 'id' | 'createdAt'>
  ): Promise<Project> {
    const db = getDb();
    const newProject: Project = {
      ...project,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      isSynced: false,
    };

    await db.projects.add(newProject);
    return newProject;
  }

  async getProjects(userId: string): Promise<Project[]> {
    const db = getDb();
    return db.projects
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('createdAt');
  }

  async getProject(id: string): Promise<Project | undefined> {
    const db = getDb();
    return db.projects.get(id);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const db = getDb();
    await db.projects.update(id, updates);
  }

  async deleteProject(id: string): Promise<void> {
    const db = getDb();
    // Delete all words in the project first
    await this.deleteWordsByProject(id);
    await db.projects.delete(id);
  }

  // ============ Words ============

  async createWords(
    words: Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>[]
  ): Promise<Word[]> {
    const db = getDb();
    const now = new Date().toISOString();
    const defaultSR = getDefaultSpacedRepetitionFields();
    const newWords: Word[] = words.map((word) => ({
      ...word,
      ...defaultSR,
      id: uuidv4(),
      createdAt: now,
      isFavorite: false,
      status: 'new' as const,
    }));

    await db.words.bulkAdd(newWords);
    return newWords;
  }

  async getWords(projectId: string): Promise<Word[]> {
    const db = getDb();
    return db.words.where('projectId').equals(projectId).toArray();
  }

  async getWord(id: string): Promise<Word | undefined> {
    const db = getDb();
    return db.words.get(id);
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const db = getDb();
    await db.words.update(id, updates);
  }

  async deleteWord(id: string): Promise<void> {
    const db = getDb();
    await db.words.delete(id);
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    const db = getDb();
    await db.words.where('projectId').equals(projectId).delete();
  }

  // ============ Bulk Operations for Sync ============

  async getAllProjectsForSync(): Promise<Project[]> {
    const db = getDb();
    return db.projects.where('isSynced').equals(0).toArray();
  }

  async markProjectsSynced(projectIds: string[]): Promise<void> {
    const db = getDb();
    await db.projects
      .where('id')
      .anyOf(projectIds)
      .modify({ isSynced: true });
  }

  async clearAllData(): Promise<void> {
    const db = getDb();
    await db.projects.clear();
    await db.words.clear();
  }
}

// Export singleton for use throughout the app
export const localRepository = new LocalWordRepository();
