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
import {
  RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS,
  RESOLVED_WORD_DISPLAY_SELECT_COLUMNS,
  RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS,
  RESOLVED_WORD_SELECT_COLUMNS,
  RESOLVED_WORD_SELECT_COLUMNS_BASIC,
  RESOLVED_WORD_MINIMAL_SELECT_COLUMNS,
  RESOLVED_WORD_SELECT_COLUMNS_WITHOUT_SENSES,
  SHARE_VIEW_WORD_SELECT_COLUMNS,
  SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC,
  SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
  SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY,
  SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE,
  SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL,
  SHARE_VIEW_WORD_SELECT_COLUMNS_WITHOUT_SENSES,
} from '@/lib/words/resolved';

// Remote implementation of WordRepository using Supabase
// Used for Pro tier users - data synced across devices

export const WORDS_SELECT_COLUMNS = RESOLVED_WORD_SELECT_COLUMNS;
const WORDS_SELECT_COLUMNS_WITHOUT_SENSES = RESOLVED_WORD_SELECT_COLUMNS_WITHOUT_SENSES;
const WORDS_SELECT_COLUMNS_BASIC = RESOLVED_WORD_SELECT_COLUMNS_BASIC;
const WORDS_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION = RESOLVED_WORD_DISPLAY_WITH_PRONUNCIATION_SELECT_COLUMNS;
const WORDS_SELECT_COLUMNS_DISPLAY = RESOLVED_WORD_DISPLAY_SELECT_COLUMNS;
const WORDS_SELECT_COLUMNS_EXAMPLE = RESOLVED_WORD_EXAMPLE_SELECT_COLUMNS;
const WORDS_SELECT_COLUMNS_MINIMAL = RESOLVED_WORD_MINIMAL_SELECT_COLUMNS;

type SupabaseSelectError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

type SupabaseSelectResult = {
  data: unknown;
  error: SupabaseSelectError | null;
  count?: number | null;
};

function shouldRetryWordSelectWithoutRelations(error: SupabaseSelectError | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  return (
    error.code === 'PGRST200'
    || error.code === 'PGRST204'
    || error.code === '42703'
    || /schema cache/i.test(text)
    || /column .* does not exist/i.test(text)
    || /could not find .* column/i.test(text)
    || /undefined column/i.test(text)
    || /relationship/i.test(text)
    || /word_translations|lexicon_senses/i.test(text)
  );
}

export type SharedWordsPreview = {
  words: Word[];
  totalCount: number;
};

type WordsCreateRequestTranslation = {
  translationJa: string;
  source?: 'scan' | 'ai' | 'user';
  meaningRank?: number;
  lexiconSenseId?: string;
};

type WordsCreateRequestWord = {
  id: string;
  projectId: string;
  english: string;
  japanese: string;
  vocabularyType?: Word['vocabularyType'];
  japaneseSource?: Word['japaneseSource'];
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  translations?: WordsCreateRequestTranslation[];
  distractors: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
  pronunciation?: string;
  partOfSpeechTags?: string[];
  relatedWords?: Word['relatedWords'];
  usagePatterns?: Word['usagePatterns'];
  insightsGeneratedAt?: string;
  insightsVersion?: number;
  wordOrderQuiz?: Word['wordOrderQuiz'];
  customSections?: Word['customSections'];
  morphology?: Word['morphology'];
  status: Word['status'];
  createdAt: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  easeFactor: number;
  intervalDays: number;
  repetition: number;
  isFavorite: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

function normalizeRequestText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeRequestStringArray(value: unknown, maxCount: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    const normalized = normalizeRequestText(item, maxLength);
    if (!normalized) continue;
    result.push(normalized);
    if (result.length >= maxCount) break;
  }
  return result.length > 0 ? result : undefined;
}

function normalizeRequestDateTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function normalizeWordsCreateTranslations(word: Word): WordsCreateRequestTranslation[] | undefined {
  const translations = word.translations
    ?.map((translation) => {
      const translationJa = normalizeRequestText(translation.translationJa, 300);
      if (!translationJa) return null;
      const meaningRank = Number.isInteger(translation.meaningRank)
        ? Math.min(20, Math.max(1, translation.meaningRank))
        : undefined;

      return {
        translationJa,
        ...(translation.source === 'scan' || translation.source === 'ai' || translation.source === 'user'
          ? { source: translation.source }
          : {}),
        ...(meaningRank ? { meaningRank } : {}),
        ...(validUuid(translation.lexiconSenseId) ? { lexiconSenseId: translation.lexiconSenseId } : {}),
      };
    })
    .filter((translation): translation is WordsCreateRequestTranslation => Boolean(translation));

  return translations && translations.length > 0 ? translations : undefined;
}

function normalizeWordsCreateWordOrderQuiz(wordOrderQuiz: Word['wordOrderQuiz']): Word['wordOrderQuiz'] | undefined {
  if (!wordOrderQuiz || wordOrderQuiz.version !== 1) return undefined;
  const sourceEnglish = normalizeRequestText(wordOrderQuiz.sourceEnglish, 200);
  const sourceJapanese = normalizeRequestText(wordOrderQuiz.sourceJapanese, 300);
  const sentenceTokens = normalizeRequestStringArray(wordOrderQuiz.sentenceTokens, 30, 80);
  const answerTokens = normalizeRequestStringArray(wordOrderQuiz.answerTokens, 3, 80);
  const decoyTokens = normalizeRequestStringArray(wordOrderQuiz.decoyTokens, 3, 80);
  const generatedAt = normalizeRequestDateTime(wordOrderQuiz.generatedAt);

  if (!sourceEnglish || !sourceJapanese || !sentenceTokens || !answerTokens || !decoyTokens || !generatedAt) {
    return undefined;
  }
  if (answerTokens.length < 1 || decoyTokens.length !== 3) return undefined;

  return {
    version: 1,
    sourceEnglish,
    sourceJapanese,
    sentenceTokens,
    answerTokens,
    decoyTokens,
    generatedAt,
  };
}

function normalizeWordsCreateRelatedWords(value: Word['relatedWords']): Word['relatedWords'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .map((item) => {
      const term = normalizeRequestText(item.term, 80);
      const relation = normalizeRequestText(item.relation, 40);
      if (!term || !relation) return null;
      return {
        term,
        relation,
        ...(normalizeRequestText(item.noteJa, 200) ? { noteJa: normalizeRequestText(item.noteJa, 200) } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 10);
  return result.length > 0 ? result : undefined;
}

function normalizeWordsCreateUsagePatterns(value: Word['usagePatterns']): Word['usagePatterns'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .map((item) => {
      const pattern = normalizeRequestText(item.pattern, 120);
      const meaningJa = normalizeRequestText(item.meaningJa, 200);
      if (!pattern || !meaningJa) return null;
      return {
        pattern,
        meaningJa,
        ...(normalizeRequestText(item.example, 240) ? { example: normalizeRequestText(item.example, 240) } : {}),
        ...(normalizeRequestText(item.exampleJa, 240) ? { exampleJa: normalizeRequestText(item.exampleJa, 240) } : {}),
        ...(normalizeRequestText(item.register, 40) ? { register: normalizeRequestText(item.register, 40) } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 8);
  return result.length > 0 ? result : undefined;
}

function normalizeWordsCreateCustomSections(value: Word['customSections']): Word['customSections'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .map((item) => {
      const id = normalizeRequestText(item.id, 120);
      if (!id) return null;
      return {
        id,
        title: normalizeRequestText(item.title, 120) ?? '',
        content: normalizeRequestText(item.content, 2000) ?? '',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 20);
  return result.length > 0 ? result : undefined;
}

function normalizeWordsCreateInsightsVersion(value: unknown): number | undefined {
  if (!Number.isInteger(value)) return undefined;
  return Math.min(100, Math.max(1, value as number));
}

function normalizeWordsCreateMorphology(morphology: Word['morphology']): Word['morphology'] | undefined {
  if (!morphology || morphology.version !== 1) return undefined;
  if (morphology.none) return undefined; // 「構造なし」は保存対象にしない
  if (!Array.isArray(morphology.formula) || morphology.formula.length === 0) return undefined;

  const formula = morphology.formula
    .slice(0, 8)
    .map((part) => {
      const text = normalizeRequestText(part.text, 40);
      const meaningJa = normalizeRequestText(part.meaningJa, 60);
      if (!text || !meaningJa) return null;
      if (!['prefix', 'suffix', 'infix', 'root'].includes(part.kind)) return null;
      const affixId = normalizeRequestText(part.affixId, 60);
      return { text, kind: part.kind, meaningJa, ...(affixId ? { affixId } : {}) };
    })
    .filter((part): part is NonNullable<typeof part> => part !== null);

  const explanation = normalizeRequestText(morphology.explanation, 200);
  if (formula.length === 0 || !explanation) return undefined;

  return { formula, explanation, version: 1 };
}

export function buildWordsCreateRequestWord(word: Word): WordsCreateRequestWord {
  return {
    id: word.id,
    projectId: word.projectId,
    english: normalizeRequestText(word.english, 200) ?? word.english,
    japanese: normalizeRequestText(word.japanese, 300) ?? '',
    vocabularyType: word.vocabularyType ?? null,
    japaneseSource: word.japaneseSource,
    lexiconEntryId: validUuid(word.lexiconEntryId),
    lexiconSenseId: validUuid(word.lexiconSenseId),
    translations: normalizeWordsCreateTranslations(word),
    distractors: normalizeRequestStringArray(word.distractors, 10, 300) ?? [],
    exampleSentence: normalizeRequestText(word.exampleSentence, 500),
    exampleSentenceJa: normalizeRequestText(word.exampleSentenceJa, 500),
    pronunciation: normalizeRequestText(word.pronunciation, 120),
    partOfSpeechTags: normalizeRequestStringArray(word.partOfSpeechTags, 10, 32),
    relatedWords: normalizeWordsCreateRelatedWords(word.relatedWords),
    usagePatterns: normalizeWordsCreateUsagePatterns(word.usagePatterns),
    insightsGeneratedAt: normalizeRequestDateTime(word.insightsGeneratedAt),
    insightsVersion: normalizeWordsCreateInsightsVersion(word.insightsVersion),
    wordOrderQuiz: normalizeWordsCreateWordOrderQuiz(word.wordOrderQuiz),
    customSections: normalizeWordsCreateCustomSections(word.customSections),
    morphology: normalizeWordsCreateMorphology(word.morphology),
    status: word.status,
    createdAt: word.createdAt,
    lastReviewedAt: word.lastReviewedAt,
    nextReviewAt: word.nextReviewAt,
    easeFactor: word.easeFactor,
    intervalDays: word.intervalDays,
    repetition: word.repetition,
    isFavorite: word.isFavorite,
  };
}

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

  private async selectWordsWithFallback<T extends SupabaseSelectResult>(
    buildQuery: (columns: string) => PromiseLike<T>,
    columns: {
      primary: string;
      withoutSenses: string;
      basic: string;
      displayWithPronunciation: string;
      display: string;
      example: string;
      minimal: string;
      label: string;
    },
  ): Promise<T> {
    const primary = await buildQuery(columns.primary);
    if (!shouldRetryWordSelectWithoutRelations(primary.error)) {
      return primary;
    }

    console.warn(`[RemoteRepo] ${columns.label} compatibility fallback without lexicon_senses`, {
      code: primary.error?.code,
      message: primary.error?.message,
    });
    const withoutSenses = await buildQuery(columns.withoutSenses);
    if (!shouldRetryWordSelectWithoutRelations(withoutSenses.error)) {
      return withoutSenses;
    }

    console.warn(`[RemoteRepo] ${columns.label} compatibility fallback without relation embeds`, {
      code: withoutSenses.error?.code,
      message: withoutSenses.error?.message,
    });
    const basic = await buildQuery(columns.basic);
    if (!shouldRetryWordSelectWithoutRelations(basic.error)) {
      return basic;
    }

    console.warn(`[RemoteRepo] ${columns.label} compatibility fallback with display word columns including pronunciation`, {
      code: basic.error?.code,
      message: basic.error?.message,
    });
    const displayWithPronunciation = await buildQuery(columns.displayWithPronunciation);
    if (!shouldRetryWordSelectWithoutRelations(displayWithPronunciation.error)) {
      return displayWithPronunciation;
    }

    console.warn(`[RemoteRepo] ${columns.label} compatibility fallback with display word columns`, {
      code: displayWithPronunciation.error?.code,
      message: displayWithPronunciation.error?.message,
    });
    const display = await buildQuery(columns.display);
    if (!shouldRetryWordSelectWithoutRelations(display.error)) {
      return display;
    }

    console.warn(`[RemoteRepo] ${columns.label} compatibility fallback with example word columns`, {
      code: display.error?.code,
      message: display.error?.message,
    });
    const example = await buildQuery(columns.example);
    if (!shouldRetryWordSelectWithoutRelations(example.error)) {
      return example;
    }

    console.warn(`[RemoteRepo] ${columns.label} compatibility fallback with minimal word columns`, {
      code: example.error?.code,
      message: example.error?.message,
    });
    return buildQuery(columns.minimal);
  }

  private async selectFullWordsWithFallback<T extends SupabaseSelectResult>(
    buildQuery: (columns: string) => PromiseLike<T>,
    label: string,
  ): Promise<T> {
    return this.selectWordsWithFallback(buildQuery, {
      primary: WORDS_SELECT_COLUMNS,
      withoutSenses: WORDS_SELECT_COLUMNS_WITHOUT_SENSES,
      basic: WORDS_SELECT_COLUMNS_BASIC,
      displayWithPronunciation: WORDS_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
      display: WORDS_SELECT_COLUMNS_DISPLAY,
      example: WORDS_SELECT_COLUMNS_EXAMPLE,
      minimal: WORDS_SELECT_COLUMNS_MINIMAL,
      label,
    });
  }

  private async selectShareWordsWithFallback<T extends SupabaseSelectResult>(
    buildQuery: (columns: string) => PromiseLike<T>,
    label: string,
  ): Promise<T> {
    return this.selectWordsWithFallback(buildQuery, {
      primary: SHARE_VIEW_WORD_SELECT_COLUMNS,
      withoutSenses: SHARE_VIEW_WORD_SELECT_COLUMNS_WITHOUT_SENSES,
      basic: SHARE_VIEW_WORD_SELECT_COLUMNS_BASIC,
      displayWithPronunciation: SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY_WITH_PRONUNCIATION,
      display: SHARE_VIEW_WORD_SELECT_COLUMNS_DISPLAY,
      example: SHARE_VIEW_WORD_SELECT_COLUMNS_EXAMPLE,
      minimal: SHARE_VIEW_WORD_SELECT_COLUMNS_MINIMAL,
      label,
    });
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
        words: words.map(buildWordsCreateRequestWord),
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
    const { data, error } = await this.selectFullWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      'getWords',
    );

    if (error) throw new Error(`Failed to get words: ${error.message}`);

    return (data as unknown as WordRow[]).map(mapWordFromRow);
  }

  /**
   * Lightweight word fetch for shared project viewing and import.
   * Omits heavy fields (related_words, usage_patterns, SM-2 fields) not needed for share display.
   */
  async getWordsForShareView(projectId: string): Promise<Word[]> {
    const { data, error } = await this.selectShareWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      'getWordsForShareView',
    );

    if (error) throw new Error(`Failed to get shared words: ${error.message}`);

    return (data as unknown as WordRow[]).map(mapWordFromRow);
  }

  async getWordsForSharePreview(projectId: string, limit = 5): Promise<SharedWordsPreview> {
    const { data, error, count } = await this.selectShareWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns, { count: 'exact' })
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit),
      'getWordsForSharePreview',
    );

    if (error) throw new Error(`Failed to get shared word preview: ${error.message}`);

    const rows = data as unknown as WordRow[];
    return {
      words: rows.map(mapWordFromRow),
      totalCount: count ?? rows.length,
    };
  }

  async getWord(id: string): Promise<Word | undefined> {
    const { data, error } = await this.selectFullWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns)
        .eq('id', id)
        .single(),
      'getWord',
    );

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to get word: ${error.message}`);
    }

    return mapWordFromRow(data as unknown as WordRow);
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

    const { data, error } = await this.selectFullWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false }),
      'getAllWordsByProjectIds',
    );

    if (error) throw new Error(`Failed to get all words: ${error.message}`);

    const grouped: Record<string, Word[]> = {};
    for (const pid of projectIds) {
      grouped[pid] = [];
    }
    for (const row of (data as unknown as WordRow[])) {
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

    const { data, error } = await this.selectFullWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns)
        .in('project_id', projectIds)
        .gt('updated_at', since),
      'getWordsUpdatedSince',
    );

    if (error) throw new Error(`Failed to get updated words: ${error.message}`);
    return (data as unknown as WordRow[]).map(mapWordFromRow);
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
      .update({ share_id: shareId, share_scope: 'private' })
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

    const { data, error } = await this.selectFullWordsWithFallback(
      (columns) => this.supabase
        .from('words')
        .select(columns)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false }),
      'getWordsByShareId',
    );

    if (error) throw new Error(`Failed to get shared words: ${error.message}`);

    return (data as unknown as WordRow[]).map(mapWordFromRow);
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
        pronunciation: w.pronunciation,
        partOfSpeechTags: w.partOfSpeechTags,
        vocabularyType: w.vocabularyType,
        wordOrderQuiz: w.wordOrderQuiz,
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
