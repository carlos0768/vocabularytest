// Site-wide avatar/thumbnail palette (matches home, collections, shared, feed, stats).
// プロフィール画面とシェア画像(opengraph-image)で同じ色を出すため、
// クライアント専用ではないこのモジュールに置く。
export const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

export function profileAvatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }
  return THUMBS[Math.abs(hash) % THUMBS.length];
}
