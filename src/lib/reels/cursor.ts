export type ReelFeedCursor = {
  seed: number;
  page: number;
};

const MAX_SAFE_SEED = 0xffffffff;

export function encodeReelCursor(cursor: ReelFeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeReelCursor(cursor: string | null | undefined): ReelFeedCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<ReelFeedCursor>;
    const seed = typeof parsed.seed === 'number' ? Math.floor(parsed.seed) : NaN;
    const page = typeof parsed.page === 'number' ? Math.floor(parsed.page) : NaN;
    if (!Number.isFinite(seed) || seed < 0 || seed > MAX_SAFE_SEED) return null;
    if (!Number.isFinite(page) || page < 0 || page > 10_000) return null;
    return { seed, page };
  } catch {
    return null;
  }
}
