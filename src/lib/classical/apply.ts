// 抽出結果に古典語の共通辞書を適用する。同期パス（/api/extract）と
// 非同期パス（scan-jobs/process）の両方から同じ形で呼ぶ。
//
// やること:
//   1. 古典語だけを取り出して classical_entries / classical_senses に解決する
//   2. 解決できた語に classicalEntryId を付ける
//   3. 語義を辞書のマージ結果（保存済み優先の和集合）で置き換える
//
// 3 がヒント流用の本体。画像に①しか写っていなくても、共通辞書に貯まっている
// 完全な語義セットがそのまま使われる。
//
// **サーバ専用**。辞書への書き込みは service role が要るので、クライアントから
// 呼んではいけない（INV-12）。

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeWordTranslationPayload } from '../../../shared/word-translations';
import { isClassicalWord } from './is-classical';
import { resolveClassicalEntries, type ClassicalWordInput } from './resolve';

export interface ClassicalApplicableWord {
  english: string;
  japanese?: string;
  isClassical?: boolean;
  reading?: string;
  classicalPos?: string;
  classicalEntryId?: string;
  translations?: unknown;
}

export interface ApplyClassicalDictionaryResult<T> {
  words: T[];
  /** 共通辞書に解決できた古典語の数。ログ用。 */
  resolvedCount: number;
  /** 画像に古典語が1語も無ければ 0。この場合DBには一切触れていない。 */
  classicalCount: number;
}

/**
 * 古典語を共通辞書へ解決し、語義を流用した単語配列を返す。
 *
 * 古典語が1語も無ければDBに触らずそのまま返すので、英単語だけのスキャンには
 * 一切コストが乗らない。辞書側の失敗はすべて握りつぶし、画像由来の語義のまま
 * 進める（スキャンを止めない）。
 */
export async function applyClassicalDictionary<T extends ClassicalApplicableWord>(
  words: readonly T[],
  deps?: { supabaseAdmin?: SupabaseClient },
): Promise<ApplyClassicalDictionaryResult<T>> {
  const classicalIndexes: number[] = [];
  const inputs: ClassicalWordInput[] = [];

  words.forEach((word, index) => {
    if (!isClassicalWord(word)) return;
    classicalIndexes.push(index);
    inputs.push({
      headword: word.english,
      reading: word.reading ?? null,
      pos: word.classicalPos ?? null,
      translations: extractTranslationTexts(word),
    });
  });

  if (inputs.length === 0) {
    // 古典語が1語も無ければ admin クライアントすら作らない
    return { words: [...words], resolvedCount: 0, classicalCount: 0 };
  }

  let resolutions: Map<number, { entryId: string; translations: string[] }>;
  try {
    resolutions = await resolveClassicalEntries(deps?.supabaseAdmin ?? getSupabaseAdmin(), inputs);
  } catch (error) {
    console.warn(
      '[classical] Dictionary resolution failed, keeping image translations:',
      error instanceof Error ? error.message : error,
    );
    return { words: [...words], resolvedCount: 0, classicalCount: inputs.length };
  }

  const next = [...words];
  let resolvedCount = 0;

  resolutions.forEach((resolution, inputIndex) => {
    const wordIndex = classicalIndexes[inputIndex];
    if (wordIndex === undefined) return;
    const word = next[wordIndex];
    if (!word) return;

    resolvedCount += 1;

    // 辞書のマージ結果をそのまま語義にする（＝保存したヒントの流用）
    const payload = normalizeWordTranslationPayload({
      translations: resolution.translations,
      japanese: resolution.translations[0] ?? word.japanese,
      japaneseSource: 'scan',
    });

    next[wordIndex] = {
      ...word,
      classicalEntryId: resolution.entryId,
      ...(payload.japanese ? { japanese: payload.japanese } : {}),
      ...(payload.translations.length > 0 ? { translations: payload.translations } : {}),
    };
  });

  return { words: next, resolvedCount, classicalCount: inputs.length };
}

/** 正規化済み translations（オブジェクト配列）と生の文字列配列の両方を受ける。 */
function extractTranslationTexts(word: ClassicalApplicableWord): string[] {
  const texts: string[] = [];
  const raw = word.translations;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        texts.push(item);
      } else if (item && typeof item === 'object') {
        const value = (item as { translationJa?: unknown; japanese?: unknown });
        const text = typeof value.translationJa === 'string'
          ? value.translationJa
          : typeof value.japanese === 'string'
            ? value.japanese
            : null;
        if (text) texts.push(text);
      }
    }
  }

  if (texts.length === 0 && typeof word.japanese === 'string' && word.japanese.trim()) {
    texts.push(word.japanese);
  }

  return texts;
}
