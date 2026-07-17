import type { HomeReelPreviewItem } from '@/lib/home/recommendations-types';

/**
 * ホームのリールカードは表示に必要な情報（英単語・訳・語源）を既に持っている。
 * タップ時にここへシードしておき、/reels 側はフィードAPIの応答を待つ間、
 * 固定（pin）単語のカードを即時レンダリングする（体感遅延の解消）。
 */
const PINNED_PREVIEW_TTL_MS = 30_000;

let entry: { item: HomeReelPreviewItem; storedAt: number } | null = null;

/** リールカードのタップ時に呼ぶ。 */
export function seedPinnedReelPreview(item: HomeReelPreviewItem): void {
  entry = { item, storedAt: Date.now() };
}

/** /reels 側で pin に一致するシードがあれば返す（TTL内のみ）。 */
export function getPinnedReelPreview(pin: string): HomeReelPreviewItem | null {
  if (!entry) return null;
  if (entry.item.id !== pin) return null;
  if (Date.now() - entry.storedAt >= PINNED_PREVIEW_TTL_MS) {
    entry = null;
    return null;
  }
  return entry.item;
}
