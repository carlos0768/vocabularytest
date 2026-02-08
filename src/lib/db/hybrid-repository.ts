// Hybrid Repository
// Combines local (IndexedDB) and remote (Supabase) storage for Pro users
// Reads from local (fast), writes to both local + sync queue

import type { Word, Project, WordRepository } from '@/types';
import { localRepository } from './local-repository';
import { remoteRepository } from './remote-repository';
import { syncQueue } from './sync-queue';
import { getDb } from './dexie';

// Check if online
function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

// Sync status stored in localStorage
const LAST_SYNC_KEY = 'scanvocab_last_sync';
const SYNC_USER_KEY = 'scanvocab_sync_user';
export const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export function shouldRunFullSync(
  lastSync: number | null,
  syncedUserId: string | null,
  userId: string,
  now: number = Date.now()
): boolean {
  if (syncedUserId !== userId) return true;
  if (!lastSync || Number.isNaN(lastSync)) return true;
  return now - lastSync >= FULL_SYNC_INTERVAL_MS;
}

export class HybridWordRepository implements WordRepository {
  // Get last sync timestamp
  getLastSync(): number | null {
    if (typeof localStorage === 'undefined') return null;
    const value = localStorage.getItem(LAST_SYNC_KEY);
    return value ? parseInt(value, 10) : null;
  }

  // Set last sync timestamp
  setLastSync(timestamp: number): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_KEY, String(timestamp));
    }
  }

  // Get synced user ID
  getSyncedUserId(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(SYNC_USER_KEY);
  }

  // Set synced user ID
  setSyncedUserId(userId: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_USER_KEY, userId);
    }
  }

  // Clear sync data (on logout)
  clearSyncData(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LAST_SYNC_KEY);
      localStorage.removeItem(SYNC_USER_KEY);
    }
  }

  // Full sync: Download all data from Supabase to local
  async fullSync(userId: string): Promise<void> {
    if (!isOnline()) {
      console.log('[HybridRepo] Offline, skipping full sync');
      return;
    }

    console.log('[HybridRepo] Starting full sync for user:', userId);
    const db = getDb();

    try {
      // 1. Get local projects for this user
      const localProjects = await db.projects.where('userId').equals(userId).toArray();

      // 2. Get all projects from remote
      const remoteProjects = await remoteRepository.getProjects(userId);

      // 3. Push local-only projects to remote before overwriting
      const remoteProjectIds = new Set(remoteProjects.map(p => p.id));
      const localOnlyProjects = localProjects.filter(p => !remoteProjectIds.has(p.id));

      for (const project of localOnlyProjects) {
        try {
          await remoteRepository.createProjectWithId(project as Project);
          const localWords = await db.words.where('projectId').equals(project.id).toArray();
          if (localWords.length > 0) {
            await remoteRepository.createWordsWithIds(localWords as Word[]);
          }
          console.log('[HybridRepo] Pushed local-only project to remote:', project.id);
        } catch (err) {
          console.error('[HybridRepo] Failed to push local-only project:', project.id, err);
        }
      }

      // 4. Re-fetch remote projects (now includes pushed local-only data)
      const mergedProjects = localOnlyProjects.length > 0
        ? await remoteRepository.getProjects(userId)
        : remoteProjects;

      // 5. Safety: skip local delete if remote is empty but local has data
      if (mergedProjects.length === 0 && localProjects.length > 0) {
        console.warn('[HybridRepo] Remote is empty but local has data — skipping destructive sync');
        this.setLastSync(Date.now());
        this.setSyncedUserId(userId);
        return;
      }

      // 6. Replace local with merged remote data
      await db.projects.where('userId').equals(userId).delete();
      if (mergedProjects.length > 0) {
        await db.projects.bulkPut(mergedProjects);
      }

      // 7. Sync words in bulk to avoid project-by-project N+1 fetches
      const mergedProjectIds = mergedProjects.map((project) => project.id);
      const localProjectIds = localProjects.map((project) => project.id);
      const wordsProjectIdsToReplace = [...new Set([...localProjectIds, ...mergedProjectIds])];

      if (wordsProjectIdsToReplace.length > 0) {
        await db.words.where('projectId').anyOf(wordsProjectIdsToReplace).delete();
      }

      if (mergedProjectIds.length > 0) {
        const remoteWordsByProject = await remoteRepository.getAllWordsByProjectIds(mergedProjectIds);
        const remoteWords = mergedProjectIds.flatMap((projectId) => remoteWordsByProject[projectId] ?? []);
        if (remoteWords.length > 0) {
          await db.words.bulkPut(remoteWords);
        }
      }

      // 8. Clear sync queue (we're now in sync)
      await syncQueue.clear();

      // 9. Update sync metadata
      this.setLastSync(Date.now());
      this.setSyncedUserId(userId);

      console.log('[HybridRepo] Full sync complete');
    } catch (error) {
      console.error('[HybridRepo] Full sync failed:', error);
      throw error;
    }
  }

  // Process pending sync queue
  async processSyncQueue(): Promise<void> {
    if (!isOnline()) {
      console.log('[HybridRepo] Offline, skipping sync queue processing');
      return;
    }

    const result = await syncQueue.process();
    console.log('[HybridRepo] Sync queue processed:', result);
  }

  // ============ Projects ============

  async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    // 1. Create locally first (generates ID)
    const created = await localRepository.createProject(project);

    // 2. If online, create remotely immediately (with same ID)
    if (isOnline()) {
      try {
        await remoteRepository.createProjectWithId(created);
      } catch (error) {
        console.error('[HybridRepo] Remote create failed, queuing:', error);
        await syncQueue.add({
          operation: 'create',
          table: 'projects',
          entityId: created.id,
          data: created,
        });
      }
    } else {
      // Queue for later sync
      await syncQueue.add({
        operation: 'create',
        table: 'projects',
        entityId: created.id,
        data: created,
      });
    }

    return created;
  }

  async getProjects(userId: string): Promise<Project[]> {
    // Always read from local (fast)
    return localRepository.getProjects(userId);
  }

  async getProject(id: string): Promise<Project | undefined> {
    // Always read from local
    return localRepository.getProject(id);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    // 1. Update locally
    await localRepository.updateProject(id, updates);

    // 2. Sync to remote
    if (isOnline()) {
      try {
        await remoteRepository.updateProject(id, updates);
      } catch (error) {
        console.error('[HybridRepo] Remote update failed, queuing:', error);
        await syncQueue.add({
          operation: 'update',
          table: 'projects',
          entityId: id,
          data: { id, updates },
        });
      }
    } else {
      await syncQueue.add({
        operation: 'update',
        table: 'projects',
        entityId: id,
        data: { id, updates },
      });
    }
  }

  async deleteProject(id: string): Promise<void> {
    // 1. Delete locally
    await localRepository.deleteProject(id);

    // 2. Sync to remote
    if (isOnline()) {
      try {
        await remoteRepository.deleteProject(id);
      } catch (error) {
        console.error('[HybridRepo] Remote delete failed, queuing:', error);
        await syncQueue.add({
          operation: 'delete',
          table: 'projects',
          entityId: id,
          data: { id },
        });
      }
    } else {
      await syncQueue.add({
        operation: 'delete',
        table: 'projects',
        entityId: id,
        data: { id },
      });
    }
  }

  // ============ Words ============

  async createWords(
    words: Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>[]
  ): Promise<Word[]> {
    // 1. Create locally first
    const created = await localRepository.createWords(words);

    // 2. Sync to remote (with same IDs)
    if (isOnline()) {
      try {
        await remoteRepository.createWordsWithIds(created);
      } catch (error) {
        console.error('[HybridRepo] Remote create words failed, queuing:', error);
        for (const word of created) {
          await syncQueue.add({
            operation: 'create',
            table: 'words',
            entityId: word.id,
            data: word,
          });
        }
      }
    } else {
      for (const word of created) {
        await syncQueue.add({
          operation: 'create',
          table: 'words',
          entityId: word.id,
          data: word,
        });
      }
    }

    return created;
  }

  async getWords(projectId: string): Promise<Word[]> {
    // Always read from local
    return localRepository.getWords(projectId);
  }

  async getWord(id: string): Promise<Word | undefined> {
    // Always read from local
    return localRepository.getWord(id);
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    // 1. Update locally
    await localRepository.updateWord(id, updates);

    // 2. Sync to remote
    if (isOnline()) {
      try {
        await remoteRepository.updateWord(id, updates);
      } catch (error) {
        console.error('[HybridRepo] Remote update word failed, queuing:', error);
        await syncQueue.add({
          operation: 'update',
          table: 'words',
          entityId: id,
          data: { id, updates },
        });
      }
    } else {
      await syncQueue.add({
        operation: 'update',
        table: 'words',
        entityId: id,
        data: { id, updates },
      });
    }
  }

  async deleteWord(id: string): Promise<void> {
    // 1. Delete locally
    await localRepository.deleteWord(id);

    // 2. Sync to remote
    if (isOnline()) {
      try {
        await remoteRepository.deleteWord(id);
      } catch (error) {
        console.error('[HybridRepo] Remote delete word failed, queuing:', error);
        await syncQueue.add({
          operation: 'delete',
          table: 'words',
          entityId: id,
          data: { id },
        });
      }
    } else {
      await syncQueue.add({
        operation: 'delete',
        table: 'words',
        entityId: id,
        data: { id },
      });
    }
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    // 1. Delete locally
    await localRepository.deleteWordsByProject(projectId);

    // 2. Sync to remote
    if (isOnline()) {
      try {
        await remoteRepository.deleteWordsByProject(projectId);
      } catch (error) {
        console.error('[HybridRepo] Remote delete words failed:', error);
        // Don't queue this - project deletion will cascade
      }
    }
  }
}

export const hybridRepository = new HybridWordRepository();
