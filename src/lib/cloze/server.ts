import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LEXICON_CEFR_LEVELS,
  normalizeCefrLevel,
  normalizeHeadword,
  resolvePrimaryLexiconPos,
  type LexiconCefrLevel,
  type LexiconPos,
} from '../../../shared/lexicon';
import type { ClozeDistractorCandidate } from './distractors';
import { inflectedSurfaces, isClozeEligibleHeadword } from './inflections';
import { buildClozeQuestion, type ClozeQuestion, type ClozeSentenceRow } from './question';

/**
 * 空所補充の出題を組み立てるサーバー側の処理。
 * 出題文は cloze_sentences (Tatoeba)、誤答は lexicon_entries (同じ品詞・近い級) から取り、
 * AI は一切呼ばない。
 */

export type ClozeWordInput = {
  id: string;
  english: string;
  japanese: string;
  translations?: string[];
  lexiconEntryId?: string | null;
  partOfSpeechTags?: string[] | null;
  cefrLevel?: string | null;
};

type LexiconRow = {
  id: string;
  headword: string;
  pos: LexiconPos;
  cefr_level: LexiconCefrLevel | null;
  translation_ja: string | null;
};

/** DB への問い合わせ。テストでは差し替える。 */
export type ClozeDataSource = {
  lexiconByIds(ids: string[]): Promise<LexiconRow[]>;
  lexiconByHeadwords(headwords: string[]): Promise<LexiconRow[]>;
  /** いずれかの表記を含む出題文。毎回同じ文ばかりにならないよう、ばらけた範囲から返す。 */
  sentencesContaining(surfaces: string[]): Promise<ClozeSentenceRow[]>;
  /** 誤答候補。指定の品詞・級から、ばらけた範囲で返す。 */
  distractorCandidates(pos: LexiconPos, levels: LexiconCefrLevel[] | null): Promise<LexiconRow[]>;
};

/** 同じ見出し語が複数の品詞で lexicon にあるとき、どれを出題の品詞とみなすか。 */
const POS_PREFERENCE: readonly LexiconPos[] = ['verb', 'noun', 'adjective', 'adverb'];

function choosePos(rows: LexiconRow[], hinted: LexiconPos): LexiconRow | null {
  if (rows.length === 0) return null;
  const hintedRow = rows.find((row) => row.pos === hinted);
  if (hintedRow) return hintedRow;
  for (const pos of POS_PREFERENCE) {
    const row = rows.find((candidate) => candidate.pos === pos);
    if (row) return row;
  }
  return null;
}

/** 正解の級の前後1段階。級が分からなければ絞らない。 */
export function cefrBand(level: LexiconCefrLevel | null): LexiconCefrLevel[] | null {
  if (!level) return null;
  const index = LEXICON_CEFR_LEVELS.indexOf(level);
  return LEXICON_CEFR_LEVELS.slice(Math.max(0, index - 1), index + 2);
}

type ResolvedTarget = {
  word: ClozeWordInput;
  headword: string;
  pos: LexiconPos;
  cefrLevel: LexiconCefrLevel | null;
  translations: string[];
};

async function resolveTargets(words: ClozeWordInput[], data: ClozeDataSource): Promise<Map<string, ResolvedTarget>> {
  const eligible = words.filter((word) => isClozeEligibleHeadword(word.english));

  const linkedIds = Array.from(new Set(eligible.map((word) => word.lexiconEntryId).filter((id): id is string => !!id)));
  const byId = new Map((linkedIds.length > 0 ? await data.lexiconByIds(linkedIds) : []).map((row) => [row.id, row]));

  // lexicon に紐づいていない語は見出し語で引く。品詞が分からないと誤答をそろえられない。
  const unlinked = eligible.filter((word) => !word.lexiconEntryId || !byId.has(word.lexiconEntryId));
  const headwords = Array.from(new Set(unlinked.map((word) => normalizeHeadword(word.english))));
  const byHeadword = new Map<string, LexiconRow[]>();
  for (const row of headwords.length > 0 ? await data.lexiconByHeadwords(headwords) : []) {
    const key = normalizeHeadword(row.headword);
    byHeadword.set(key, [...(byHeadword.get(key) ?? []), row]);
  }

  const targets = new Map<string, ResolvedTarget>();
  for (const word of eligible) {
    const hinted = resolvePrimaryLexiconPos(word.partOfSpeechTags ?? null);
    const linked = word.lexiconEntryId ? byId.get(word.lexiconEntryId) : undefined;
    const row = linked ?? choosePos(byHeadword.get(normalizeHeadword(word.english)) ?? [], hinted);
    const pos = row?.pos ?? hinted;
    if (!POS_PREFERENCE.includes(pos)) continue;

    targets.set(word.id, {
      word,
      headword: normalizeHeadword(word.english),
      pos,
      cefrLevel: row?.cefr_level ?? normalizeCefrLevel(word.cefrLevel ?? null),
      translations: [word.japanese, ...(word.translations ?? []), row?.translation_ja ?? '']
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    });
  }
  return targets;
}

export type ClozeQuestionsResult = {
  questions: ClozeQuestion[];
  /** 出題文か誤答がそろわず、出題できなかった語。 */
  unavailableWordIds: string[];
};

/**
 * 語の並びどおりに問題を組む。組めなかった語は飛ばして unavailableWordIds に入れる。
 * `limit` 問そろった時点で打ち切る (呼び出し側は外れを見込んで多めに語を渡す)。
 */
export async function buildClozeQuestionsForWords(
  words: ClozeWordInput[],
  data: ClozeDataSource,
  { limit = words.length, random = Math.random }: { limit?: number; random?: () => number } = {},
): Promise<ClozeQuestionsResult> {
  const targets = await resolveTargets(words, data);
  const candidateCache = new Map<string, Promise<ClozeDistractorCandidate[]>>();
  const candidatesFor = (pos: LexiconPos, level: LexiconCefrLevel | null) => {
    const band = cefrBand(level);
    const key = `${pos}:${band?.join(',') ?? '*'}`;
    let cached = candidateCache.get(key);
    if (!cached) {
      cached = data.distractorCandidates(pos, band).then((rows) =>
        rows.map((row) => ({
          headword: row.headword,
          pos: row.pos,
          cefrLevel: row.cefr_level,
          translationJa: row.translation_ja,
        })),
      );
      candidateCache.set(key, cached);
    }
    return cached;
  };

  // 文の検索は語ごとに独立しているので並べて投げる。
  const built = await Promise.all(
    words.map(async (word) => {
      const target = targets.get(word.id);
      if (!target) return null;
      const [sentences, candidates] = await Promise.all([
        data.sentencesContaining(inflectedSurfaces(target.headword, target.pos)),
        candidatesFor(target.pos, target.cefrLevel),
      ]);
      return buildClozeQuestion({ wordId: word.id, target, sentences, candidates, random });
    }),
  );

  const questions: ClozeQuestion[] = [];
  const unavailableWordIds: string[] = [];
  built.forEach((question, index) => {
    if (question && questions.length < limit) questions.push(question);
    else if (!question) unavailableWordIds.push(words[index].id);
  });
  return { questions, unavailableWordIds };
}

// --- Supabase 実装 ---------------------------------------------------------

const SENTENCE_COLUMNS = 'id, sentence_en, sentence_ja, ja_sentence_id, author_en, author_ja, license_en, license_ja';
const LEXICON_COLUMNS = 'id, headword, pos, cefr_level, translation_ja';
const SENTENCES_PER_WORD = 40;
const CANDIDATES_PER_POOL = 300;
/** Tatoeba の文IDのおおよその上限。ばらけた位置から引くための目安にすぎない。 */
const TATOEBA_ID_SPAN = 14_000_000;

function randomUuid(random: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createSupabaseClozeDataSource(
  supabase: SupabaseClient,
  random: () => number = Math.random,
): ClozeDataSource {
  return {
    async lexiconByIds(ids) {
      const { data, error } = await supabase.from('lexicon_entries').select(LEXICON_COLUMNS).in('id', ids);
      if (error) throw new Error(`lexicon_entries: ${error.message}`);
      return (data ?? []) as LexiconRow[];
    },

    async lexiconByHeadwords(headwords) {
      const { data, error } = await supabase
        .from('lexicon_entries')
        .select(LEXICON_COLUMNS)
        .in('normalized_headword', headwords);
      if (error) throw new Error(`lexicon_entries: ${error.message}`);
      return (data ?? []) as LexiconRow[];
    },

    async sentencesContaining(surfaces) {
      if (surfaces.length === 0) return [];
      // ランダムな位置から先を取り、足りなければ手前から補う。いつも同じ文にならないため。
      const pivot = Math.floor(random() * TATOEBA_ID_SPAN);
      const after = await supabase
        .from('cloze_sentences')
        .select(SENTENCE_COLUMNS)
        .overlaps('tokens', surfaces)
        .gte('id', pivot)
        .order('id')
        .limit(SENTENCES_PER_WORD);
      if (after.error) throw new Error(`cloze_sentences: ${after.error.message}`);
      const rows = (after.data ?? []) as ClozeSentenceRow[];
      if (rows.length >= SENTENCES_PER_WORD) return rows;

      const before = await supabase
        .from('cloze_sentences')
        .select(SENTENCE_COLUMNS)
        .overlaps('tokens', surfaces)
        .lt('id', pivot)
        .order('id')
        .limit(SENTENCES_PER_WORD - rows.length);
      if (before.error) throw new Error(`cloze_sentences: ${before.error.message}`);
      return [...rows, ...((before.data ?? []) as ClozeSentenceRow[])];
    },

    async distractorCandidates(pos, levels) {
      // uuid の並びはランダムなので、ランダムな uuid から先を取ると無作為抽出になる。
      const pivot = randomUuid(random);
      const query = () => {
        let q = supabase
          .from('lexicon_entries')
          .select(LEXICON_COLUMNS)
          .eq('pos', pos)
          .not('headword', 'like', '% %');
        if (levels) q = q.in('cefr_level', levels);
        return q;
      };
      const after = await query().gte('id', pivot).order('id').limit(CANDIDATES_PER_POOL);
      if (after.error) throw new Error(`lexicon_entries: ${after.error.message}`);
      const rows = (after.data ?? []) as LexiconRow[];
      if (rows.length >= CANDIDATES_PER_POOL) return rows;

      const before = await query().lt('id', pivot).order('id').limit(CANDIDATES_PER_POOL - rows.length);
      if (before.error) throw new Error(`lexicon_entries: ${before.error.message}`);
      return [...rows, ...((before.data ?? []) as LexiconRow[])];
    },
  };
}
