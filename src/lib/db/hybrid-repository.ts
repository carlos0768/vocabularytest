// Hybrid Repository
// Combines local (IndexedDB) and remote (Supabase) storage for Pro users
// Reads from local (fast), writes to both local + sync queue

import type { Word, Project, WordRepository, GrammarEntry } from '@/types';
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

    const lastSync = this.getLastSync();
    const syncedUserId = this.getSyncedUserId();
    const isFirstSync = !lastSync || syncedUserId !== userId;

    if (isFirstSync) {
      console.log('[HybridRepo] First sync (full) for user:', userId);
      await this._fullSyncAll(userId);
    } else {
      console.log('[HybridRepo] Delta sync since:', new Date(lastSync).toISOString());
      await this._deltaSync(userId, new Date(lastSync).toISOString());
    }
  }

  /** Full sync: fetch everything from remote (first sync or user switch) */
  private async _fullSyncAll(userId: string): Promise<void> {
    const db = getDb();

    try {
      // 1. Get local projects for this user
      const localProjects = await db.projects.where('userId').equals(userId).toArray();

      // 2. Get all projects from remote
      const remoteProjects = await remoteRepository.getProjects(userId);

      // 3. Push local-only projects that have a pending create in the sync queue.
      //    Local-only projects WITHOUT a queued create were deleted from another
      //    device and must NOT be re-pushed (fixes "deleted project comes back" bug).
      const remoteProjectIds = new Set(remoteProjects.map(p => p.id));
      const localOnlyProjects = localProjects.filter(p => !remoteProjectIds.has(p.id));

      const pendingItems = await syncQueue.getPending();
      const pendingCreateProjectIds = new Set(
        pendingItems
          .filter(item => item.table === 'projects' && item.operation === 'create')
          .map(item => item.entityId)
      );

      const projectsToPush = localOnlyProjects.filter(p => pendingCreateProjectIds.has(p.id));

      for (const project of projectsToPush) {
        try {
          await remoteRepository.createProjectWithId(project as Project);
          const localWords = await db.words.where('projectId').equals(project.id).toArray();
          if (localWords.length > 0) {
            await remoteRepository.createWordsWithIds(localWords as Word[]);
          }
          const localGrammar = await db.grammarEntries
            .where('projectId')
            .equals(project.id)
            .toArray();
          if (localGrammar.length > 0) {
            await remoteRepository.createGrammarEntriesWithIds(localGrammar);
          }
          console.log('[HybridRepo] Pushed local-only project to remote:', project.id);
        } catch (err) {
          console.error('[HybridRepo] Failed to push local-only project:', project.id, err);
        }
      }

      if (localOnlyProjects.length > projectsToPush.length) {
        console.log('[HybridRepo] Skipped', localOnlyProjects.length - projectsToPush.length, 'local-only projects (deleted on another device)');
      }

      // 4. Re-fetch remote projects (now includes pushed local-only data)
      const mergedProjects = projectsToPush.length > 0
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
        await db.grammarEntries.where('projectId').anyOf(wordsProjectIdsToReplace).delete();
      }

      await db.lexiconEntries.clear();

      if (mergedProjectIds.length > 0) {
        const remoteWordsByProject = await remoteRepository.getAllWordsByProjectIds(mergedProjectIds);
        const remoteWords = mergedProjectIds.flatMap((projectId) => remoteWordsByProject[projectId] ?? []);
        if (remoteWords.length > 0) {
          await db.words.bulkPut(remoteWords);
        }

        const remoteGrammarByProject =
          await remoteRepository.getAllGrammarEntriesByProjectIds(mergedProjectIds);
        const remoteGrammar = mergedProjectIds.flatMap(
          (projectId) => remoteGrammarByProject[projectId] ?? [],
        );
        if (remoteGrammar.length > 0) {
          await db.grammarEntries.bulkPut(remoteGrammar);
        }

        const lexiconEntryIds = [...new Set(remoteWords.map((word) => word.lexiconEntryId).filter(Boolean))] as string[];
        if (lexiconEntryIds.length > 0) {
          const lexiconEntries = await remoteRepository.getLexiconEntriesByIds(lexiconEntryIds);
          if (lexiconEntries.length > 0) {
            await db.lexiconEntries.bulkPut(lexiconEntries);
          }
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

  /**
   * Delta sync: fetch only changes since last sync.
   * - Projects: fetch IDs (lightweight) for deletion detection + updated rows
   * - Words: fetch only updated rows + IDs for deletion detection
   * Reduces I/O from ~hundreds of IOPS to ~tens.
   */
  private async _deltaSync(userId: string, since: string): Promise<void> {
    const db = getDb();

    try {
      // 1. Projects: get remote IDs + updated projects (2 lightweight queries)
      const [remoteProjectIds, updatedProjects] = await Promise.all([
        remoteRepository.getProjectIds(userId),
        remoteRepository.getProjectsUpdatedSince(userId, since),
      ]);

      // 2. Detect deleted projects
      const remoteProjectIdSet = new Set(remoteProjectIds);
      const localProjects = await db.projects.where('userId').equals(userId).toArray();
      const deletedProjectIds = localProjects
        .map(p => p.id)
        .filter(id => !remoteProjectIdSet.has(id));

      // 3. Remove deleted projects + their words + grammar from local
      if (deletedProjectIds.length > 0) {
        await db.projects.bulkDelete(deletedProjectIds);
        await db.words.where('projectId').anyOf(deletedProjectIds).delete();
        await db.grammarEntries.where('projectId').anyOf(deletedProjectIds).delete();
        console.log('[HybridRepo] Delta: removed', deletedProjectIds.length, 'deleted projects');
      }

      // 4. Upsert updated projects
      if (updatedProjects.length > 0) {
        await db.projects.bulkPut(updatedProjects);
        console.log('[HybridRepo] Delta: upserted', updatedProjects.length, 'projects');
      }

      // 5. Words: get updated words + remote IDs for deletion detection
      const activeProjectIds = remoteProjectIds.length > 0 ? remoteProjectIds : [];
      const [updatedWords, remoteWordIds] = await Promise.all([
        remoteRepository.getWordsUpdatedSince(activeProjectIds, since),
        remoteRepository.getWordIdsByProjectIds(activeProjectIds),
      ]);

      // 6. Detect deleted words
      const remoteWordIdSet = new Set(remoteWordIds);
      const localWordIds = (await db.words.where('projectId').anyOf(activeProjectIds).primaryKeys()) as string[];
      const deletedWordIds = localWordIds.filter(id => !remoteWordIdSet.has(id));

      if (deletedWordIds.length > 0) {
        await db.words.bulkDelete(deletedWordIds);
        console.log('[HybridRepo] Delta: removed', deletedWordIds.length, 'deleted words');
      }

      // 7. Upsert updated words
      if (updatedWords.length > 0) {
        await db.words.bulkPut(updatedWords);
        console.log('[HybridRepo] Delta: upserted', updatedWords.length, 'words');

        // 8. Sync lexicon entries for updated words
        const lexiconEntryIds = [...new Set(updatedWords.map(w => w.lexiconEntryId).filter(Boolean))] as string[];
        if (lexiconEntryIds.length > 0) {
          const lexiconEntries = await remoteRepository.getLexiconEntriesByIds(lexiconEntryIds);
          if (lexiconEntries.length > 0) {
            await db.lexiconEntries.bulkPut(lexiconEntries);
          }
        }
      }

      // 9. Grammar entries: delta + deletion detection (same pattern as words)
      const [updatedGrammar, remoteGrammarIds] = await Promise.all([
        remoteRepository.getGrammarEntriesUpdatedSince(activeProjectIds, since),
        remoteRepository.getGrammarEntryIdsByProjectIds(activeProjectIds),
      ]);

      const remoteGrammarIdSet = new Set(remoteGrammarIds);
      const localGrammarIds = (await db.grammarEntries
        .where('projectId')
        .anyOf(activeProjectIds)
        .primaryKeys()) as string[];
      const deletedGrammarIds = localGrammarIds.filter((id) => !remoteGrammarIdSet.has(id));

      if (deletedGrammarIds.length > 0) {
        await db.grammarEntries.bulkDelete(deletedGrammarIds);
        console.log('[HybridRepo] Delta: removed', deletedGrammarIds.length, 'grammar entries');
      }

      if (updatedGrammar.length > 0) {
        await db.grammarEntries.bulkPut(updatedGrammar);
        console.log('[HybridRepo] Delta: upserted', updatedGrammar.length, 'grammar entries');
      }

      // 10. Update sync metadata
      this.setLastSync(Date.now());
      this.setSyncedUserId(userId);

      const totalChanges =
        updatedProjects.length +
        updatedWords.length +
        deletedProjectIds.length +
        deletedWordIds.length +
        updatedGrammar.length +
        deletedGrammarIds.length;
      console.log(
        `[HybridRepo] Delta sync complete: ${totalChanges} changes (${updatedProjects.length}P↑ ${updatedWords.length}W↑ ${updatedGrammar.length}G↑ ${deletedProjectIds.length}P↓ ${deletedWordIds.length}W↓ ${deletedGrammarIds.length}G↓)`,
      );
    } catch (error) {
      console.error('[HybridRepo] Delta sync failed, falling back to full sync:', error);
      // If delta sync fails, fall back to full sync
      await this._fullSyncAll(userId);
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

  async createProject(
    project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }
  ): Promise<Project> {
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

  // ============ Grammar Entries ============

  async createGrammarEntries(
    entries: Omit<GrammarEntry, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<GrammarEntry[]> {
    const created = await localRepository.createGrammarEntries(entries);

    if (isOnline()) {
      try {
        await remoteRepository.createGrammarEntriesWithIds(created);
      } catch (error) {
        console.error('[HybridRepo] Remote create grammar failed, queuing:', error);
        for (const entry of created) {
          await syncQueue.add({
            operation: 'create',
            table: 'grammarEntries',
            entityId: entry.id,
            data: entry,
          });
        }
      }
    } else {
      for (const entry of created) {
        await syncQueue.add({
          operation: 'create',
          table: 'grammarEntries',
          entityId: entry.id,
          data: entry,
        });
      }
    }

    return created;
  }

  async getGrammarEntries(projectId: string): Promise<GrammarEntry[]> {
    return localRepository.getGrammarEntries(projectId);
  }

  async getGrammarEntry(id: string): Promise<GrammarEntry | undefined> {
    return localRepository.getGrammarEntry(id);
  }

  async updateGrammarEntry(id: string, updates: Partial<GrammarEntry>): Promise<void> {
    await localRepository.updateGrammarEntry(id, updates);

    if (isOnline()) {
      try {
        await remoteRepository.updateGrammarEntry(id, updates);
      } catch (error) {
        console.error('[HybridRepo] Remote update grammar failed, queuing:', error);
        await syncQueue.add({
          operation: 'update',
          table: 'grammarEntries',
          entityId: id,
          data: { id, updates },
        });
      }
    } else {
      await syncQueue.add({
        operation: 'update',
        table: 'grammarEntries',
        entityId: id,
        data: { id, updates },
      });
    }
  }

  async deleteGrammarEntry(id: string): Promise<void> {
    await localRepository.deleteGrammarEntry(id);

    if (isOnline()) {
      try {
        await remoteRepository.deleteGrammarEntry(id);
      } catch (error) {
        console.error('[HybridRepo] Remote delete grammar failed, queuing:', error);
        await syncQueue.add({
          operation: 'delete',
          table: 'grammarEntries',
          entityId: id,
          data: { id },
        });
      }
    } else {
      await syncQueue.add({
        operation: 'delete',
        table: 'grammarEntries',
        entityId: id,
        data: { id },
      });
    }
  }

  async deleteGrammarEntriesByProject(projectId: string): Promise<void> {
    await localRepository.deleteGrammarEntriesByProject(projectId);

    if (isOnline()) {
      try {
        await remoteRepository.deleteGrammarEntriesByProject(projectId);
      } catch (error) {
        console.error('[HybridRepo] Remote delete grammar by project failed:', error);
        // Don't queue — project deletion cascades on Supabase.
      }
    }
  }
}

export const hybridRepository = new HybridWordRepository();
