// Site-wide thumbnail/avatar palette shared by wordbook tiles, groups, binders and avatars.
// Kept dependency-free so client components and OG image routes can both import it.
export const THUMBS: readonly string[] = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

/** ID や名前から決まる面の色。同じ文字列なら常に同じ色になる。 */
export function thumbColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}
