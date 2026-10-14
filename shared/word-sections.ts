// 単語帳のセクション名の正規化 (Web / DB マッパー共通)。

/** セクション名の最大文字数。DB の CHECK 制約と揃える。 */
export const SECTION_NAME_MAX_LENGTH = 40;
/** 1冊に持てるセクションの上限。 */
export const MAX_SECTIONS_PER_PROJECT = 200;

/** 前後の空白を落とし、空なら null。長すぎる名前は切り詰める。 */
export function normalizeSectionName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return Array.from(trimmed).slice(0, SECTION_NAME_MAX_LENGTH).join('');
}

/** セクション名の配列を正規化する。空・重複は落とし、並び順は保つ。 */
export function normalizeSectionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    const name = normalizeSectionName(item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= MAX_SECTIONS_PER_PROJECT) break;
  }
  return names;
}
