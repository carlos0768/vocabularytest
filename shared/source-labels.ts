const NOTE_LABELS = new Set([
  'note',
  'notes',
  'notebook',
  'ノート',
  'ﾉｰﾄ',
]);

const GENERIC_SOURCE_LABELS = new Set([
  '教材',
  '教材名',
  '英語教材',
  '英単語教材',
  '参考書',
  '参考書名',
  '単語帳',
  '英単語帳',
  '問題集',
  '教科書',
  'テキスト',
  'ワーク',
  'プリント',
  'book',
  'books',
  'textbook',
  'textbooks',
  'workbook',
  'workbooks',
  'worksheet',
  'worksheets',
  'study material',
  'study materials',
  'english material',
  'english materials',
  'vocabulary book',
]);

const GENERIC_SOURCE_LABEL_PATTERNS = [
  /^(?:英語|高校英語|受験英語|大学受験英語|英単語)?\s*(?:教材|参考書|単語帳|英単語帳|問題集|教科書|テキスト|ワーク|プリント)$/u,
  /^(?:english|vocabulary|study)\s+(?:material|materials|textbook|textbooks|book|books|workbook|workbooks|worksheet|worksheets)$/iu,
];

const GENERIC_PREFIX_WITH_SEPARATOR =
  /^(?:英語教材|英単語教材|教材|参考書|単語帳|英単語帳|問題集|教科書|テキスト|ワーク|プリント)\s*[:：\-ー]\s*/u;
const GENERIC_SUFFIX_WITH_SEPARATOR =
  /\s*[:：\-ー]\s*(?:英語教材|英単語教材|教材|参考書|単語帳|英単語帳|問題集|教科書|テキスト|ワーク|プリント)$/u;

function stripWrappingQuotes(value: string): string {
  let next = value;

  while (next.length >= 2) {
    const first = next[0];
    const last = next[next.length - 1];
    const wrapped =
      (first === '「' && last === '」') ||
      (first === '『' && last === '』') ||
      (first === '【' && last === '】') ||
      (first === '（' && last === '）') ||
      (first === '"' && last === '"') ||
      (first === '\'' && last === '\'');

    if (!wrapped) break;
    next = next.slice(1, -1).trim();
  }

  return next;
}

function isGenericSourceLabel(value: string): boolean {
  const lower = value.toLowerCase();
  return GENERIC_SOURCE_LABELS.has(lower) || GENERIC_SOURCE_LABEL_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSourceLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let normalized = normalizeWhitespace(value);
  normalized = stripWrappingQuotes(normalized);
  normalized = normalizeWhitespace(normalized.replace(GENERIC_PREFIX_WITH_SEPARATOR, '').replace(GENERIC_SUFFIX_WITH_SEPARATOR, ''));
  if (!normalized) return null;

  if (NOTE_LABELS.has(normalized.toLowerCase())) {
    return 'ノート';
  }

  if (isGenericSourceLabel(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeSourceLabels(values: Iterable<unknown> | null | undefined): string[] {
  if (!values) return [];

  const deduped = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeSourceLabel(value);
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('ja-JP');
    if (deduped.has(key)) continue;

    deduped.add(key);
    result.push(normalized);
  }

  return result;
}

export function mergeSourceLabels(...groups: Array<Iterable<unknown> | null | undefined>): string[] {
  return normalizeSourceLabels(groups.flatMap((group) => (group ? Array.from(group) : [])));
}

export function ensureSourceLabels(values: Iterable<unknown> | null | undefined): string[] {
  const normalized = normalizeSourceLabels(values);
  return normalized.length > 0 ? normalized : ['ノート'];
}
