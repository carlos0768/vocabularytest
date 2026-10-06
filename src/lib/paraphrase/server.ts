// サーバー専用。クライアントから import してはいけない (数 MB の辞書がバンドルに入る)。
// `server-only` パッケージはこのリポジトリの依存に無いので、ここでは宣言だけにしている。
import rawDataset from './dataset.json';
import {
  parseParaphraseDataset,
  resolveParaphraseMaterial,
  toParaphrasePosHint,
  type ParaphraseDataset,
  type ParaphraseMaterial,
} from './dataset';

/**
 * サーバー側だけが持つデータセットの実体。
 *
 * dataset.json は数 MB あるので、ブラウザには送らずサーバーの関数バンドルに同梱して、
 * クライアントは単語帳の語を投げて材料だけ受け取る (`/api/paraphrase/lookup`)。
 * 読み込みは静的 import で行い、Vercel の関数バンドルに確実に含める (fs 読み込みは
 * ファイルトレースから漏れることがある)。解釈は最初に使うときに一度だけ。
 */
let cached: ParaphraseDataset | null = null;

export function getParaphraseDataset(): ParaphraseDataset {
  if (!cached) {
    cached = parseParaphraseDataset(rawDataset);
  }
  return cached;
}

export interface ParaphraseLookupWord {
  id: string;
  english: string;
  partOfSpeechTags?: string[];
  /** 単語帳の日本語訳。辞書の語義を選ぶのに使う (無ければ主な語義)。 */
  japanese?: string;
  translations?: string[];
}

export interface ParaphraseLookupResult extends ParaphraseMaterial {
  wordId: string;
}

/** 単語ごとの材料。材料の無い語は結果に含めない (言い換えでは出題しない)。 */
export function lookupParaphraseMaterials(words: readonly ParaphraseLookupWord[]): ParaphraseLookupResult[] {
  const dataset = getParaphraseDataset();
  const results: ParaphraseLookupResult[] = [];
  for (const word of words) {
    const hints = [word.japanese, ...(word.translations ?? [])].filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0);
    const material = resolveParaphraseMaterial(dataset, word.english, toParaphrasePosHint(word.partOfSpeechTags), hints);
    if (material) results.push({ wordId: word.id, ...material });
  }
  return results;
}
