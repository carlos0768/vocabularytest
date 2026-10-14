// 単語帳のセクション (1冊の中の区切り)。単語帳ページの一覧とページ送りが使う。
//
// セクションは名前で識別する。並び順と「まだ単語の無いセクション」は
// `Project.sectionNames` が持ち、単語は `Word.sectionName` で所属を持つ (null = 未分類)。
import type { Word } from '@/types';
import { normalizeSectionName, normalizeSectionNames } from '../../../shared/word-sections';

export { normalizeSectionName, normalizeSectionNames };

/** セクションのある単語帳で、どこにも入っていない語のまとまりの呼び名。 */
export const UNSECTIONED_LABEL = '未分類';

export type WordSectionGroup = {
  /** null = 未分類 (セクションが1つも無い単語帳では全語) */
  name: string | null;
  words: Word[];
};

/**
 * 単語帳のセクション名 (表示順)。単語帳に登録された順のあとに、
 * 単語だけが持っている名前 (同期の行き違いなど) を出てきた順に足す。
 */
export function resolveProjectSectionNames(
  projectSectionNames: readonly string[] | undefined,
  words: readonly Pick<Word, 'sectionName'>[],
): string[] {
  const names = normalizeSectionNames(projectSectionNames ?? []);
  const seen = new Set(names);
  for (const word of words) {
    const name = normalizeSectionName(word.sectionName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * 一覧のまとまり。セクションが無ければ全語で1つ。
 * 未分類は単語帳に未分類の語があるときだけ先頭に置く。
 * 絞り込みで語が減ってもまとまりの数は変えない (ページ送りの位置がずれないように)。
 */
export function buildWordSectionGroups(
  sectionNames: readonly string[],
  allWords: readonly Word[],
  displayedWords: readonly Word[],
): WordSectionGroup[] {
  if (sectionNames.length === 0) {
    return [{ name: null, words: [...displayedWords] }];
  }

  const known = new Set(sectionNames);
  const sectionOf = (word: Word): string | null => {
    const name = normalizeSectionName(word.sectionName);
    return name && known.has(name) ? name : null;
  };

  const byName = new Map<string | null, Word[]>();
  for (const word of displayedWords) {
    const key = sectionOf(word);
    const bucket = byName.get(key);
    if (bucket) bucket.push(word);
    else byName.set(key, [word]);
  }

  const groups: WordSectionGroup[] = [];
  if (allWords.some((word) => sectionOf(word) === null)) {
    groups.push({ name: null, words: byName.get(null) ?? [] });
  }
  for (const name of sectionNames) {
    groups.push({ name, words: byName.get(name) ?? [] });
  }
  return groups;
}

/** 下部バーに出すまとまりの名前。セクションの無い単語帳では null (語数だけ出す)。 */
export function getSectionGroupLabel(group: WordSectionGroup, groupCount: number): string | null {
  if (group.name) return group.name;
  return groupCount > 1 ? UNSECTIONED_LABEL : null;
}

/** 名前の並びにセクションを足す。既にあれば並びは変えない。 */
export function insertSectionName(
  names: readonly string[],
  rawName: string,
  position: 'start' | 'end',
): string[] {
  const name = normalizeSectionName(rawName);
  const current = normalizeSectionNames(names);
  if (!name || current.includes(name)) return current;
  return position === 'start' ? [name, ...current] : [...current, name];
}

/**
 * セクションの名前を変える (並び順はそのまま)。
 * 新しい名前が空・既にある名前・元の名前が無いときは変えずに返す。
 */
export function renameSectionName(
  names: readonly string[],
  oldName: string,
  rawNewName: string,
): string[] {
  const current = normalizeSectionNames(names);
  const from = normalizeSectionName(oldName);
  const to = normalizeSectionName(rawNewName);
  if (!from || !to || from === to || !current.includes(from) || current.includes(to)) return current;
  return current.map((name) => (name === from ? to : name));
}

/** セクションを並びから外す (並び順はそのまま)。無い名前なら変えずに返す。 */
export function removeSectionName(names: readonly string[], rawName: string): string[] {
  const current = normalizeSectionNames(names);
  const name = normalizeSectionName(rawName);
  return name ? current.filter((existing) => existing !== name) : current;
}

/** セクションを1つ前 (-1) / 後ろ (+1) へ動かす。端を越える・無い名前なら変えずに返す。 */
export function moveSectionName(names: readonly string[], rawName: string, delta: -1 | 1): string[] {
  const current = normalizeSectionNames(names);
  const name = normalizeSectionName(rawName);
  const from = name ? current.indexOf(name) : -1;
  const to = from + delta;
  if (from < 0 || to < 0 || to >= current.length) return current;
  const next = [...current];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** 新しいセクションの名前の初期値 (「セクション3」など、まだ使われていない番号)。 */
export function suggestNewSectionName(names: readonly string[]): string {
  const used = new Set(names);
  let n = names.length + 1;
  while (used.has(`セクション${n}`)) n += 1;
  return `セクション${n}`;
}
