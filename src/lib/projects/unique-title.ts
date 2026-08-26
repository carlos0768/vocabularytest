/**
 * 単語帳名の重複回避。
 *
 * 共有単語帳やリールの単語帳を自分のものとして取り込むときは、元の単語帳名を
 * そのまま使う。同じ単語帳を2回取り込んだり、たまたま同名の単語帳を持っていたり
 * すると、マイ単語帳に同じ名前のカードが並んで見分けが付かなくなるので、
 * 既存と衝突する名前には「タイトル（1）」「タイトル（2）」…と連番を付ける。
 */

/** 既に連番が付いている名前（「タイトル（2）」）の末尾。 */
const NUMBERED_SUFFIX_PATTERN = /（\d+）$/;

function normalizeTitle(title: string): string {
  return title.trim();
}

/**
 * `desiredTitle` が `existingTitles` と衝突しない名前を返す。
 *
 * 衝突しなければ元の文字列をそのまま返す。衝突する場合は末尾の連番を付け替えて
 * （「本（1）」を取り込んで既にあるなら「本（2）」）、空いている最小の番号を使う。
 */
export function resolveUniqueProjectTitle(
  desiredTitle: string,
  existingTitles: Iterable<string>,
): string {
  const desired = normalizeTitle(desiredTitle);

  const taken = new Set<string>();
  for (const title of existingTitles) {
    if (typeof title !== 'string') continue;
    const normalized = normalizeTitle(title);
    if (normalized) taken.add(normalized);
  }

  if (!desired || !taken.has(desired)) return desiredTitle;

  // 「本（1）」がぶつかったときは「本（1）（1）」ではなく「本（2）」にしたいので、
  // 既に付いている連番は落としてから振り直す。
  const base = normalizeTitle(desired.replace(NUMBERED_SUFFIX_PATTERN, '')) || desired;

  let suffix = 1;
  let candidate = `${base}（${suffix}）`;
  // taken は有限なので必ず終わる。
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}（${suffix}）`;
  }
  return candidate;
}
