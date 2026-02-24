// Readonly Remote Repository
// For downgraded Pro→Free users: reads from Supabase, blocks all writes.
// This allows cancelled/past_due users to continue viewing their cloud data.

import type { Word, Project, WordRepository } from '@/types';
import { remoteRepository } from './remote-repository';

const READONLY_ERROR = 'このデータは読み取り専用です。編集するにはProプランに再登録してください。';

export class ReadonlyRemoteRepository implements WordRepository {
  // ============ Projects (read-only) ============

  async createProject(_project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    throw new Error(READONLY_ERROR);
  }

  async getProjects(userId: string): Promise<Project[]> {
    return remoteRepository.getProjects(userId);
  }

  async getProject(id: string): Promise<Project | undefined> {
    return remoteRepository.getProject(id);
  }

  async updateProject(_id: string, _updates: Partial<Project>): Promise<void> {
    throw new Error(READONLY_ERROR);
  }

  async deleteProject(_id: string): Promise<void> {
    throw new Error(READONLY_ERROR);
  }

  // ============ Words (read-only, except status updates) ============

  async createWords(
    _words: Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>[]
  ): Promise<Word[]> {
    throw new Error(READONLY_ERROR);
  }

  async getWords(projectId: string): Promise<Word[]> {
    return remoteRepository.getWords(projectId);
  }

  async getWord(id: string): Promise<Word | undefined> {
    return remoteRepository.getWord(id);
  }

  // Allow word updates (status, favorite, spaced repetition fields)
  // so users can continue learning with their existing data
  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    return remoteRepository.updateWord(id, updates);
  }

  async deleteWord(_id: string): Promise<void> {
    throw new Error(READONLY_ERROR);
  }

  async deleteWordsByProject(_projectId: string): Promise<void> {
    throw new Error(READONLY_ERROR);
  }
}

export const readonlyRemoteRepository = new ReadonlyRemoteRepository();
