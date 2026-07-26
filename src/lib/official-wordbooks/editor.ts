import { z } from 'zod';

// 公式単語帳(official_wordbooks / official_wordbook_words)を管理画面から
// 作成・編集・公開するための共通スキーマとマッパー。
// /ops/official-wordbooks(クライアント)と /api/ops/official-wordbooks(サーバー)の
// 両方でこのスキーマを使い、貼り付けたデータをサーバー側でも必ず再検証する。
//
// 公開 = is_active。英検レベル別の既定単語帳 = is_default で、
// サインアップ時の初期インポート(seedDefaultOfficialWordbooksForUser)は
// is_active かつ eiken_level 一致の単語帳のうち is_default のものを配る。

export const OFFICIAL_WORDBOOK_EIKEN_LEVELS = ['5', '4', '3', 'pre2', '2', 'pre1', '1'] as const;
export type OfficialWordbookEikenLevelValue = (typeof OFFICIAL_WORDBOOK_EIKEN_LEVELS)[number];

export const OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS: Record<OfficialWordbookEikenLevelValue, string> = {
  '5': '英検5級',
  '4': '英検4級',
  '3': '英検3級',
  pre2: '英検準2級',
  '2': '英検2級',
  pre1: '英検準1級',
  '1': '英検1級',
};

/** 1単語帳あたりの上限。管理画面の一括貼り付けで事故を起こさないための安全弁。 */
export const MAX_OFFICIAL_WORDBOOK_WORDS = 2000;

/** PostgREST のバルクinsertは1回あたりを分割して投げる(巨大ボディ対策)。 */
export const OFFICIAL_WORDBOOK_WORD_INSERT_CHUNK_SIZE = 500;

// DBの official_wordbooks_slug_format CHECK と同じ正規表現。
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,80}$/;

const trimmedString = (max: number) => z.string().trim().max(max);

export const officialWordbookWordInputSchema = z
  .object({
    english: z.string().trim().min(1).max(200),
    japanese: trimmedString(500).optional().default(''),
    distractors: z.array(z.string().trim().min(1).max(200)).max(10).optional().default([]),
    exampleSentence: trimmedString(1000).optional().default(''),
    exampleSentenceJa: trimmedString(1000).optional().default(''),
    pronunciation: trimmedString(200).optional().default(''),
    partOfSpeechTags: z.array(z.string().trim().min(1).max(40)).max(10).optional().default([]),
    vocabularyType: z.enum(['active', 'passive']).nullish(),
  })
  .strict();

export type OfficialWordbookWordInput = z.infer<typeof officialWordbookWordInputSchema>;

export const officialWordbookWordsInputSchema = z
  .array(officialWordbookWordInputSchema)
  .max(MAX_OFFICIAL_WORDBOOK_WORDS);

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(81)
  .regex(SLUG_PATTERN, {
    message: 'slugは英小文字・数字・ハイフン・アンダースコアのみ(2〜81文字、先頭は英数字)',
  });

const metadataShape = {
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  description: trimmedString(1000).nullish(),
  eikenLevel: z.enum(OFFICIAL_WORDBOOK_EIKEN_LEVELS).nullish(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sourceLabels: z.array(z.string().trim().min(1).max(60)).min(1).max(20).optional(),
  iconImage: trimmedString(300).nullish(),
  sortOrder: z.number().int().min(-9999).max(9999).optional(),
};

export const officialWordbookCreateSchema = z
  .object({
    ...metadataShape,
    words: officialWordbookWordsInputSchema.optional(),
  })
  .strict()
  .superRefine(assertDefaultRequiresLevel);

export const officialWordbookUpdateSchema = z
  .object({
    slug: metadataShape.slug.optional(),
    title: metadataShape.title.optional(),
    description: metadataShape.description,
    eikenLevel: metadataShape.eikenLevel,
    isDefault: metadataShape.isDefault,
    isActive: metadataShape.isActive,
    sourceLabels: metadataShape.sourceLabels,
    iconImage: metadataShape.iconImage,
    sortOrder: metadataShape.sortOrder,
    // 指定されたときだけ単語を総入れ替えする(未指定なら単語には触れない)。
    words: officialWordbookWordsInputSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'empty update' })
  .superRefine(assertDefaultRequiresLevel);

// 既定単語帳は英検レベル単位で配られるので、レベル未設定の既定指定は必ず死に設定になる。
function assertDefaultRequiresLevel(
  value: { isDefault?: boolean; eikenLevel?: OfficialWordbookEikenLevelValue | null },
  ctx: z.RefinementCtx,
) {
  if (value.isDefault === true && !value.eikenLevel) {
    ctx.addIssue({
      code: 'custom',
      path: ['eikenLevel'],
      message: '既定単語帳にするには英検レベルの指定が必要です',
    });
  }
}

export type OfficialWordbookSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  eikenLevel: OfficialWordbookEikenLevelValue | null;
  isDefault: boolean;
  isActive: boolean;
  sourceLabels: string[];
  iconImage: string | null;
  sortOrder: number;
  wordCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type OfficialWordbookDetail = OfficialWordbookSummary & {
  words: OfficialWordbookWordInput[];
};

export const OFFICIAL_WORDBOOK_COLUMNS =
  'id,slug,title,description,eiken_level,is_default,is_active,source_labels,icon_image,sort_order,created_at,updated_at';

export const OFFICIAL_WORDBOOK_WORD_COLUMNS =
  'id,english,japanese,distractors,example_sentence,example_sentence_ja,pronunciation,part_of_speech_tags,vocabulary_type,sort_order,created_at';

function toStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result.push(trimmed);
    if (result.length >= maxItems) break;
  }
  return result;
}

function toEikenLevel(value: unknown): OfficialWordbookEikenLevelValue | null {
  return typeof value === 'string'
    && (OFFICIAL_WORDBOOK_EIKEN_LEVELS as readonly string[]).includes(value)
    ? (value as OfficialWordbookEikenLevelValue)
    : null;
}

/**
 * PostgREST の埋め込みカウント(`official_wordbook_words(count)`)は
 * `[{ count: n }]` の形で返る。関係名が使えない環境では単に null を返し、
 * 管理画面は「-」を表示する。
 */
function toEmbeddedCount(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) {
    const first = value[0] as { count?: unknown } | undefined;
    if (first && typeof first.count === 'number') return first.count;
    return null;
  }
  if (value && typeof value === 'object' && typeof (value as { count?: unknown }).count === 'number') {
    return (value as { count: number }).count;
  }
  return null;
}

export function mapOfficialWordbookRow(row: Record<string, unknown>): OfficialWordbookSummary {
  const sourceLabels = toStringArray(row.source_labels, 20);
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    description: typeof row.description === 'string' && row.description.trim() ? row.description : null,
    eikenLevel: toEikenLevel(row.eiken_level),
    isDefault: row.is_default === true,
    isActive: row.is_active === true,
    sourceLabels: sourceLabels.length > 0 ? sourceLabels : ['official'],
    iconImage: typeof row.icon_image === 'string' && row.icon_image.trim() ? row.icon_image : null,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    wordCount: toEmbeddedCount(row.official_wordbook_words),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function mapOfficialWordbookWordRow(row: Record<string, unknown>): OfficialWordbookWordInput {
  return {
    english: String(row.english ?? '').trim(),
    japanese: typeof row.japanese === 'string' ? row.japanese : '',
    distractors: toStringArray(row.distractors, 10),
    exampleSentence: typeof row.example_sentence === 'string' ? row.example_sentence : '',
    exampleSentenceJa: typeof row.example_sentence_ja === 'string' ? row.example_sentence_ja : '',
    pronunciation: typeof row.pronunciation === 'string' ? row.pronunciation : '',
    partOfSpeechTags: toStringArray(row.part_of_speech_tags, 10),
    vocabularyType: row.vocabulary_type === 'active' || row.vocabulary_type === 'passive'
      ? row.vocabulary_type
      : null,
  };
}

/** DBの UNIQUE (official_wordbook_id, lower(btrim(english))) と同じキー。 */
export function normalizeEnglishKey(english: string): string {
  return english.trim().toLowerCase();
}

/**
 * 同じ英単語が2行あるとユニークインデックス違反でバルクinsertが丸ごと失敗するので、
 * 保存前に検出して具体的な単語名でエラーを返す。
 */
export function findDuplicateEnglishTerms(words: Array<{ english: string }>): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const word of words) {
    const key = normalizeEnglishKey(word.english);
    if (!key) continue;
    if (seen.has(key)) {
      if (!duplicates.includes(key)) duplicates.push(key);
      continue;
    }
    seen.add(key);
  }
  return duplicates;
}

/**
 * バルクinsert用の行を作る。PostgREST は配列内の全オブジェクトが同じキー集合を
 * 持つことを要求する(PGRST102 "All object keys must match")ので、
 * 未入力の任意項目も明示的に null / 既定値で埋める(import-default.ts と同じ理由)。
 */
export function buildOfficialWordbookWordRows(
  officialWordbookId: string,
  words: OfficialWordbookWordInput[],
): Record<string, unknown>[] {
  return words.map((word, index) => ({
    official_wordbook_id: officialWordbookId,
    english: word.english.trim(),
    japanese: word.japanese?.trim() ? word.japanese.trim() : null,
    translations: [],
    distractors: word.distractors ?? [],
    vocabulary_type: word.vocabularyType ?? null,
    japanese_source: null,
    lexicon_entry_id: null,
    lexicon_sense_id: null,
    example_sentence: word.exampleSentence?.trim() ? word.exampleSentence.trim() : null,
    example_sentence_ja: word.exampleSentenceJa?.trim() ? word.exampleSentenceJa.trim() : null,
    pronunciation: word.pronunciation?.trim() ? word.pronunciation.trim() : null,
    part_of_speech_tags: word.partOfSpeechTags && word.partOfSpeechTags.length > 0
      ? word.partOfSpeechTags
      : null,
    related_words: null,
    usage_patterns: null,
    word_order_quiz: null,
    custom_sections: [],
    sort_order: index,
  }));
}

export function chunkWordRows<T>(rows: T[], size = OFFICIAL_WORDBOOK_WORD_INSERT_CHUNK_SIZE): T[][] {
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function buildOfficialWordbookMetadataUpdate(
  input: z.infer<typeof officialWordbookUpdateSchema>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description?.trim() ? input.description.trim() : null;
  if (input.eikenLevel !== undefined) updates.eiken_level = input.eikenLevel ?? null;
  if (input.isDefault !== undefined) updates.is_default = input.isDefault;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.sourceLabels !== undefined) updates.source_labels = input.sourceLabels;
  if (input.iconImage !== undefined) updates.icon_image = input.iconImage?.trim() ? input.iconImage.trim() : null;
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;
  return updates;
}

// ---------------------------------------------------------------------------
// 一括貼り付け(TSV / CSV)
// ---------------------------------------------------------------------------

export type ParsedBulkWords = {
  words: OfficialWordbookWordInput[];
  errors: string[];
};

const BULK_COLUMN_HINT = '英単語 / 日本語 / ダミー選択肢(| 区切り) / 例文 / 例文和訳 / 発音 / 品詞(| 区切り)';

function splitBulkLine(line: string): string[] {
  // タブ区切りを優先。タブが無い行だけカンマ区切りとして扱う(例文にカンマが
  // 入りがちなので、タブがあるならカンマでは絶対に割らない)。
  if (line.includes('\t')) return line.split('\t');
  return line.split(',');
}

function splitMultiValue(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 管理者がスプレッドシートやAIの出力から貼り付けたテキストを単語配列に変換する。
 * 空行と `#` で始まるコメント行は無視し、行ごとの検証エラーは行番号つきで返す。
 */
export function parseOfficialWordbookWordsText(text: string): ParsedBulkWords {
  const words: OfficialWordbookWordInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const columns = splitBulkLine(rawLine).map((column) => column.trim());
    const english = columns[0] ?? '';
    if (!english) {
      errors.push(`${lineNumber}行目: 英単語が空です(${BULK_COLUMN_HINT})`);
      return;
    }

    const candidate = {
      english,
      japanese: columns[1] ?? '',
      distractors: splitMultiValue(columns[2]),
      exampleSentence: columns[3] ?? '',
      exampleSentenceJa: columns[4] ?? '',
      pronunciation: columns[5] ?? '',
      partOfSpeechTags: splitMultiValue(columns[6]),
    };

    const parsed = officialWordbookWordInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
      errors.push(`${lineNumber}行目: ${path}${issue?.message ?? 'invalid'}`);
      return;
    }

    if (words.length >= MAX_OFFICIAL_WORDBOOK_WORDS) {
      errors.push(`${lineNumber}行目以降は上限(${MAX_OFFICIAL_WORDBOOK_WORDS}語)を超えるため読み込みませんでした`);
      return;
    }

    words.push(parsed.data);
  });

  return { words, errors };
}

/** 表形式エディタの内容を貼り付け用TSVに戻す(外部ツールでの編集・バックアップ用)。 */
export function formatOfficialWordbookWordsAsText(words: OfficialWordbookWordInput[]): string {
  return words
    .map((word) => [
      word.english,
      word.japanese ?? '',
      (word.distractors ?? []).join('|'),
      word.exampleSentence ?? '',
      word.exampleSentenceJa ?? '',
      word.pronunciation ?? '',
      (word.partOfSpeechTags ?? []).join('|'),
    ].join('\t'))
    .join('\n');
}

export const OFFICIAL_WORDBOOK_AUTHORING_PROMPT = [
  'あなたは英語学習アプリ「MERKEN」の公式単語帳を作る編集者です。',
  '以下の条件で単語リストをタブ区切り(TSV)で出力してください。',
  '',
  '# 出力フォーマット(1行1単語・ヘッダー行なし・コードブロックなし)',
  '英単語\\t日本語訳\\tダミー選択肢3つ(| 区切り)\\t英語例文\\t例文の和訳\\t発音記号\\t品詞(| 区切り)',
  '',
  '# ルール',
  '- 英単語は重複させない(大文字小文字の違いだけの重複も不可)',
  '- 日本語訳は簡潔に(1〜3語程度)',
  '- ダミー選択肢は必ず3つ。正解と同じ品詞・同程度の難易度で、意味が明確に異なるものにする',
  '- 例文は対象レベルの学習者が読める長さ(10〜15語程度)にする',
  '- 発音記号はIPAをスラッシュで囲む(例: /əˈbændən/)',
  '- 品詞は「動詞」「名詞」「形容詞」などの日本語表記',
  '- 各列にタブ以外の区切り文字を入れない。空欄にする場合もタブは省略しない',
  '',
  '# このあとに単語帳のテーマ・英検レベル・語数を書きます',
].join('\n');
