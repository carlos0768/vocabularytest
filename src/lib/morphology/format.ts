/**
 * 語源式のフォーマッタ（scan confirm / リール / 豆知識で共用）
 */

import type { WordMorphology } from '../../../shared/types';

/**
 * WordMorphology の formula を「un(否定) ＋ anim(心) ＋ ous(形容詞化)」形式の
 * 文字列にする。表示可能な formula がない場合は空文字を返す。
 */
export function formatMorphologyFormula(morphology: WordMorphology | null | undefined): string {
  if (!morphology || morphology.none || morphology.formula.length === 0) return '';
  return morphology.formula
    .map((part) => `${part.text}(${part.meaningJa})`)
    .join(' ＋ ');
}

/** 表示すべき語源情報を持っているか */
export function hasDisplayableMorphology(
  morphology: WordMorphology | null | undefined,
): morphology is WordMorphology {
  return Boolean(
    morphology && !morphology.none && morphology.formula.length > 0 && morphology.explanation,
  );
}
