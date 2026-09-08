import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  normalizeSnapshotTranslations,
  type SnapshotTranslation,
} from '@/lib/shared-projects/snapshot-translations';
import {
  OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS,
  type OfficialWordbookEikenLevelValue,
} from './editor';

/**
 * 公式単語帳(official_wordbooks / official_wordbook_words)の一般ユーザー向け
 * カタログ。共有ページ (/shared の「公式」タブ) と /official/[slug] から使う。
 *
 * official_wordbooks の SELECT ポリシーは authenticated 限定なので、
 * 未ログインでも一覧だけは見えるように service-role client で読む
 * (共有単語帳 discover / 語法問題集の公開一覧と同じ方針)。中身 (全単語) は
 * ログイン必須で、未ログインには先頭数語のプレビューだけを返す。
 */

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export type OfficialWordbookCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  eikenLevel: OfficialWordbookEikenLevelValue | null;
  /** 英検レベルの表示名 (「英検準1級」)。レベル未設定は null */
  eikenLabel: string | null;
  iconImage: string | null;
  sourceLabels: string[];
  /** 埋め込みカウントが引けなかった環境では null */
  wordCount: number | null;
};

export type OfficialWordbookCatalogPayload = {
  items: OfficialWordbookCard[];
  nextCursor: string | null;
};

export type OfficialWordbookCatalogWord = {
  english: string;
  japanese: string;
  translations?: SnapshotTranslation[];
  distractors: string[];
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  partOfSpeechTags?: string[];
  vocabularyType?: 'active' | 'passive';
};

export type OfficialWordbookDetailPayload = {
  wordbook: OfficialWordbookCard;
  words: OfficialWordbookCatalogWord[];
  totalWordCount: number;
  /** true = 未ログインなので先頭 OFFICIAL_WORDBOOK_GUEST_PREVIEW_WORDS 語だけ返している */
  previewOnly: boolean;
};

export type OfficialWordbookCatalogOptions = {
  limit?: number;
  cursor?: string | null;
  query?: string | null;
};

const CARD_COLUMNS = 'id,slug,title,description,eiken_level,source_labels,icon_image,sort_order,created_at';

const WORD_COLUMNS =
  'english,japanese,translations,distractors,pronunciation,example_sentence,example_sentence_ja,part_of_speech_tags,vocabulary_type,sort_order,created_at,id';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 40;

/**
 * 公式単語帳は運営が作る数十冊規模なので、検索・並べ替えは全件取ってから
 * メモリ側で行う (語法問題集の公開一覧と同じ割り切り)。
 */
const CATALOG_FETCH_LIMIT = 200;

/** 未ログインで見せる単語数。共有単語帳のプレビュー(5語)に合わせる。 */
export const OFFICIAL_WORDBOOK_GUEST_PREVIEW_WORDS = 5;

/** 英検の易しい順。一覧はこの順に並べる (レベル未設定は末尾)。 */
const EIKEN_LEVEL_RANK: Record<OfficialWordbookEikenLevelValue, number> = {
  '5': 0,
  '4': 1,
  '3': 2,
  pre2: 3,
  '2': 4,
  pre1: 5,
  '1': 6,
};

function clampPageSize(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(Number(limit))));
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeOffsetCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };
    return typeof parsed.offset === 'number' && Number.isFinite(parsed.offset) && parsed.offset > 0
      ? Math.floor(parsed.offset)
      : 0;
  } catch {
    return 0;
  }
}

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
  return typeof value === 'string' && value in EIKEN_LEVEL_RANK
    ? (value as OfficialWordbookEikenLevelValue)
    : null;
}

/**
 * PostgREST の埋め込みカウント(`official_wordbook_words(count)`)は
 * `[{ count: n }]` の形で返る。関係名が解決できない環境では null にして
 * 一覧側で「-」を出す。
 */
function toEmbeddedCount(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) {
    const first = value[0] as { count?: unknown } | undefined;
    return first && typeof first.count === 'number' ? first.count : null;
  }
  if (value && typeof value === 'object' && typeof (value as { count?: unknown }).count === 'number') {
    return (value as { count: number }).count;
  }
  return null;
}

type OfficialWordbookCatalogRow = OfficialWordbookCard & {
  sortOrder: number;
  createdAt: string;
};

function mapCatalogRow(row: Record<string, unknown>): OfficialWordbookCatalogRow {
  const eikenLevel = toEikenLevel(row.eiken_level);
  const sourceLabels = toStringArray(row.source_labels, 20);
  const description = typeof row.description === 'string' && row.description.trim()
    ? row.description.trim()
    : null;

  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    description,
    eikenLevel,
    eikenLabel: eikenLevel ? OFFICIAL_WORDBOOK_EIKEN_LEVEL_LABELS[eikenLevel] : null,
    iconImage: typeof row.icon_image === 'string' && row.icon_image.trim() ? row.icon_image : null,
    sourceLabels: sourceLabels.length > 0 ? sourceLabels : ['official'],
    wordCount: toEmbeddedCount(row.official_wordbook_words),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    createdAt: String(row.created_at ?? ''),
  };
}

/** 並べ替え用の内部フィールド (sortOrder / createdAt) を落として公開形にする。 */
function toCard(row: OfficialWordbookCatalogRow): OfficialWordbookCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    eikenLevel: row.eikenLevel,
    eikenLabel: row.eikenLabel,
    iconImage: row.iconImage,
    sourceLabels: row.sourceLabels,
    wordCount: row.wordCount,
  };
}

function compareCatalogRows(a: OfficialWordbookCatalogRow, b: OfficialWordbookCatalogRow): number {
  const rankA = a.eikenLevel ? EIKEN_LEVEL_RANK[a.eikenLevel] : Number.MAX_SAFE_INTEGER;
  const rankB = b.eikenLevel ? EIKEN_LEVEL_RANK[b.eikenLevel] : Number.MAX_SAFE_INTEGER;
  return rankA - rankB
    || a.sortOrder - b.sortOrder
    || a.createdAt.localeCompare(b.createdAt)
    || a.slug.localeCompare(b.slug);
}

function normalizeSearchQuery(query?: string | null): string {
  return (query ?? '').trim().toLowerCase();
}

function rowMatchesSearch(row: OfficialWordbookCatalogRow, query: string): boolean {
  if (!query) return true;
  const haystack = [row.title, row.description ?? '', row.slug, row.eikenLabel ?? '', ...row.sourceLabels]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * 公開中(is_active)の公式単語帳の一覧。ログイン不要で、返すのはタイトル・
 * 英検レベル・単語数などの要約だけ (単語の中身は含めない)。
 */
export async function listPublicOfficialWordbooks(
  options: OfficialWordbookCatalogOptions = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<OfficialWordbookCatalogPayload> {
  const limit = clampPageSize(options.limit);
  const query = normalizeSearchQuery(options.query);
  const offset = decodeOffsetCursor(options.cursor);

  // 単語数は埋め込みカウントで一度に取る。関係名が解決できない環境では
  // カウントだけ落として一覧は出す (管理APIと同じフォールバック)。
  const withCounts = await admin
    .from('official_wordbooks')
    .select(`${CARD_COLUMNS},official_wordbook_words(count)`)
    .eq('is_active', true)
    .limit(CATALOG_FETCH_LIMIT);

  let rows = withCounts.data as unknown as Record<string, unknown>[] | null;
  if (withCounts.error) {
    const fallback = await admin
      .from('official_wordbooks')
      .select(CARD_COLUMNS)
      .eq('is_active', true)
      .limit(CATALOG_FETCH_LIMIT);
    if (fallback.error) {
      console.warn('[official-wordbooks] catalog lookup failed:', withCounts.error.message);
      return { items: [], nextCursor: null };
    }
    rows = fallback.data as unknown as Record<string, unknown>[] | null;
  }

  const catalog = (rows ?? [])
    .map(mapCatalogRow)
    .filter((row) => row.slug && row.title)
    .filter((row) => rowMatchesSearch(row, query))
    .sort(compareCatalogRows);

  const pageRows = catalog.slice(offset, offset + limit);

  return {
    items: pageRows.map(toCard),
    nextCursor: catalog.length > offset + limit ? encodeOffsetCursor(offset + limit) : null,
  };
}

function mapCatalogWord(row: Record<string, unknown>): OfficialWordbookCatalogWord {
  const translations = normalizeSnapshotTranslations(row.translations);
  const partOfSpeechTags = toStringArray(row.part_of_speech_tags, 10);
  const pronunciation = typeof row.pronunciation === 'string' ? row.pronunciation.trim() : '';
  const exampleSentence = typeof row.example_sentence === 'string' ? row.example_sentence.trim() : '';
  const exampleSentenceJa = typeof row.example_sentence_ja === 'string' ? row.example_sentence_ja.trim() : '';

  return {
    english: String(row.english ?? '').trim(),
    japanese: typeof row.japanese === 'string' ? row.japanese.trim() : '',
    ...(translations ? { translations } : {}),
    distractors: toStringArray(row.distractors, 10),
    ...(pronunciation ? { pronunciation } : {}),
    ...(exampleSentence ? { exampleSentence } : {}),
    ...(exampleSentenceJa ? { exampleSentenceJa } : {}),
    ...(partOfSpeechTags.length > 0 ? { partOfSpeechTags } : {}),
    ...(row.vocabulary_type === 'active' || row.vocabulary_type === 'passive'
      ? { vocabularyType: row.vocabulary_type }
      : {}),
  };
}

/**
 * 公開中の公式単語帳1冊 + 単語。`wordLimit` を渡すとその件数までに絞り、
 * `totalWordCount` には全体の件数を返す (未ログインのプレビュー用)。
 * 見つからない・非公開のときは null。
 */
export async function getPublicOfficialWordbook(
  slug: string,
  options: { wordLimit?: number | null } = {},
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<OfficialWordbookDetailPayload | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  const { data: bookRow, error: bookError } = await admin
    .from('official_wordbooks')
    .select(CARD_COLUMNS)
    .eq('slug', normalizedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (bookError) {
    console.warn('[official-wordbooks] detail lookup failed:', bookError.message);
    return null;
  }
  if (!bookRow) return null;

  const wordLimit = typeof options.wordLimit === 'number' && options.wordLimit > 0
    ? Math.floor(options.wordLimit)
    : null;

  let wordsQuery = admin
    .from('official_wordbook_words')
    .select(WORD_COLUMNS, { count: 'exact' })
    .eq('official_wordbook_id', String((bookRow as Record<string, unknown>).id))
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (wordLimit !== null) wordsQuery = wordsQuery.limit(wordLimit);

  const { data: wordRows, count, error: wordsError } = await wordsQuery;
  if (wordsError) {
    throw new Error(wordsError.message || 'official_wordbook_words_failed');
  }

  const words = ((wordRows ?? []) as unknown as Record<string, unknown>[])
    .map(mapCatalogWord)
    .filter((word) => word.english !== '');

  const card = toCard(mapCatalogRow(bookRow as Record<string, unknown>));
  const totalWordCount = typeof count === 'number' ? count : words.length;

  return {
    wordbook: { ...card, wordCount: totalWordCount },
    words,
    totalWordCount,
    previewOnly: wordLimit !== null && totalWordCount > words.length,
  };
}
