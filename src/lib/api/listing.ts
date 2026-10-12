// 公開一覧API（共有単語帳・語法問題集・公式単語帳・グループ）で共通の
// ページング・検索ヘルパー。

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

export function decodeOffsetCursor(cursor: string | null | undefined): number {
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

export function normalizeSearchQuery(query?: string | null): string {
  return (query ?? '').trim().toLowerCase();
}

/** `normalizeSearchQuery` に加えて先頭の `@` を外す（`@handle` で作者を探せるように）。 */
export function normalizeHandleSearchQuery(query?: string | null): string {
  return (query ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export function includesSearchText(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false;
}
