/**
 * プロフィールの自己紹介(bio)の共有ルール。
 *
 * Instagram の自己紹介と同じく、改行を含められる150文字までの自由記述。
 * サーバ(API バリデーション)とクライアント(入力欄・表示)の両方から参照するので
 * ブラウザ専用 API には依存しないこと。
 */

/**
 * 自己紹介の最大文字数。
 * `supabase/migrations/20261002120000_add_profile_bio.sql` の CHECK 制約と
 * 同じ値。片方だけ変えると DB 側で弾かれるので必ず両方を更新する。
 */
export const MAX_PROFILE_BIO_LENGTH = 150;

/** 自己紹介に入れられる行数の上限。改行だけで縦に長くされるのを防ぐ。 */
export const MAX_PROFILE_BIO_LINES = 8;

export const PROFILE_BIO_TOO_LONG_MESSAGE = `自己紹介は${MAX_PROFILE_BIO_LENGTH}文字以内で入力してください`;
export const PROFILE_BIO_TOO_MANY_LINES_MESSAGE = `自己紹介は${MAX_PROFILE_BIO_LINES}行以内で入力してください`;

// 改行(\n)以外の制御文字と、ゼロ幅・方向制御文字。見えない文字で表示を崩されないよう落とす。
const INVISIBLE_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

/**
 * 保存・表示用に自己紹介を整える。空になったら null(=未設定)。
 * - 改行コードを \n に統一し、各行の末尾の空白を削る
 * - 2行以上続く空行は1行の空行にまとめる
 * - 前後の空白・空行を削る
 */
export function normalizeProfileBio(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_CHARS, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized === '' ? null : normalized;
}

/** 文字数(サロゲートペアの絵文字も1文字と数える。DB の char_length と同じ数え方)。 */
export function countProfileBioChars(value: string): number {
  return Array.from(value).length;
}

export function countProfileBioLines(value: string): number {
  return value === '' ? 0 : value.split('\n').length;
}

/** 正規化済みの自己紹介が保存できない理由。保存できるなら null。 */
export function getProfileBioError(normalized: string | null): string | null {
  if (normalized === null) return null;
  if (countProfileBioChars(normalized) > MAX_PROFILE_BIO_LENGTH) return PROFILE_BIO_TOO_LONG_MESSAGE;
  if (countProfileBioLines(normalized) > MAX_PROFILE_BIO_LINES) return PROFILE_BIO_TOO_MANY_LINES_MESSAGE;
  return null;
}

export type ProfileBioSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; accountId: string };

// アカウントIDは半角英小文字・数字・_ の3〜24文字(大文字で書かれても小文字のIDとして扱う)。
// メールアドレスの @ を拾わないよう、直前が英数字・_ でない @ だけをメンションとみなす。
const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,24})(?![A-Za-z0-9_])/g;

/**
 * 自己紹介を表示用に分割する。`@account_id` はプロフィールへのリンクにする。
 * HTML としては解釈しないので、描画側は各 text をそのままテキストノードに入れること。
 */
export function splitProfileBio(bio: string): ProfileBioSegment[] {
  const segments: ProfileBioSegment[] = [];
  let cursor = 0;

  for (const match of bio.matchAll(MENTION_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > cursor) segments.push({ type: 'text', text: bio.slice(cursor, start) });
    const handle = match[2];
    segments.push({ type: 'mention', text: `@${handle}`, accountId: handle.toLowerCase() });
    cursor = start + handle.length + 1;
  }

  if (cursor < bio.length) segments.push({ type: 'text', text: bio.slice(cursor) });
  return segments;
}
