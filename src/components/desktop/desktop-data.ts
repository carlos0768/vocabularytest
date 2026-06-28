import type { Project, Word, WordStatus } from '@/types';

export const DESKTOP_THUMBS = [
  '#15803d',
  '#1f6f73',
  '#b45309',
  '#475569',
  '#6d28d9',
  '#9f1239',
  '#4d7c0f',
  '#1e3a8a',
];

export const DESKTOP_STATUS_LABEL: Record<WordStatus, string> = {
  mastered: '習得',
  active: '定着中',
  review: '学習中',
  new: '未学習',
};

const POS_LABELS: Record<string, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  phrase: '句',
  idiom: 'イディオム',
  phrasal_verb: '句動詞',
  preposition: '前置詞',
  conjunction: '接続詞',
  pronoun: '代名詞',
  determiner: '限定詞',
  article: '冠詞',
  interjection: '感嘆詞',
  auxiliary: '助動詞',
  other: 'その他',
  名詞: '名詞',
  動詞: '動詞',
  形容詞: '形容詞',
  副詞: '副詞',
  前置詞: '前置詞',
  接続詞: '接続詞',
  代名詞: '代名詞',
  熟語: '熟語',
  句動詞: '句動詞',
};

const POS_SHORT: Record<string, string> = {
  noun: '名',
  verb: '動',
  adjective: '形',
  adverb: '副',
  phrase: '句',
  idiom: '熟',
  phrasal_verb: '句',
  preposition: '前',
  conjunction: '接',
  pronoun: '代',
  determiner: '限',
  article: '冠',
  interjection: '感',
  auxiliary: '助',
  other: '他',
  名詞: '名',
  動詞: '動',
  形容詞: '形',
  副詞: '副',
  前置詞: '前',
  接続詞: '接',
  代名詞: '代',
  熟語: '熟',
  句動詞: '句',
};

function desktopPosName(tag: string) {
  const value = tag.trim();
  return POS_LABELS[value] ?? value;
}

export function desktopThumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return DESKTOP_THUMBS[Math.abs(h) % DESKTOP_THUMBS.length];
}

export function desktopPosShort(tags?: string[] | null) {
  return (tags ?? [])
    .slice(0, 2)
    .map((tag) => POS_SHORT[tag.trim()] ?? desktopPosName(tag).charAt(0))
    .join('·') || '-';
}

export function desktopPosLabel(tags?: string[] | null) {
  return (tags ?? [])
    .filter((tag) => tag.trim().length > 0)
    .slice(0, 2)
    .map(desktopPosName)
    .join('・') || '-';
}

const UUID_LIKE_SOURCE_LABEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_LIKE_SOURCE_LABEL = /^[A-Za-z0-9_-]{24,}$/;

function isOpaqueSourceLabel(label: string) {
  const value = label.trim();
  return UUID_LIKE_SOURCE_LABEL.test(value) || TOKEN_LIKE_SOURCE_LABEL.test(value);
}

export function desktopSourceLabel(project: Pick<Project, 'sourceLabels'>) {
  const labels = (project.sourceLabels ?? [])
    .filter((label) => !isOpaqueSourceLabel(label))
    .slice(0, 2);
  return labels.length ? labels.join(' · ') : '手入力';
}

export function desktopUpdatedLabel(iso?: string | null) {
  if (!iso) return '最近';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '最近';
  const days = Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  if (days === 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 7) return `${days}日前`;
  if (days < 31) return `${Math.floor(days / 7)}週間前`;
  return `${Math.floor(days / 30)}ヶ月前`;
}

export function desktopCountWords(words: Word[]) {
  return words.reduce(
    (acc, word) => {
      acc.total += 1;
      if (word.status === 'mastered') acc.mastered += 1;
      else if (word.status === 'active') acc.active += 1;
      else if (word.status === 'review') acc.review += 1;
      else acc.neww += 1;
      if (word.isFavorite) acc.favorite += 1;
      return acc;
    },
    { total: 0, mastered: 0, active: 0, review: 0, neww: 0, favorite: 0 },
  );
}
