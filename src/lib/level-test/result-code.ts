import {
  LEVEL_TEST_QUESTION_COUNT,
  MAX_LEVEL_INDEX,
  MIN_LEVEL_INDEX,
  type LevelTestResult,
} from './engine';

// 診断結果を共有URLのパスセグメントに埋め込むための符号化。
//
// DBを使わないため、結果ページ(/level-test/r/[code])とOG画像は
// このコードだけから復元できる必要がある。ブラウザとNode(OG画像ルート)の
// 両方で動くよう、Buffer/btoaに依存しない自前のbase64urlコーデックを使う。
//
// バイトレイアウト(全18バイト -> base64urlで24文字):
//   byte 0      : エンコーディングバージョン(1)
//   byte 1      : finalLevel(bit 0-2) | maxLevel(bit 3-5) | clearedMax(bit 6)
//   byte 2      : correctTotal(0..20)
//   bytes 3-9   : askedByLevel[0..6]
//   bytes 10-16 : correctByLevel[0..6]
//   byte 17     : チェックサム
//
// チェックサムは改ざん防止ではなく「URLの手打ちミス・切り詰めを弾く」ためのもの。
// クライアント側で符号化する以上、偽造は原理的に防げない(低リスクと割り切る)。

export const RESULT_CODE_VERSION = 1;
const PAYLOAD_BYTES = 18;
const LEVEL_COUNT = 7;

export type LevelTestResultPayload = {
  v: number;
  finalLevel: number;
  maxLevel: number;
  clearedMax: boolean;
  correctTotal: number;
  askedByLevel: number[];
  correctByLevel: number[];
};

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

function checksumOf(bytes: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < PAYLOAD_BYTES - 1; i += 1) {
    sum = (sum + bytes[i]) & 0xff;
  }
  return ((sum * 31) + 7) & 0xff;
}

export function encodeLevelTestResult(result: LevelTestResult): string {
  const bytes: number[] = [
    RESULT_CODE_VERSION,
    (result.finalLevel & 0x07) | ((result.maxLevel & 0x07) << 3) | (result.clearedMax ? 0x40 : 0),
    result.correctTotal & 0xff,
  ];
  for (let i = 0; i < LEVEL_COUNT; i += 1) bytes.push((result.askedByLevel[i] ?? 0) & 0xff);
  for (let i = 0; i < LEVEL_COUNT; i += 1) bytes.push((result.correctByLevel[i] ?? 0) & 0xff);
  bytes.push(checksumOf(bytes));
  return bytesToBase64Url(bytes);
}

// 失敗時は例外ではなくnullを返す(ページ側でフォールバック表示する)。
export function decodeLevelTestResult(code: string): LevelTestResultPayload | null {
  if (typeof code !== 'string' || code.length === 0 || code.length > 64) return null;

  const bytes = base64UrlToBytes(code);
  if (!bytes || bytes.length !== PAYLOAD_BYTES) return null;
  if (bytes[PAYLOAD_BYTES - 1] !== checksumOf(bytes)) return null;

  const version = bytes[0];
  if (version !== RESULT_CODE_VERSION) return null;

  const finalLevel = bytes[1] & 0x07;
  const maxLevel = (bytes[1] >> 3) & 0x07;
  const clearedMax = (bytes[1] & 0x40) !== 0;
  const correctTotal = bytes[2];
  const askedByLevel = bytes.slice(3, 3 + LEVEL_COUNT);
  const correctByLevel = bytes.slice(3 + LEVEL_COUNT, 3 + LEVEL_COUNT * 2);

  // 意味的な不変条件の検証。カジュアルなURL改変はここでnullに落ちる。
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

  return { v: version, finalLevel, maxLevel, clearedMax, correctTotal, askedByLevel, correctByLevel };
}
