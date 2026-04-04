import { createBrowserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Word, WordRepository } from '@/types';
import type { Collection, CollectionProject, LexiconEntry } from '@/types';
import {
  hasMissingProjectSourceLabelsColumn,
  insertProjectWithSourceLabelsCompat,
  updateProjectSourceLabelsCompat,
} from '@/lib/supabase/project-source-labels-compat';
import { normalizeLexiconTranslation } from '../../../shared/lexicon';
import {
  mapProjectFromRow,
  mapProjectToInsert,
  mapProjectToInsertWithId,
  mapProjectUpdates,
  mapWordFromRow,
  mapWordUpdates,
  mapCollectionFromRow,
  mapCollectionToInsert,
  mapCollectionUpdates,
  mapCollectionProjectFromRow,
  type ProjectRow,
  type WordRow,
  type WordInput,
  type CollectionRow,
  type CollectionProjectRow,
} from '../../../shared/db';
import { RESOLVED_WORD_SELECT_COLUMNS, SHARE_VIEW_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';

// Remote implementation of WordRepository using Supabase
// Used for Pro tier users - data synced across devices

export const WORDS_SELECT_COLUMNS = RESOLVED_WORD_SELECT_COLUMNS;

export class RemoteWordRepository implements WordRepository {
  private _supabase: SupabaseClient | null = null;

  // Lazy initialization to avoid SSR issues
  private get supabase(): SupabaseClient {
    if (!this._supabase) {
      this._supabase = createBrowserClient();
    }
    return this._supabase;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  // ============ Projects ============

  async createProject(
    project: Omit<Project, 'id' | 'createdAt' | 'sourceLabels'> & { sourceLabels?: string[] }
  ): Promise<Project> {
    const { data, error, usedLegacyColumns } = await insertProjectWithSourceLabelsCompat<ProjectRow>(
      this.supabase,
      mapProjectToInsert(project),
    );

    if (error) throw new Error(`Failed to create project: ${error.message}`);
    if (usedLegacyColumns) {
      console.warn('[RemoteRepo] projects.source_labels compatibility fallback used on createProject');
    }

    return mapProjectFromRow(data as ProjectRow);
  }

  async getProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get projects: ${error.message}`);

    return (data as ProjectRow[]).map(mapProjectFromRow);
  }

  /** Fetch only project IDs for a user (lightweight, for deletion detection) */
  async getProjectIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to get project IDs: ${error.message}`);
    return (data as { id: string }[]).map(r => r.id);
  }

  /** Fetch projects updated after a given timestamp */
  async getProjectsUpdatedSince(userId: string, since: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', since)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get updated projects: ${error.message}`);
    return (data as ProjectRow[]).map(mapProjectFromRow);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return mapProjectFromRow(data as ProjectRow);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const sourceLabels = updates.sourceLabels;
    const updatesWithoutSourceLabels = { ...updates };
    delete updatesWithoutSourceLabels.sourceLabels;

    const mappedUpdates = mapProjectUpdates(updatesWithoutSourceLabels);
    if (Object.keys(mappedUpdates).length > 0) {
      const { error } = await this.supabase
        .from('projects')
        .update(mappedUpdates)
        .eq('id', id);

      if (error) throw new Error(`Failed to update project: ${error.message}`);
    }

    if (sourceLabels !== undefined) {
      const { error, usedLegacyColumns } = await updateProjectSourceLabelsCompat(
        this.supabase,
        id,
        sourceLabels,
      );

      if (usedLegacyColumns) {
        console.warn('[RemoteRepo] projects.source_labels compatibility fallback used on updateProject');
      }
      if (error) throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  async deleteProject(id: string): Promise<void> {
    // Words are deleted automatically via CASCADE
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  // ============ ID-preserving upserts (for hybrid sync) ============

  async createProjectWithId(project: Project): Promise<void> {
    const payload = mapProjectToInsertWithId(project);
    const { error } = await this.supabase
      .from('projects')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });

    if (!error) return;

    if (!hasMissingProjectSourceLabelsColumn(error)) {
      throw new Error(`Failed to upsert project: ${error.message}`);
    }

    const legacyPayload = { ...payload };
    delete (legacyPayload as { source_labels?: string[] }).source_labels;

    const { error: legacyError } = await this.supabase
      .from('projects')
      .upsert(legacyPayload, { onConflict: 'id', ignoreDuplicates: true });

    if (legacyError) throw new Error(`Failed to upsert project: ${legacyError.message}`);
    console.warn('[RemoteRepo] projects.source_labels compatibility fallback used on createProjectWithId');
  }

  async createWordsWithIds(words: Word[]): Promise<void> {
    if (words.length === 0) return;
    const response = await fetch('/api/words/create', {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({
        words: words.map((word) => ({
          id: word.id,
          projectId: word.projectId,
          english: word.english,
          japanese: word.japanese,
          vocabularyType: word.vocabularyType ?? null,
          japaneseSource: word.japaneseSource,
          lexiconEntryId: word.lexiconEntryId,
          distractors: word.distractors,
          exampleSentence: word.exampleSentence,
          exampleSentenceJa: word.exampleSentenceJa,
          pronunciation: word.pronunciation,
          partOfSpeechTags: word.partOfSpeechTags,
          relatedWords: word.relatedWords,
          usagePatterns: word.usagePatterns,
          insightsGeneratedAt: word.insightsGeneratedAt,
          insightsVersion: word.insightsVersion,
          status: word.status,
          createdAt: word.createdAt,
          lastReviewedAt: word.lastReviewedAt,
          nextReviewAt: word.nextReviewAt,
          easeFactor: word.easeFactor,
          intervalDays: word.intervalDays,
          repetition: word.repetition,
          isFavorite: word.isFavorite,
        })),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Failed to upsert words');
    }
  }

  // ============ Words ============

  async createWords(words: WordInput[]): Promise<Word[]> {
    const response = await fetch('/api/words/create', {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify({ words }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || 'Failed to create words');
    }

    return (payload.words as Word[]) ?? [];
  }

  async getLexiconEntriesByIds(ids: string[]): Promise<LexiconEntry[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase
      .from('lexicon_entries')
      .select('id, headword, normalized_headword, pos, cefr_level, dataset_sources, translation_ja, translation_source, created_at, updated_at')
      .in('id', ids);

    if (error) throw new Error(`Failed to get lexicon entries: ${error.message}`);

    return (data || []).map((row) => ({
      id: row.id as string,
      headword: row.headword as string,
      normalizedHeadword: row.normalized_headword as string,
      pos: row.pos as string,
      cefrLevel: (row.cefr_level as string | null) ?? undefined,
      datasetSources: (row.dataset_sources as string[] | null) ?? [],
      translationJa: normalizeLexiconTranslation(row.translation_ja as string | null) ?? undefined,
      translationSource: (row.translation_source as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }

  async getWords(projectId: string): Promise<Word[]> {
    const { data, error } = await this.supabase
      .from('words')
      .select(WORDS_SELECT_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
  }

  /**
   * Lightweight word fetch for shared project viewing and import.
   * Omits heavy fields (related_words, usage_patterns, SM-2 fields) not needed for share display.
   */
  async getWordsForShareView(projectId: string): Promise<Word[]> {
    const { data, error } = await this.supabase
      .from('words')
      .select(SHARE_VIEW_WORD_SELECT_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get shared words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
  }

  async getWord(id: string): Promise<Word | undefined> {
    const { data, error } = await this.supabase
      .from('words')
      .select(WORDS_SELECT_COLUMNS)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get word: ${error.message}`);
    }

    return mapWordFromRow(data as WordRow);
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    const { error } = await this.supabase
      .from('words')
      .update(mapWordUpdates(updates))
      .eq('id', id);

    if (error) throw new Error(`Failed to update word: ${error.message}`);
  }

  async deleteWord(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('words')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete word: ${error.message}`);
  }

  async deleteWordsByProject(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('words')
      .delete()
      .eq('project_id', projectId);

    if (error) throw new Error(`Failed to delete words: ${error.message}`);
  }

  // ============ Bulk Queries ============

  /**
   * ユーザーの全単語を1回のSupabaseクエリで取得し、projectId別にグループ化。
   * 62個の並列クエリ(~800ms)を1クエリ(~100ms)に削減。
   * words テーブルにはuser_idカラムがないため、project_idのIN句で取得。
   */
  async getAllWordsByProjectIds(projectIds: string[]): Promise<Record<string, Word[]>> {
    if (projectIds.length === 0) return {};

    const { data, error } = await this.supabase
      .from('words')
      .select(WORDS_SELECT_COLUMNS)
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get all words: ${error.message}`);

    const grouped: Record<string, Word[]> = {};
    for (const pid of projectIds) {
      grouped[pid] = [];
    }
    for (const row of (data as WordRow[])) {
      const word = mapWordFromRow(row);
      if (grouped[word.projectId]) {
        grouped[word.projectId].push(word);
      }
    }
    return grouped;
  }

  /** Fetch words updated after a given timestamp (delta sync) */
  async getWordsUpdatedSince(projectIds: string[], since: string): Promise<Word[]> {
    if (projectIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('words')
      .select(WORDS_SELECT_COLUMNS)
      .in('project_id', projectIds)
      .gt('updated_at', since);

    if (error) throw new Error(`Failed to get updated words: ${error.message}`);
    return (data as WordRow[]).map(mapWordFromRow);
  }

  /** Fetch only word IDs for given projects (lightweight, for deletion detection) */
  async getWordIdsByProjectIds(projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('words')
      .select('id')
      .in('project_id', projectIds);

    if (error) throw new Error(`Failed to get word IDs: ${error.message}`);
    return (data as { id: string }[]).map(r => r.id);
  }

  // ============ Share Methods ============

  /**
   * Generate a unique share ID for a project
   */
  async generateShareId(projectId: string): Promise<string> {
    // Generate a random 12-character alphanumeric string
    const shareId = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 12);

    const { error } = await this.supabase
      .from('projects')
      .update({ share_id: shareId })
      .eq('id', projectId);

    if (error) throw new Error(`Failed to generate share ID: ${error.message}`);

    return shareId;
  }

  /**
   * Get a project by its share ID
   */
  async getProjectByShareId(shareId: string): Promise<Project | undefined> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('share_id', shareId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get shared project: ${error.message}`);
    }

    return mapProjectFromRow(data as ProjectRow);
  }

  /**
   * Get words for a shared project
   */
  async getWordsByShareId(shareId: string): Promise<Word[]> {
    // First get the project to get its ID
    const project = await this.getProjectByShareId(shareId);
    if (!project) return [];

    const { data, error } = await this.supabase
      .from('words')
      .select(WORDS_SELECT_COLUMNS)
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get shared words: ${error.message}`);

    return (data as WordRow[]).map(mapWordFromRow);
  }

  /**
   * Import a shared project (copy to user's own projects)
   */
  async importSharedProject(shareId: string, newUserId: string): Promise<Project> {
    // Get the shared project
    const sharedProject = await this.getProjectByShareId(shareId);
    if (!sharedProject) {
      throw new Error('Shared project not found');
    }

    // Get words from the shared project
    const sharedWords = await this.getWordsByShareId(shareId);

    // Create a new project for the user
    const newProject = await this.createProject({
      userId: newUserId,
      title: `${sharedProject.title} (コピー)`,
      iconImage: sharedProject.iconImage,
    });

    // Copy words to the new project
    if (sharedWords.length > 0) {
      const wordsToCreate: WordInput[] = sharedWords.map((w) => ({
        projectId: newProject.id,
        english: w.english,
        japanese: w.japanese,
        distractors: w.distractors,
        exampleSentence: w.exampleSentence,
        exampleSentenceJa: w.exampleSentenceJa,
      }));

      await this.createWords(wordsToCreate);
    }

    return newProject;
  }
  // ============ Collections (Pro only) ============

  async getCollections(userId: string): Promise<Collection[]> {
    const { data, error } = await this.supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get collections: ${error.message}`);

    return (data as CollectionRow[]).map(mapCollectionFromRow);
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    const { data, error } = await this.supabase
      .from('collections')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get collection: ${error.message}`);
    }

    return mapCollectionFromRow(data as CollectionRow);
  }

  async createCollection(input: { userId: string; name: string; description?: string }): Promise<Collection> {
    const { data, error } = await this.supabase
      .from('collections')
      .insert(mapCollectionToInsert(input))
      .select()
      .single();

    if (error) throw new Error(`Failed to create collection: ${error.message}`);

    return mapCollectionFromRow(data as CollectionRow);
  }

  async updateCollection(id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>): Promise<void> {
    const { error } = await this.supabase
      .from('collections')
      .update(mapCollectionUpdates(updates))
      .eq('id', id);

    if (error) throw new Error(`Failed to update collection: ${error.message}`);
  }

  async deleteCollection(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('collections')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete collection: ${error.message}`);
  }

  async getCollectionProjects(collectionId: string): Promise<CollectionProject[]> {
    const { data, error } = await this.supabase
      .from('collection_projects')
      .select('*')
      .eq('collection_id', collectionId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(`Failed to get collection projects: ${error.message}`);

    return (data as CollectionProjectRow[]).map(mapCollectionProjectFromRow);
  }

  async addProjectsToCollection(collectionId: string, projectIds: string[]): Promise<void> {
    if (projectIds.length === 0) return;

    // Get current max sort_order
    const { data: existing } = await this.supabase
      .from('collection_projects')
      .select('sort_order')
      .eq('collection_id', collectionId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const startOrder = existing && existing.length > 0 ? (existing[0].sort_order as number) + 1 : 0;

    const rows = projectIds.map((projectId, i) => ({
      collection_id: collectionId,
      project_id: projectId,
      sort_order: startOrder + i,
    }));

    const { error } = await this.supabase
      .from('collection_projects')
      .upsert(rows, { onConflict: 'collection_id,project_id' });

    if (error) throw new Error(`Failed to add projects to collection: ${error.message}`);
  }

  async removeProjectFromCollection(collectionId: string, projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('collection_projects')
      .delete()
      .eq('collection_id', collectionId)
      .eq('project_id', projectId);

    if (error) throw new Error(`Failed to remove project from collection: ${error.message}`);
  }

  async getCollectionPreviews(collectionIds: string[]): Promise<Record<string, { id: string; title: string; iconImage?: string }[]>> {
    if (collectionIds.length === 0) return {};

    // Get first 3 projects per collection (sorted by sort_order)
    const { data: cpRows, error: cpError } = await this.supabase
      .from('collection_projects')
      .select('collection_id, project_id, sort_order')
      .in('collection_id', collectionIds)
      .order('sort_order', { ascending: true });

    if (cpError) throw new Error(`Failed to get collection previews: ${cpError.message}`);
    if (!cpRows || cpRows.length === 0) {
      return Object.fromEntries(collectionIds.map((id) => [id, []]));
    }

    // Group by collection and take first 3
    const grouped: Record<string, string[]> = {};
    for (const row of cpRows) {
      const cid = row.collection_id as string;
      if (!grouped[cid]) grouped[cid] = [];
      if (grouped[cid].length < 3) {
        grouped[cid].push(row.project_id as string);
      }
    }

    // Fetch project details for all referenced project IDs
    const allPids = [...new Set(Object.values(grouped).flat())];
    if (allPids.length === 0) {
      return Object.fromEntries(collectionIds.map((id) => [id, []]));
    }

    const { data: projRows, error: pError } = await this.supabase
      .from('projects')
      .select('id, title, icon_image')
      .in('id', allPids);

    if (pError) throw new Error(`Failed to get preview projects: ${pError.message}`);

    const projMap = new Map<string, { id: string; title: string; iconImage?: string }>();
    for (const row of projRows || []) {
      projMap.set(row.id as string, {
        id: row.id as string,
        title: row.title as string,
        iconImage: (row.icon_image as string) || undefined,
      });
    }

    const result: Record<string, { id: string; title: string; iconImage?: string }[]> = {};
    for (const cid of collectionIds) {
      const pids = grouped[cid] || [];
      result[cid] = pids.map((pid) => projMap.get(pid)).filter(Boolean) as { id: string; title: string; iconImage?: string }[];
    }
    return result;
  }

  async getCollectionStats(collectionIds: string[]): Promise<Record<string, { projectCount: number; wordCount: number; masteredCount: number }>> {
    if (collectionIds.length === 0) return {};

    // Get all collection_projects for these collections
    const { data: cpRows, error: cpError } = await this.supabase
      .from('collection_projects')
      .select('collection_id, project_id')
      .in('collection_id', collectionIds);

    if (cpError) throw new Error(`Failed to get collection stats: ${cpError.message}`);
    if (!cpRows || cpRows.length === 0) {
      return Object.fromEntries(collectionIds.map((id) => [id, { projectCount: 0, wordCount: 0, masteredCount: 0 }]));
    }

    // Group project IDs by collection
    const collectionProjectMap: Record<string, string[]> = {};
    for (const row of cpRows) {
      const cid = row.collection_id as string;
      if (!collectionProjectMap[cid]) collectionProjectMap[cid] = [];
      collectionProjectMap[cid].push(row.project_id as string);
    }

    // Get word counts for all relevant projects in one query
    const allProjectIds = [...new Set(cpRows.map((r) => r.project_id as string))];
    const { data: wordRows, error: wError } = await this.supabase
      .from('words')
      .select('project_id, status')
      .in('project_id', allProjectIds);

    if (wError) throw new Error(`Failed to get word stats: ${wError.message}`);

    // Count words per project
    const projectWordCount: Record<string, number> = {};
    const projectMasteredCount: Record<string, number> = {};
    for (const w of wordRows || []) {
      const pid = w.project_id as string;
      projectWordCount[pid] = (projectWordCount[pid] || 0) + 1;
      if (w.status === 'mastered') {
        projectMasteredCount[pid] = (projectMasteredCount[pid] || 0) + 1;
      }
    }

    // Aggregate per collection
    const result: Record<string, { projectCount: number; wordCount: number; masteredCount: number }> = {};
    for (const cid of collectionIds) {
      const pids = collectionProjectMap[cid] || [];
      let wordCount = 0;
      let masteredCount = 0;
      for (const pid of pids) {
        wordCount += projectWordCount[pid] || 0;
        masteredCount += projectMasteredCount[pid] || 0;
      }
      result[cid] = { projectCount: pids.length, wordCount, masteredCount };
    }
    return result;
  }
}

// Export singleton
export const remoteRepository = new RemoteWordRepository();
