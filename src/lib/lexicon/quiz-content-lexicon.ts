/**
 * Reusable quiz content on the lexicon master.
 *
 * 誤答選択肢（distractors）は正解訳（sense）に対して意味を持つので
 * lexicon_senses に、発音記号（pronunciation）は見出し語単位なので
 * lexicon_entries に保存し、スキャン/クイズ生成時に再利用する。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

const DISTRACTOR_PLACEHOLDER = '選択肢1';
const MIN_DISTRACTOR_COUNT = 3;

/**
 * words.distractors / lexicon_senses.distractors の値をクイズで使い回せる
 * 形に正規化する。プレースホルダや3件未満は再利用不可として null を返す。
 */
export function normalizeReusableDistractors(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length < MIN_DISTRACTOR_COUNT) return null;
  if (normalized[0] === DISTRACTOR_PLACEHOLDER) return null;
  return normalized;
}

function normalizePronunciationValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface LexiconQuizContentUpdate {
  lexiconEntryId?: string | null;
  lexiconSenseId?: string | null;
  pronunciation?: string | null;
  distractors?: unknown;
}

export interface SaveQuizContentToLexiconResult {
  pronunciationUpdated: number;
  distractorsUpdated: number;
  errors: number;
}

interface LexiconQuizContentDeps {
  supabaseAdmin?: SupabaseClient;
}

/**
 * 生成済みの誤答選択肢・発音記号を lexicon マスターへ書き戻す。
 * マスター側に値が無い場合のみ埋める（既存値は上書きしない）。
 */
export async function saveQuizContentToLexicon(
  updates: LexiconQuizContentUpdate[],
  deps?: LexiconQuizContentDeps,
): Promise<SaveQuizContentToLexiconResult> {
  const result: SaveQuizContentToLexiconResult = {
    pronunciationUpdated: 0,
    distractorsUpdated: 0,
    errors: 0,
  };
  if (updates.length === 0) return result;

  const pronunciationByEntryId = new Map<string, string>();
  const distractorsBySenseId = new Map<string, string[]>();

  for (const update of updates) {
    const pronunciation = normalizePronunciationValue(update.pronunciation);
    if (update.lexiconEntryId && pronunciation && !pronunciationByEntryId.has(update.lexiconEntryId)) {
      pronunciationByEntryId.set(update.lexiconEntryId, pronunciation);
    }

    const distractors = normalizeReusableDistractors(update.distractors);
    if (update.lexiconSenseId && distractors && !distractorsBySenseId.has(update.lexiconSenseId)) {
      distractorsBySenseId.set(update.lexiconSenseId, distractors);
    }
  }

  if (pronunciationByEntryId.size === 0 && distractorsBySenseId.size === 0) {
    return result;
  }

  const supabaseAdmin = deps?.supabaseAdmin ?? getSupabaseAdmin();

  await Promise.all([
    ...Array.from(pronunciationByEntryId.entries()).map(async ([entryId, pronunciation]) => {
      const { error } = await supabaseAdmin
        .from('lexicon_entries')
        .update({ pronunciation })
        .eq('id', entryId)
        .is('pronunciation', null); // Only fill missing master values
      if (error) {
        console.error(`[quiz-content-lexicon] Pronunciation save failed for ${entryId}:`, error);
        result.errors += 1;
      } else {
        result.pronunciationUpdated += 1;
      }
    }),
    ...Array.from(distractorsBySenseId.entries()).map(async ([senseId, distractors]) => {
      const { error } = await supabaseAdmin
        .from('lexicon_senses')
        .update({ distractors })
        .eq('id', senseId)
        .is('distractors', null); // Only fill missing master values
      if (error) {
        console.error(`[quiz-content-lexicon] Distractor save failed for ${senseId}:`, error);
        result.errors += 1;
      } else {
        result.distractorsUpdated += 1;
      }
    }),
  ]);

  return result;
}

export interface LexiconQuizContentLookup {
  pronunciationByEntryId: Map<string, string>;
  distractorsBySenseId: Map<string, string[]>;
}

/**
 * lexicon マスターから再利用可能な発音記号・誤答選択肢を取得する。
 * 読み取りは公開RLSなので anon クライアントでも動作する。
 */
export async function fetchLexiconQuizContent(
  params: { entryIds: Array<string | null | undefined>; senseIds: Array<string | null | undefined> },
  deps?: { client?: SupabaseClient },
): Promise<LexiconQuizContentLookup> {
  const lookup: LexiconQuizContentLookup = {
    pronunciationByEntryId: new Map(),
    distractorsBySenseId: new Map(),
  };

  const entryIds = Array.from(new Set(params.entryIds.filter((id): id is string => Boolean(id))));
  const senseIds = Array.from(new Set(params.senseIds.filter((id): id is string => Boolean(id))));
  if (entryIds.length === 0 && senseIds.length === 0) {
    return lookup;
  }

  const client = deps?.client ?? getSupabaseAdmin();

  const [entriesResult, sensesResult] = await Promise.all([
    entryIds.length > 0
      ? client
          .from('lexicon_entries')
          .select('id, pronunciation')
          .in('id', entryIds)
          .not('pronunciation', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    senseIds.length > 0
      ? client
          .from('lexicon_senses')
          .select('id, distractors')
          .in('id', senseIds)
          .not('distractors', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (entriesResult.error) {
    console.error('[quiz-content-lexicon] Pronunciation lookup failed:', entriesResult.error);
  }
  if (sensesResult.error) {
    console.error('[quiz-content-lexicon] Distractor lookup failed:', sensesResult.error);
  }

  for (const row of (entriesResult.data ?? []) as Array<{ id: string; pronunciation: unknown }>) {
    const pronunciation = normalizePronunciationValue(row.pronunciation);
    if (pronunciation) {
      lookup.pronunciationByEntryId.set(row.id, pronunciation);
    }
  }

  for (const row of (sensesResult.data ?? []) as Array<{ id: string; distractors: unknown }>) {
    const distractors = normalizeReusableDistractors(row.distractors);
    if (distractors) {
      lookup.distractorsBySenseId.set(row.id, distractors);
    }
  }

  return lookup;
}
