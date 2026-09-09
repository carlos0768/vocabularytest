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
import {
  preferEnglishOverClassical,
  stripEnglishExamplesFromClassicalWords,
} from './purity';
import { resolveClassicalEntries, type ClassicalWordInput } from './resolve';

export interface ClassicalApplicableWord {
  english: string;
  japanese?: string;
  isClassical?: boolean;
  reading?: string;
  classicalPos?: string;
  classicalEntryId?: string;
  translations?: unknown;
  /** 英語例文の混入を落とすために読む。古典語以外では触らない。 */
  exampleSentence?: string | null;
  exampleSentenceJa?: string | null;
}

export interface ApplyClassicalDictionaryResult<T> {
  words: T[];
  /** 共通辞書に解決できた古典語の数。ログ用。 */
  resolvedCount: number;
  /** 画像に古典語が1語も無ければ 0。この場合DBには一切触れていない。 */
  classicalCount: number;
  /** 英語優先で捨てた古典語の数。ログ用。 */
  droppedClassicalCount: number;
  /** 英語例文の混入を落とした古典語の数。ログ用。 */
  strippedExampleCount: number;
}

/**
 * 古典語の純度ルールを当てたうえで共通辞書へ解決し、語義を流用した単語配列を返す。
 *
 * 3つをまとめて行う。呼び出し側が1つだけ忘れる事故を防ぐため、意図的に1関数にしてある:
 *   1. 英語と古典語が両方採れていたら英語を優先し、古典語を捨てる
 *   2. 残った古典語を共通辞書に解決し、保存済みのヒント（訳）を流用する
 *   3. 古典語に混入した英語例文を落とす
 *
 * 古典語が1語も無ければDBに触らずそのまま返すので、英単語だけのスキャンには
 * 一切コストが乗らない。辞書側の失敗はすべて握りつぶし、画像由来の語義のまま
 * 進める（スキャンを止めない）。
 */
export async function applyClassicalDictionary<T extends ClassicalApplicableWord>(
  input: readonly T[],
  deps?: { supabaseAdmin?: SupabaseClient },
): Promise<ApplyClassicalDictionaryResult<T>> {
  // 1. 英語優先。捨てる語を先に落としてから辞書を引くので、
  //    捨てる予定の古典語で共通辞書を書き足してしまうことがない。
  const { words, droppedClassicalCount } = preferEnglishOverClassical(input);

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
    return {
      words: [...words],
      resolvedCount: 0,
      classicalCount: 0,
      droppedClassicalCount,
      strippedExampleCount: 0,
    };
  }

  let resolutions: Map<number, { entryId: string; translations: string[] }>;
  try {
    resolutions = await resolveClassicalEntries(deps?.supabaseAdmin ?? getSupabaseAdmin(), inputs);
  } catch (error) {
    console.warn(
      '[classical] Dictionary resolution failed, keeping image translations:',
      error instanceof Error ? error.message : error,
    );
    const fallback = stripEnglishExamplesFromClassicalWords(words);
    return {
      words: fallback.words,
      resolvedCount: 0,
      classicalCount: inputs.length,
      droppedClassicalCount,
      strippedExampleCount: fallback.strippedCount,
    };
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

  // 3. 古典語に混入した英語例文を落とす。マスター(lexicon_entries)由来の例文が
  //    prefill されて英文が付く経路が残っているので、保存前にここで断つ。
  const sanitized = stripEnglishExamplesFromClassicalWords(next);

  return {
    words: sanitized.words,
    resolvedCount,
    classicalCount: inputs.length,
    droppedClassicalCount,
    strippedExampleCount: sanitized.strippedCount,
  };
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
