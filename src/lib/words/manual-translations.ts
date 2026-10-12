/**
 * 手動追加でユーザーが入力した日本語訳 (複数可) を、保存用の形に均す。
 *
 * 入力欄は訳ごとに分かれているが、1つの欄に「美しい；きれいな」と書かれても
 * 別の訳として扱う (スキャン・AI補完と同じ分割規則)。空欄と重複は落とす。
 */

import type { WordTranslation } from '../../../shared/types';
import { dedupeJapaneseTranslations } from './manual-enrichment';

/** 手動追加で入力できる訳の欄の上限。AI補完の上限と揃える。 */
export const MANUAL_TRANSLATION_INPUT_LIMIT = 8;

export interface ManualTranslationsInput {
  /** 第一訳。何も入力されていなければ空文字。 */
  japanese: string;
  /**
   * 訳が2つ以上あるときだけ、訳ごとの WordTranslation を返す。
   * 1つだけなら従来どおり japanese だけで保存する (訳レコードはサーバーが作る)。
   */
  translations?: WordTranslation[];
}

export function buildManualTranslations(inputs: readonly string[]): ManualTranslationsInput {
  const texts = dedupeJapaneseTranslations(inputs, MANUAL_TRANSLATION_INPUT_LIMIT);
  const japanese = texts[0] ?? '';
  if (texts.length < 2) return { japanese };

  return {
    japanese,
    translations: texts.map((text, index) => ({
      translationJa: text,
      normalizedTranslationJa: text,
      source: 'user' as const,
      meaningRank: index + 1,
      position: index,
      isPrimary: index === 0,
    })),
  };
}
