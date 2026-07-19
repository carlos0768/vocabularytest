/**
 * 手動単語追加（enrich-manual）のlexiconマスター優先参照。
 *
 * AIで発音・品詞・例文を生成する前に共有語彙マスターを参照し、
 * マスターに値がある分はAI生成をスキップする。頻出語のAIコストを
 * ユーザー横断で1回きりにするための仕組み。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeHeadword } from '../../../shared/lexicon';
import { normalizeTranslationText, splitJapaneseTranslations } from '../../../shared/word-translations';

export interface ManualEnrichmentMasterRow {
  id: string;
  pos: string | null;
  translation_ja: string | null;
  example_sentence: string | null;
  example_sentence_ja: string | null;
  pronunciation: string | null;
}

export interface ManualEnrichmentSenseRow {
  lexicon_entry_id: string;
  translation_ja: string | null;
}

/** 手動追加の全訳補完で保持する訳語数の上限（単語帳の一覧性を守る）。 */
export const MANUAL_ENRICH_MAX_TRANSLATIONS = 8;

export interface ManualMasterEnrichment {
  /** 例文・発音の書き戻し先。マスターにエントリが無い場合は null。 */
  entryId: string | null;
  /** 日本語訳が未入力のときの補完候補（第一訳）。マスターに無ければ空文字。 */
  japanese: string;
  /**
   * マスターが持つ全訳（品詞違いエントリ + lexicon_senses、重複除去済み）。
   * 先頭が第一訳。訳ごとに word_translations レコードを作るための材料。
   */
  japaneseTranslations: string[];
  pronunciation: string;
  partOfSpeechTags: string[];
  exampleSentence: string;
  exampleSentenceJa: string;
}

/**
 * 訳語リストを正規化・重複除去し、上限件数に丸める。
 * 「;」区切りや番号付きで複数訳が1文字列に入っている場合は分割する。
 */
export function dedupeJapaneseTranslations(
  values: readonly string[],
  max = MANUAL_ENRICH_MAX_TRANSLATIONS,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const text of splitJapaneseTranslations(value)) {
      const normalized = normalizeTranslationText(text);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
      if (result.length >= max) return result;
    }
  }
  return result;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fieldScore(row: ManualEnrichmentMasterRow): number {
  let score = 0;
  if (normalizeText(row.pronunciation)) score += 1;
  if (normalizeText(row.example_sentence) && normalizeText(row.example_sentence_ja)) score += 2;
  if (normalizeText(row.pos)) score += 1;
  return score;
}

/**
 * マスターの複数行（品詞違い等）から手動追加の補完に使う値を選ぶ。
 * ユーザー入力の日本語訳と一致するエントリを優先し、無ければ
 * フィールドが最も揃っている行を使う。発音は見出し語単位なので
 * どの行の値でもよい。
 */
export function pickManualMasterEnrichment(
  rows: ManualEnrichmentMasterRow[],
  japaneseHint: string,
  senseRows: ManualEnrichmentSenseRow[] = [],
): ManualMasterEnrichment | null {
  if (rows.length === 0) return null;

  const hint = normalizeText(japaneseHint);
  const hintMatched = hint
    ? rows.filter((row) => {
        const translation = normalizeText(row.translation_ja);
        return translation.length > 0 && (translation === hint || translation.includes(hint) || hint.includes(translation));
      })
    : [];

  const pool = hintMatched.length > 0 ? hintMatched : rows;
  const best = [...pool].sort((a, b) => fieldScore(b) - fieldScore(a))[0];

  const pronunciation = normalizeText(best.pronunciation)
    || normalizeText(rows.find((row) => normalizeText(row.pronunciation))?.pronunciation);
  const japanese = normalizeText(best.translation_ja)
    || normalizeText(rows.find((row) => normalizeText(row.translation_ja))?.translation_ja);
  const exampleSentence = normalizeText(best.example_sentence);
  const exampleSentenceJa = normalizeText(best.example_sentence_ja);
  const pos = normalizeText(best.pos);

  // 全訳リスト: 第一訳 → 選ばれたエントリの他sense → 他エントリ（品詞違い）の訳。
  // senseRows は呼び出し側で is_primary 優先の順に並んでいる想定。
  const orderedSenses = [...senseRows].sort(
    (a, b) => Number(b.lexicon_entry_id === best.id) - Number(a.lexicon_entry_id === best.id),
  );
  const japaneseTranslations = dedupeJapaneseTranslations([
    japanese,
    ...orderedSenses.map((sense) => normalizeText(sense.translation_ja)),
    ...rows.map((row) => normalizeText(row.translation_ja)),
  ]);

  return {
    entryId: best.id,
    japanese,
    japaneseTranslations,
    pronunciation,
    partOfSpeechTags: pos ? [pos] : [],
    // 例文は英日ペアが揃っている場合のみ採用する
    exampleSentence: exampleSentence && exampleSentenceJa ? exampleSentence : '',
    exampleSentenceJa: exampleSentence && exampleSentenceJa ? exampleSentenceJa : '',
  };
}

/**
 * lexiconマスターから手動追加語の補完候補を取得する（ベストエフォート）。
 * 失敗時は null を返し、呼び出し側は従来どおり全フィールドをAI生成する。
 */
export async function fetchManualEnrichmentFromMaster(
  supabaseAdmin: SupabaseClient,
  english: string,
  japaneseHint: string,
): Promise<ManualMasterEnrichment | null> {
  const normalizedHeadword = normalizeHeadword(english);
  if (!normalizedHeadword) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('lexicon_entry_resolved_rows')
      .select('id, pos, translation_ja, example_sentence, example_sentence_ja, pronunciation')
      .eq('normalized_headword', normalizedHeadword);

    if (error) {
      console.warn('[manual-enrichment] Master lookup failed, falling back to AI:', error.message);
      return null;
    }

    const rows = (data ?? []) as ManualEnrichmentMasterRow[];

    // 全訳補完のため、エントリに紐づく全senseも参照する（ベストエフォート）。
    // 失敗しても resolved_rows の primary 訳だけで続行する。
    let senseRows: ManualEnrichmentSenseRow[] = [];
    if (rows.length > 0) {
      try {
        const { data: senses, error: senseError } = await supabaseAdmin
          .from('lexicon_senses')
          .select('lexicon_entry_id, translation_ja, is_primary')
          .in('lexicon_entry_id', rows.map((row) => row.id))
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true });
        if (!senseError) {
          senseRows = (senses ?? []) as ManualEnrichmentSenseRow[];
        }
      } catch {
        senseRows = [];
      }
    }

    return pickManualMasterEnrichment(rows, japaneseHint, senseRows);
  } catch (lookupError) {
    console.warn('[manual-enrichment] Unexpected master lookup error, falling back to AI:', lookupError);
    return null;
  }
}

export interface ManualEnrichAiFields {
  japanese?: boolean;
  pronunciation: boolean;
  pos: boolean;
  example: boolean;
}

/**
 * AIに生成させるフィールドだけを列挙したプロンプトを組み立てる。
 * マスター・ユーザー入力で埋まったフィールドは含めない
 * （SYSTEM_PROMPT の「指示されたフィールドのみ生成せよ」と対で機能する）。
 */
export function buildManualEnrichPrompt(
  english: string,
  japanese: string,
  fields: ManualEnrichAiFields,
): string {
  const targets: string[] = [];
  if (fields.japanese) targets.push('japanese');
  if (fields.pronunciation) targets.push('pronunciation');
  if (fields.pos) targets.push('partOfSpeechTags');
  if (fields.example) targets.push('exampleSentence', 'exampleSentenceJa');
  return `"${english}"${japanese ? ` (${japanese})` : ''}\n生成: ${targets.join(', ')}`;
}
