import { EIKEN_LEVEL_LABELS, VOCAB_SIZE_BY_LEVEL, estimateVocabularySize } from './engine';
import type { LevelTestResultPayload } from './result-code';

// 診断結果のシェア文言。group-share.ts の GroupShareMessages と同じ形で、
// シェアシートUIとOGPの両方から使う純粋関数群。

export type LevelTestShareMessages = {
  // Web Share API 用(urlは別引数で渡す)
  native: string;
  // Xのツイート本文(urlはintentに別で渡す)
  x: string;
  // LINEメッセージ(urlは buildLineShareUrl が末尾に付ける)
  line: string;
  // Discordはインテントが無いのでurl込みでコピーする
  discord: string;
  // Instagramキャプション(コピーしてストーリー/DM/プロフィールに貼る)
  instagram: string;
};

export function buildLevelTestShareUrl(origin: string, code: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  return `${base}/level-test/r/${encodeURIComponent(code)}`;
}

// v1(階段型時代)の共有コードには能力値θが無いので級の固定値で表示する。
export function formatVocabSize(level: number): string {
  const size = VOCAB_SIZE_BY_LEVEL[level] ?? VOCAB_SIZE_BY_LEVEL[0];
  return size.toLocaleString('ja-JP');
}

export function formatVocabSizeFromTheta(theta: number): string {
  return estimateVocabularySize(theta).toLocaleString('ja-JP');
}

// v2ならθ由来の推定語彙数、v1なら級の固定値。表示・シェア文言の共通入口。
export function vocabSizeTextFor(
  payload: Pick<LevelTestResultPayload, 'finalLevel' | 'ability'>,
): string {
  return payload.ability !== undefined
    ? formatVocabSizeFromTheta(payload.ability)
    : formatVocabSize(payload.finalLevel);
}

export function buildLevelTestShareMessages(
  payload: Pick<LevelTestResultPayload, 'finalLevel' | 'clearedMax' | 'ability'>,
  url: string,
): LevelTestShareMessages {
  const grade = EIKEN_LEVEL_LABELS[payload.finalLevel] ?? EIKEN_LEVEL_LABELS[0];
  const vocab = vocabSizeTextFor(payload);
  const crown = payload.clearedMax ? '最高レベル完全制覇👑 ' : '';

  const native = `${crown}私の語彙レベルは【${grade}】、推定語彙数${vocab}語でした！🎉 あなたも20問でサクッと診断してみよう📚`;

  const x = [
    `${crown}私の語彙レベルは【${grade}】でした！🎉`,
    `推定語彙数${vocab}語📚`,
    'あなたの語彙力は英検何級レベル？20問でサクッと診断👇',
    '#MERKEN #語彙力診断 #英語学習 #英検',
  ].join('\n');

  const line = `${crown}私の語彙レベルは【${grade}】・推定語彙数${vocab}語でした！🎉 あなたも20問で診断してみて👇`;

  const discord = [
    `**📚 語彙レベル診断の結果: ${grade}(推定${vocab}語)！**${payload.clearedMax ? ' 👑' : ''}`,
    'あなたも20問で測定してみよう🔥',
    url,
  ].join('\n');

  const instagram = [
    `${crown}私の語彙レベルは【${grade}】でした🎉`,
    `推定語彙数${vocab}語📚`,
    'あなたも診断してみて✨',
    `👉 ${url}`,
    '#MERKEN #語彙力診断 #英語学習 #英検 #勉強垢',
  ].join('\n');

  return { native, x, line, discord, instagram };
}
