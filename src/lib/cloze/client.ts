import { filterWordsForAnswerFormat } from '@/lib/quiz/answer-format-words';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import type { Word } from '@/types';
import type { ClozeWordInput } from './server';

/**
 * 空所補充ページ (`/cloze-quiz/[projectId]`) の、画面から切り離せる部分。
 */

export const DEFAULT_CLOZE_QUIZ_COUNT = 10;
export const MAX_CLOZE_QUIZ_COUNT = 30;
/** API に一度に渡せる語数 (route.ts の上限と合わせる)。 */
export const MAX_CLOZE_REQUEST_WORDS = 40;

/** URL の count を 1〜30 に丸める。 */
export function resolveClozeQuizCount(raw: string | null | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CLOZE_QUIZ_COUNT;
  return Math.min(parsed, MAX_CLOZE_QUIZ_COUNT);
}

/**
 * 出題候補としてサーバーへ送る語。
 *
 * - 四択と同じく Passive (P) の語だけ (語彙モード未設定も Passive あつかい)。
 *   英文の中で意味を読み取れればよい、という受け身の知識を問う形式なので。
 * - 覚えた語 (mastered) は、他に語があれば外す。
 * - 復習の優先度順。出題文や誤答がそろわない語もあるので、問題数の倍を目安に多めに送る。
 */
export function pickClozeRequestWords(words: readonly Word[], count: number): Word[] {
  let pool = filterWordsForAnswerFormat(words, 'normal').filter(isClozeRequestable);
  const unmastered = pool.filter((word) => word.status !== 'mastered');
  if (unmastered.length > 0) pool = unmastered;
  return sortWordsByPriority(pool).slice(0, Math.min(count * 2, MAX_CLOZE_REQUEST_WORDS));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** API に送れる語か。見出し語と訳が空の語はリクエストごと弾かれるので、送る前に外す。 */
export function isClozeRequestable(word: Pick<Word, 'english' | 'japanese'>): boolean {
  return word.english.trim().length > 0 && word.japanese.trim().length > 0;
}

/** API の入力に合わせて切り詰める (route.ts の Zod スキーマの上限と同じ)。 */
export function toClozeWordInput(word: Word): ClozeWordInput {
  return {
    id: word.id.slice(0, 80),
    english: word.english.trim().slice(0, 200),
    japanese: word.japanese.trim().slice(0, 300),
    translations: (word.translations ?? [])
      .map((translation) => translation.translationJa?.trim().slice(0, 300))
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, 20),
    // ローカルだけの語は lexicon の uuid を持たない。形の違う値を送ると DB で弾かれる。
    lexiconEntryId: word.lexiconEntryId && UUID_PATTERN.test(word.lexiconEntryId) ? word.lexiconEntryId : null,
    partOfSpeechTags: word.partOfSpeechTags?.map((tag) => tag.slice(0, 40)).slice(0, 10) ?? null,
    cefrLevel: word.cefrLevel?.slice(0, 4) ?? null,
  };
}

export function tatoebaSentenceUrl(id: number): string {
  return `https://tatoeba.org/ja/sentences/show/${id}`;
}

/** 出典の作者表示。孤立文 (作者なし) は「Tatoeba」とだけ書く。 */
export function attributionAuthor(author: string | null): string {
  return author ? `${author} (Tatoeba)` : 'Tatoeba';
}
