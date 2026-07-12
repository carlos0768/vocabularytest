import {
  LEVEL_TEST_QUESTION_COUNT,
  MAX_LEVEL_INDEX,
  MIN_LEVEL_INDEX,
  THETA_MIN,
  THETA_STEP,
  THETA_GRID,
  levelFromTheta,
  type LevelTestConfidence,
  type LevelTestResult,
} from './engine';

// 診断結果を共有URLのパスセグメントに埋め込むための符号化。
//
// DBを使わないため、結果ページ(/level-test/r/[code])とOG画像は
// このコードだけから復元できる必要がある。ブラウザとNode(OG画像ルート)の
// 両方で動くよう、Buffer/btoaに依存しない自前のbase64urlコーデックを使う。
//
// v2 バイトレイアウト(全21バイト -> base64urlで28文字):
//   byte 0      : エンコーディングバージョン(2)
//   byte 1      : finalLevel(bit 0-2) | confidence(bit 3-4) | clearedMax(bit 6)
//   byte 2      : correctTotal(0..20)
//   byte 3      : 量子化θ(事後平均。(theta - THETA_MIN) / THETA_STEP)
//   byte 4      : 量子化θ(5%分位点)
//   byte 5      : 量子化θ(95%分位点)
//   bytes 6-12  : askedByLevel[0..6]
//   bytes 13-19 : correctByLevel[0..6]
//   byte 20     : チェックサム
//
// v1(階段型アルゴリズム時代の18バイトレイアウト)は過去の共有URLを
// 壊さないためデコードのみ引き続き受理する。
//
// チェックサムは改ざん防止ではなく「URLの手打ちミス・切り詰めを弾く」ためのもの。
// クライアント側で符号化する以上、偽造は原理的に防げない(低リスクと割り切る)。

export const RESULT_CODE_VERSION = 2;
const V1_PAYLOAD_BYTES = 18;
const V2_PAYLOAD_BYTES = 21;
const LEVEL_COUNT = 7;
const THETA_Q_MAX = THETA_GRID.length - 1; // 160

export type LevelTestResultPayload = {
  v: number;
  finalLevel: number;
  // v1の名残り。v2ではupperLevelと同値を入れる(表示互換のため)
  maxLevel: number;
  clearedMax: boolean;
  correctTotal: number;
  askedByLevel: number[];
  correctByLevel: number[];
  // v2で追加(v1のデコード結果には無い)
  ability?: number;
  lowerLevel?: number;
  upperLevel?: number;
  lowerAbility?: number;
  upperAbility?: number;
  confidence?: LevelTestConfidence;
};

const CONFIDENCE_TO_BITS: Record<LevelTestConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const BITS_TO_CONFIDENCE: readonly LevelTestConfidence[] = ['high', 'medium', 'low'];

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes: readonly number[]): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    output += BASE64URL_ALPHABET[b0 >> 2];
    output += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    output += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    output += BASE64URL_ALPHABET[b2 & 0x3f];
  }
  return output;
}

function base64UrlToBytes(code: string): number[] | null {
  const values: number[] = [];
  for (const char of code) {
    const value = BASE64URL_ALPHABET.indexOf(char);
    if (value < 0) return null;
    values.push(value);
  }

  const bytes: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const v0 = values[i];
    const v1 = values[i + 1];
    if (v1 === undefined) return null;
    bytes.push((v0 << 2) | (v1 >> 4));
    const v2 = values[i + 2];
    if (v2 === undefined) continue;
    bytes.push(((v1 & 0x0f) << 4) | (v2 >> 2));
    const v3 = values[i + 3];
    if (v3 === undefined) continue;
    bytes.push(((v2 & 0x03) << 6) | v3);
  }
  return bytes;
}

function checksumOf(bytes: readonly number[], payloadBytes: number): number {
  let sum = 0;
  for (let i = 0; i < payloadBytes - 1; i += 1) {
    sum = (sum + bytes[i]) & 0xff;
  }
  return ((sum * 31) + 7) & 0xff;
}

function quantizeTheta(theta: number): number {
  const q = Math.round((theta - THETA_MIN) / THETA_STEP);
  return Math.max(0, Math.min(THETA_Q_MAX, q));
}

function dequantizeTheta(q: number): number {
  return THETA_MIN + q * THETA_STEP;
}

export function encodeLevelTestResult(result: LevelTestResult): string {
  const abilityQ = quantizeTheta(result.ability);
  // 量子化誤差でlower <= ability <= upperが崩れないようクランプする
  const lowerQ = Math.min(abilityQ, quantizeTheta(result.lowerAbility));
  const upperQ = Math.max(abilityQ, quantizeTheta(result.upperAbility));
  // デコード側は量子化後のθからレベルを再計算して整合性を検証するため、
  // 符号化するレベルも量子化後のθから導出する(丸め境界での不一致を防ぐ)
  const finalLevel = levelFromTheta(dequantizeTheta(abilityQ));
  const clearedMax = result.clearedMax && finalLevel === MAX_LEVEL_INDEX;
  const bytes: number[] = [
    RESULT_CODE_VERSION,
    (finalLevel & 0x07)
      | ((CONFIDENCE_TO_BITS[result.confidence] & 0x03) << 3)
      | (clearedMax ? 0x40 : 0),
    result.correctTotal & 0xff,
    abilityQ,
    lowerQ,
    upperQ,
  ];
  for (let i = 0; i < LEVEL_COUNT; i += 1) bytes.push((result.askedByLevel[i] ?? 0) & 0xff);
  for (let i = 0; i < LEVEL_COUNT; i += 1) bytes.push((result.correctByLevel[i] ?? 0) & 0xff);
  bytes.push(checksumOf(bytes, V2_PAYLOAD_BYTES));
  return bytesToBase64Url(bytes);
}

function decodeV2(bytes: number[]): LevelTestResultPayload | null {
  if (bytes[V2_PAYLOAD_BYTES - 1] !== checksumOf(bytes, V2_PAYLOAD_BYTES)) return null;

  const finalLevel = bytes[1] & 0x07;
  const confidenceBits = (bytes[1] >> 3) & 0x03;
  const clearedMax = (bytes[1] & 0x40) !== 0;
  const correctTotal = bytes[2];
  const abilityQ = bytes[3];
  const lowerQ = bytes[4];
  const upperQ = bytes[5];
  const askedByLevel = bytes.slice(6, 6 + LEVEL_COUNT);
  const correctByLevel = bytes.slice(6 + LEVEL_COUNT, 6 + LEVEL_COUNT * 2);

  const confidence = BITS_TO_CONFIDENCE[confidenceBits];
  if (!confidence) return null;

  // 意味的な不変条件の検証。カジュアルなURL改変はここでnullに落ちる。
  if (finalLevel < MIN_LEVEL_INDEX || finalLevel > MAX_LEVEL_INDEX) return null;
  if (correctTotal > LEVEL_TEST_QUESTION_COUNT) return null;
  if (abilityQ > THETA_Q_MAX || lowerQ > THETA_Q_MAX || upperQ > THETA_Q_MAX) return null;
  if (!(lowerQ <= abilityQ && abilityQ <= upperQ)) return null;

  const ability = dequantizeTheta(abilityQ);
  const lowerAbility = dequantizeTheta(lowerQ);
  const upperAbility = dequantizeTheta(upperQ);
  if (levelFromTheta(ability) !== finalLevel) return null;

  let askedSum = 0;
  let correctSum = 0;
  for (let i = 0; i < LEVEL_COUNT; i += 1) {
    if (correctByLevel[i] > askedByLevel[i]) return null;
    askedSum += askedByLevel[i];
    correctSum += correctByLevel[i];
  }
  if (askedSum !== LEVEL_TEST_QUESTION_COUNT) return null;
  if (correctSum !== correctTotal) return null;

  const lowerLevel = Math.min(finalLevel, levelFromTheta(lowerAbility));
  const upperLevel = Math.max(finalLevel, levelFromTheta(upperAbility));
  if (clearedMax && finalLevel !== MAX_LEVEL_INDEX) return null;

  return {
    v: 2,
    finalLevel,
    maxLevel: upperLevel,
    clearedMax,
    correctTotal,
    askedByLevel,
    correctByLevel,
    ability,
    lowerLevel,
    upperLevel,
    lowerAbility,
    upperAbility,
    confidence,
  };
}

function decodeV1(bytes: number[]): LevelTestResultPayload | null {
  if (bytes[V1_PAYLOAD_BYTES - 1] !== checksumOf(bytes, V1_PAYLOAD_BYTES)) return null;

  const finalLevel = bytes[1] & 0x07;
  const maxLevel = (bytes[1] >> 3) & 0x07;
  const clearedMax = (bytes[1] & 0x40) !== 0;
  const correctTotal = bytes[2];
  const askedByLevel = bytes.slice(3, 3 + LEVEL_COUNT);
  const correctByLevel = bytes.slice(3 + LEVEL_COUNT, 3 + LEVEL_COUNT * 2);

  if (finalLevel < MIN_LEVEL_INDEX || finalLevel > MAX_LEVEL_INDEX) return null;
  if (maxLevel < finalLevel || maxLevel > MAX_LEVEL_INDEX) return null;
  if (correctTotal > LEVEL_TEST_QUESTION_COUNT) return null;

  let askedSum = 0;
  let correctSum = 0;
  for (let i = 0; i < LEVEL_COUNT; i += 1) {
    if (correctByLevel[i] > askedByLevel[i]) return null;
    askedSum += askedByLevel[i];
    correctSum += correctByLevel[i];
  }
  if (askedSum !== LEVEL_TEST_QUESTION_COUNT) return null;
  if (correctSum !== correctTotal) return null;
  if (clearedMax && maxLevel !== MAX_LEVEL_INDEX) return null;

  return { v: 1, finalLevel, maxLevel, clearedMax, correctTotal, askedByLevel, correctByLevel };
}

// 失敗時は例外ではなくnullを返す(ページ側でフォールバック表示する)。
export function decodeLevelTestResult(code: string): LevelTestResultPayload | null {
  if (typeof code !== 'string' || code.length === 0 || code.length > 64) return null;

  const bytes = base64UrlToBytes(code);
  if (!bytes) return null;

  if (bytes.length === V2_PAYLOAD_BYTES && bytes[0] === 2) return decodeV2(bytes);
  if (bytes.length === V1_PAYLOAD_BYTES && bytes[0] === 1) return decodeV1(bytes);
  return null;
}
