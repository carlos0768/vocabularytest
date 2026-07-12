/**
 * 接辞候補マッチャー
 *
 * 抽出された英単語に対して、カタログ内の接辞を綴りベースで照合し、
 * AI に送る候補リストを作る（検出語に関係する接辞だけを送ることで
 * トークンを節約する）。マッチした (form, kind) の **全 senses** を
 * 候補に含めるのが要件（同綴り異義は AI が id で選ぶ）。
 */

import { AFFIX_CATALOG, type AffixSense } from './affix-catalog';

/** 接辞を除いた後に最低限残っていてほしい語根の長さ */
const MIN_ROOT_LENGTH = 3;

function normalizeWordForMatching(english: string): string {
  return english.trim().toLowerCase().replace(/[^a-z]/g, '');
}

function singleFormMatchesWord(word: string, form: string, kind: AffixSense['kind']): boolean {
  if (!word || !form) return false;

  if (kind === 'prefix') {
    return word.startsWith(form) && word.length - form.length >= MIN_ROOT_LENGTH;
  }
  if (kind === 'suffix') {
    return word.endsWith(form) && word.length - form.length >= MIN_ROOT_LENGTH;
  }
  // infix: 語頭・語末を除いた内部に現れるか（連結母音などの1文字 form を含む）
  const interior = word.slice(1, -1);
  return interior.includes(form) && word.length - form.length >= MIN_ROOT_LENGTH;
}

function formMatchesWord(word: string, sense: AffixSense): boolean {
  // altForms は同化形（uni- が unanimous では「un」として現れる等）も候補に乗せる
  const forms = [sense.form, ...(sense.altForms ?? [])];
  return forms.some((form) => singleFormMatchesWord(word, form, sense.kind));
}

/**
 * 単語にマッチする接辞候補を返す。
 * ある sense がマッチしたら、同じ (form, kind) を持つ全 sense を含める
 * （綴りが同じで意味が違うものは AI がどれかを id で指定して返すため）。
 */
export function findAffixCandidates(
  english: string,
  catalog: readonly AffixSense[] = AFFIX_CATALOG,
): AffixSense[] {
  const word = normalizeWordForMatching(english);
  if (word.length < MIN_ROOT_LENGTH + 1) return [];

  const matchedSenseIds = new Set<string>();
  const matchedFormKinds = new Set<string>();
  for (const sense of catalog) {
    if (formMatchesWord(word, sense)) {
      matchedSenseIds.add(sense.id);
      matchedFormKinds.add(`${sense.form} ${sense.kind}`);
    }
  }
  if (matchedSenseIds.size === 0) return [];

  return catalog.filter(
    (sense) => matchedSenseIds.has(sense.id) || matchedFormKinds.has(`${sense.form} ${sense.kind}`),
  );
}
