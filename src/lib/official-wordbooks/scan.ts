import { z } from 'zod';
import {
  MAX_OFFICIAL_WORDBOOK_WORDS,
  normalizeEnglishKey,
  officialWordbookWordInputSchema,
  OFFICIAL_WORDBOOK_EIKEN_LEVELS,
  type OfficialWordbookWordInput,
} from './editor';

// 公式単語帳エディターのカメラスキャン。ユーザー向けスキャン(/api/extract)と違って
// コイン消費もPro判定も無く、ADMIN_SECRET を持つオペレーターだけが叩ける
// (/api/ops/official-wordbooks/scan)。抽出結果は単語帳の行にそのまま流し込めるよう
// OfficialWordbookWordInput に整形して返す。
//
// このファイルはAI呼び出しを含まない純粋なロジックだけを持つ:
// - AIの返す単語をエディターのスキーマに合わせて丸める(長すぎる値は切り詰め)
// - 画像をまたいだ重複を英単語キーで潰す
// - ダミー選択肢・例文などの不足分だけを追加生成の対象にする

/** 管理画面のスキャンで選べる抽出モード。ユーザー向けの custom は使わない。 */
export const OFFICIAL_WORDBOOK_SCAN_MODES = ['all', 'circled', 'idiom', 'eiken'] as const;
export type OfficialWordbookScanMode = (typeof OFFICIAL_WORDBOOK_SCAN_MODES)[number];

export const OFFICIAL_WORDBOOK_SCAN_MODE_LABELS: Record<OfficialWordbookScanMode, string> = {
  all: '全単語',
  circled: '丸囲み',
  idiom: '熟語・イディオム',
  eiken: '英検レベル',
};

/** 一度のスキャンで送れる画像枚数。1枚ずつAPIを叩くのでクライアント側の上限。 */
export const MAX_OFFICIAL_WORDBOOK_SCAN_IMAGES = 20;

// エディターのスキーマ(officialWordbookWordInputSchema)と同じ上限。
// AIは平気で長い例文を返すので、弾く代わりに切り詰めて単語自体は残す。
const FIELD_LIMITS = {
  english: 200,
  japanese: 500,
  distractor: 200,
  exampleSentence: 1000,
  exampleSentenceJa: 1000,
  pronunciation: 200,
  partOfSpeechTag: 40,
} as const;

const MAX_DISTRACTORS = 10;
const MAX_PART_OF_SPEECH_TAGS = 10;

export const officialWordbookScanRequestSchema = z
  .object({
    image: z.string().min(1).max(15_000_000),
    mode: z.enum(OFFICIAL_WORDBOOK_SCAN_MODES).optional().default('all'),
    eikenLevel: z.enum(OFFICIAL_WORDBOOK_EIKEN_LEVELS).nullish(),
    // ダミー選択肢・例文・発音・品詞の不足分をAIで補完するか。
    enrich: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'eiken' && !value.eikenLevel) {
      ctx.addIssue({
        code: 'custom',
        path: ['eikenLevel'],
        message: '英検モードでは英検レベルの指定が必要です',
      });
    }
  });

export type OfficialWordbookScanRequest = z.infer<typeof officialWordbookScanRequestSchema>;

function truncatedString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function truncatedList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const trimmed = truncatedString(item, maxLength);
    if (!trimmed) continue;
    result.push(trimmed);
    if (result.length >= maxItems) break;
  }
  return result;
}

/**
 * AIの抽出結果1件をエディターの1行に変換する。英単語が取れないものは
 * 行にしても管理者が直せないので null を返して捨てる。
 */
export function toOfficialWordbookScanWord(raw: unknown): OfficialWordbookWordInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const word = raw as Record<string, unknown>;

  const candidate = {
    english: truncatedString(word.english, FIELD_LIMITS.english),
    japanese: truncatedString(word.japanese, FIELD_LIMITS.japanese),
    distractors: truncatedList(word.distractors, MAX_DISTRACTORS, FIELD_LIMITS.distractor),
    exampleSentence: truncatedString(word.exampleSentence, FIELD_LIMITS.exampleSentence),
    exampleSentenceJa: truncatedString(word.exampleSentenceJa, FIELD_LIMITS.exampleSentenceJa),
    pronunciation: truncatedString(word.pronunciation, FIELD_LIMITS.pronunciation),
    partOfSpeechTags: truncatedList(
      word.partOfSpeechTags,
      MAX_PART_OF_SPEECH_TAGS,
      FIELD_LIMITS.partOfSpeechTag,
    ),
    vocabularyType: null,
  };

  // AIの出力は英単語欄に「---」やプレースホルダーが入ることがある。
  if (!candidate.english || candidate.english === '---') return null;

  const parsed = officialWordbookWordInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export type NormalizedScanWords = {
  words: OfficialWordbookWordInput[];
  /** 英単語が取れず捨てた件数 + 同じ画像内での重複件数。 */
  dropped: number;
};

/**
 * 1枚の画像から返ってきた単語列を整形する。同じ画像内の重複もここで潰す
 * (公式単語帳は (official_wordbook_id, lower(english)) がユニークなので、
 * 重複を残したまま返すと保存時に丸ごと失敗する)。
 */
export function normalizeScannedWords(rawWords: unknown): NormalizedScanWords {
  if (!Array.isArray(rawWords)) return { words: [], dropped: 0 };

  const words: OfficialWordbookWordInput[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const raw of rawWords) {
    const word = toOfficialWordbookScanWord(raw);
    if (!word) {
      dropped += 1;
      continue;
    }
    const key = normalizeEnglishKey(word.english);
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    words.push(word);
  }

  return { words, dropped };
}

export type AppendScanWordsResult = {
  words: OfficialWordbookWordInput[];
  /** 実際に追加された語数。 */
  added: number;
  /** 既にある英単語だったので追加しなかった語数。 */
  duplicates: number;
  /** 上限(MAX_OFFICIAL_WORDBOOK_WORDS)を超えるため追加しなかった語数。 */
  overflow: number;
};

/**
 * 既存の単語列に新しく読み取った単語を足す。複数枚スキャンや
 * 「既存の単語帳に追記」で同じ単語が二重に入らないようにするための入口。
 */
export function appendScannedWords(
  existing: readonly OfficialWordbookWordInput[],
  incoming: readonly OfficialWordbookWordInput[],
  limit: number = MAX_OFFICIAL_WORDBOOK_WORDS,
): AppendScanWordsResult {
  const words = [...existing];
  const seen = new Set(words.map((word) => normalizeEnglishKey(word.english)));
  let added = 0;
  let duplicates = 0;
  let overflow = 0;

  for (const word of incoming) {
    const key = normalizeEnglishKey(word.english);
    if (!key || seen.has(key)) {
      duplicates += 1;
      continue;
    }
    if (words.length >= limit) {
      overflow += 1;
      continue;
    }
    seen.add(key);
    words.push(word);
    added += 1;
  }

  return { words, added, duplicates, overflow };
}

// ---------------------------------------------------------------------------
// 不足フィールドの追加生成
// ---------------------------------------------------------------------------

export type ScanEnrichmentNeeds = {
  distractors: boolean;
  example: boolean;
  pronunciation: boolean;
  pos: boolean;
};

export type ScanEnrichmentInput = {
  id: string;
  english: string;
  japanese: string;
  needs: ScanEnrichmentNeeds;
};

function hasAnyNeed(needs: ScanEnrichmentNeeds): boolean {
  return needs.distractors || needs.example || needs.pronunciation || needs.pos;
}

/**
 * 追加生成が必要な単語だけを、必要なフィールドだけ指定して返す。
 * 抽出時に取れた値は上書きしない(生成対象から外す)ので、AIコールの
 * トークンも結果の書き換えも最小で済む。
 *
 * id は単語の並び順そのもの。英単語をキーにすると大文字小文字違いで
 * 取り違えるうえ、生成結果の突き合わせが重複語に弱くなる。
 */
export function buildScanEnrichmentInputs(
  words: readonly OfficialWordbookWordInput[],
): ScanEnrichmentInput[] {
  const inputs: ScanEnrichmentInput[] = [];

  words.forEach((word, index) => {
    const japanese = word.japanese?.trim() ?? '';
    const needs: ScanEnrichmentNeeds = {
      // 日本語訳が無い単語のダミー選択肢は「正解」が決まらないので作らせない。
      distractors: japanese.length > 0 && (word.distractors?.length ?? 0) === 0,
      example: !word.exampleSentence?.trim() || !word.exampleSentenceJa?.trim(),
      pronunciation: !word.pronunciation?.trim(),
      pos: (word.partOfSpeechTags?.length ?? 0) === 0,
    };
    if (!hasAnyNeed(needs)) return;
    inputs.push({ id: String(index), english: word.english, japanese, needs });
  });

  return inputs;
}

export type ScanEnrichmentResult = {
  wordId: string;
  distractors?: string[];
  partOfSpeechTags?: string[];
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
};

/**
 * 追加生成の結果を単語列に反映する。既に値がある項目には触れない
 * (スキャンで読み取れた訳や例文の方が原本に忠実なので優先する)。
 */
export function applyScanEnrichment(
  words: readonly OfficialWordbookWordInput[],
  results: readonly ScanEnrichmentResult[],
): OfficialWordbookWordInput[] {
  const byId = new Map(results.map((result) => [result.wordId, result]));

  return words.map((word, index) => {
    const result = byId.get(String(index));
    if (!result) return word;

    const distractors = (word.distractors?.length ?? 0) > 0
      ? word.distractors
      : truncatedList(result.distractors, MAX_DISTRACTORS, FIELD_LIMITS.distractor);
    const partOfSpeechTags = (word.partOfSpeechTags?.length ?? 0) > 0
      ? word.partOfSpeechTags
      : truncatedList(result.partOfSpeechTags, MAX_PART_OF_SPEECH_TAGS, FIELD_LIMITS.partOfSpeechTag);

    // 例文と和訳は対で意味を持つので、片方だけ欠けているときは両方を生成結果で
    // 揃える(和訳の無い例文が公式単語帳に残らないようにする)。
    const generatedExample = truncatedString(result.exampleSentence, FIELD_LIMITS.exampleSentence);
    const generatedExampleJa = truncatedString(result.exampleSentenceJa, FIELD_LIMITS.exampleSentenceJa);
    const hasCompleteExample = Boolean(word.exampleSentence?.trim() && word.exampleSentenceJa?.trim());
    const useGeneratedExample = !hasCompleteExample && Boolean(generatedExample && generatedExampleJa);

    return {
      ...word,
      distractors,
      partOfSpeechTags,
      pronunciation: word.pronunciation?.trim()
        ? word.pronunciation
        : truncatedString(result.pronunciation, FIELD_LIMITS.pronunciation),
      exampleSentence: useGeneratedExample ? generatedExample : word.exampleSentence,
      exampleSentenceJa: useGeneratedExample ? generatedExampleJa : word.exampleSentenceJa,
    };
  });
}

/**
 * 追加生成のあとも埋まらなかった項目を管理者向けの注意書きにする。
 * 熟語(複数語)はダミー選択肢の自動生成対象外なので、黙って空のまま
 * 公開されないようにここで数えて伝える。
 */
export function describeScanGaps(words: readonly OfficialWordbookWordInput[]): string[] {
  const notes: string[] = [];
  const missingJapanese = words.filter((word) => !word.japanese?.trim()).length;
  const missingDistractors = words.filter((word) => (word.distractors?.length ?? 0) === 0).length;
  const missingExample = words.filter((word) => !word.exampleSentence?.trim()).length;

  if (missingJapanese > 0) notes.push(`日本語訳が空の単語が${missingJapanese}語あります`);
  if (missingDistractors > 0) notes.push(`ダミー選択肢が空の単語が${missingDistractors}語あります`);
  if (missingExample > 0) notes.push(`例文が空の単語が${missingExample}語あります`);

  return notes;
}
