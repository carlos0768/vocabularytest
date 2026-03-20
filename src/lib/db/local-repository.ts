import { v4 as uuidv4 } from 'uuid';
import { getDb } from './dexie';
import type { LexiconEntry, Project, Word, WordRepository, Collection, CollectionProject } from '@/types';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import { normalizeSourceLabels } from '../../../shared/source-labels';

// Local implementation of WordRepository using Dexie (IndexedDB)
// Used for Free tier users - data stays on device

export class LocalWordRepository implements WordRepository {
  // ============ Projects ============

  async createProject(
    project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }
  ): Promise<Project> {
    const db = getDb();
    const newProject: Project = {
      ...project,
      sourceLabels: normalizeSourceLabels(project.sourceLabels),
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      isSynced: false,
    };

    await db.projects.add(newProject);
    return newProject;
  }

  async getProjects(userId: string): Promise<Project[]> {
    const db = getDb();
    const projects = await db.projects
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('createdAt');
    return projects.map((project) => ({
      ...project,
      sourceLabels: normalizeSourceLabels(project.sourceLabels),
    }));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const db = getDb();
    const project = await db.projects.get(id);
    if (!project) return undefined;
    return {
      ...project,
      sourceLabels: normalizeSourceLabels(project.sourceLabels),
    };
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const db = getDb();
    const normalizedUpdates: Partial<Project> = {
      ...updates,
      ...(updates.sourceLabels !== undefined
        ? { sourceLabels: normalizeSourceLabels(updates.sourceLabels) }
        : {}),
    };
    await db.projects.update(id, normalizedUpdates);
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

  /**
   * 全単語を1回のIndexedDBクエリで取得し、projectId別にグループ化して返す。
   */
  async getAllWordsByProject(projectIds: string[]): Promise<Record<string, Word[]>> {
    const db = getDb();
    const projectIdSet = new Set(projectIds);
    const allWords = await db.words
      .where('projectId')
      .anyOf(projectIds)
      .toArray();

    const grouped: Record<string, Word[]> = {};
    for (const pid of projectIdSet) {
      grouped[pid] = [];
    }
    for (const word of allWords) {
      if (grouped[word.projectId]) {
        grouped[word.projectId].push(word);
      }
    }
    return grouped;
  }

  /**
   * 全単語数を1回のIndexedDBカウントで取得（オブジェクト生成なし）。
   */
  async getTotalWordCount(): Promise<number> {
    const db = getDb();
    return db.words.count();
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
    const projects = await db.projects.where('isSynced').equals(0).toArray();
    return projects.map((project) => ({
      ...project,
      sourceLabels: normalizeSourceLabels(project.sourceLabels),
    }));
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
    await db.lexiconEntries.clear();
  }

  async cacheLexiconEntries(entries: LexiconEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const db = getDb();
    await db.lexiconEntries.bulkPut(entries);
  }

  // ============ Collections (Local / Free tier) ============

  async getCollections(userId: string): Promise<Collection[]> {
    const db = getDb();
    return db.collections
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('createdAt');
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    const db = getDb();
    return db.collections.get(id);
  }

  async createCollection(input: { userId: string; name: string; description?: string }): Promise<Collection> {
    const db = getDb();
    const now = new Date().toISOString();
    const collection: Collection = {
      id: uuidv4(),
      userId: input.userId,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    await db.collections.add(collection);
    return collection;
  }

  async updateCollection(id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>): Promise<void> {
    const db = getDb();
    await db.collections.update(id, { ...updates, updatedAt: new Date().toISOString() });
  }

  async deleteCollection(id: string): Promise<void> {
    const db = getDb();
    // Delete all collection-project links first
    await db.collectionProjects.where('collectionId').equals(id).delete();
    await db.collections.delete(id);
  }

  async getCollectionProjects(collectionId: string): Promise<CollectionProject[]> {
    const db = getDb();
    const rows = await db.collectionProjects
      .where('collectionId')
      .equals(collectionId)
      .sortBy('sortOrder');
    return rows.map(({ id: _id, ...cp }) => cp as CollectionProject);
  }

  async addProjectsToCollection(collectionId: string, projectIds: string[]): Promise<void> {
    const db = getDb();
    // Get existing to determine max sort order
    const existing = await db.collectionProjects
      .where('collectionId')
      .equals(collectionId)
      .toArray();
    const existingSet = new Set(existing.map((e) => e.projectId));
    let maxOrder = existing.reduce((m, e) => Math.max(m, e.sortOrder), -1);

    const now = new Date().toISOString();
    const toAdd = projectIds
      .filter((pid) => !existingSet.has(pid))
      .map((pid) => ({
        collectionId,
        projectId: pid,
        sortOrder: ++maxOrder,
        addedAt: now,
      }));

    if (toAdd.length > 0) {
      await db.collectionProjects.bulkAdd(toAdd);
    }
  }

  async removeProjectFromCollection(collectionId: string, projectId: string): Promise<void> {
    const db = getDb();
    await db.collectionProjects
      .where('[collectionId+projectId]')
      .equals([collectionId, projectId])
      .delete();
  }

  async getCollectionStats(
    collectionIds: string[]
  ): Promise<Record<string, { projectCount: number; wordCount: number; masteredCount: number }>> {
    const db = getDb();
    const result: Record<string, { projectCount: number; wordCount: number; masteredCount: number }> = {};
    for (const cid of collectionIds) {
      result[cid] = { projectCount: 0, wordCount: 0, masteredCount: 0 };
    }

    const allLinks = await db.collectionProjects
      .where('collectionId')
      .anyOf(collectionIds)
      .toArray();

    // Group projectIds by collection
    const collectionProjectMap: Record<string, string[]> = {};
    for (const link of allLinks) {
      if (!collectionProjectMap[link.collectionId]) collectionProjectMap[link.collectionId] = [];
      collectionProjectMap[link.collectionId].push(link.projectId);
    }

    // Get unique project IDs
    const uniqueProjectIds = [...new Set(allLinks.map((l) => l.projectId))];
    if (uniqueProjectIds.length === 0) return result;

    // Get all words for these projects
    const allWords = await db.words
      .where('projectId')
      .anyOf(uniqueProjectIds)
      .toArray();

    // Aggregate per project
    const projectWordCounts: Record<string, { total: number; mastered: number }> = {};
    for (const word of allWords) {
      if (!projectWordCounts[word.projectId]) {
        projectWordCounts[word.projectId] = { total: 0, mastered: 0 };
      }
      projectWordCounts[word.projectId].total++;
      if (word.status === 'mastered') projectWordCounts[word.projectId].mastered++;
    }

    // Aggregate per collection
    for (const cid of collectionIds) {
      const pids = collectionProjectMap[cid] || [];
      result[cid].projectCount = pids.length;
      for (const pid of pids) {
        const wc = projectWordCounts[pid];
        if (wc) {
          result[cid].wordCount += wc.total;
          result[cid].masteredCount += wc.mastered;
        }
      }
    }

    return result;
  }

  async getCollectionPreviews(
    collectionIds: string[]
  ): Promise<Record<string, { id: string; title: string; iconImage?: string }[]>> {
    const db = getDb();
    const result: Record<string, { id: string; title: string; iconImage?: string }[]> = {};
    for (const cid of collectionIds) {
      result[cid] = [];
    }

    const allLinks = await db.collectionProjects
      .where('collectionId')
      .anyOf(collectionIds)
      .toArray();

    // Group by collection (sorted by sortOrder) and take first 3
    const grouped: Record<string, string[]> = {};
    for (const link of allLinks) {
      if (!grouped[link.collectionId]) grouped[link.collectionId] = [];
      grouped[link.collectionId].push(link.projectId);
    }

    const previewProjectIds = new Set<string>();
    for (const cid of collectionIds) {
      const pids = (grouped[cid] || []).slice(0, 3);
      for (const pid of pids) previewProjectIds.add(pid);
    }

    if (previewProjectIds.size === 0) return result;

    // Fetch projects
    const projects = await db.projects
      .where('id')
      .anyOf([...previewProjectIds])
      .toArray();
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    for (const cid of collectionIds) {
      const pids = (grouped[cid] || []).slice(0, 3);
      const previews: { id: string; title: string; iconImage?: string }[] = [];
      for (const pid of pids) {
        const p = projectMap.get(pid);
        if (p) previews.push({ id: p.id, title: p.title, iconImage: p.iconImage });
      }
      result[cid] = previews;
    }

    return result;
  }

  /**
   * Get all words for multiple projects, grouped by projectId.
   * (Alias for compatibility with collection detail page)
   */
  async getAllWordsByProjectIds(projectIds: string[]): Promise<Record<string, Word[]>> {
    return this.getAllWordsByProject(projectIds);
  }
}

// Export singleton for use throughout the app
export const localRepository = new LocalWordRepository();
