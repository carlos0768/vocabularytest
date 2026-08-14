/**
 * アカウントアイコン(アバター)の共有ルール。
 *
 * 画像は Supabase Storage ではなく、正方形にクロップ済みの小さな JPEG を
 * data URL として profiles.avatar_url に保存する(プロジェクトアイコンの
 * `projects.icon_image` と同じ方式)。フォロー一覧などリスト表示で一緒に
 * 取得されるため、サイズ上限をここで一元管理する。
 *
 * サーバ(API バリデーション)とクライアント(画像生成)の両方から参照するので
 * ブラウザ専用 API には依存しないこと。
 */

/**
 * 生成するアイコンの一辺(px)。
 * 表示は最大 84px(デスクトップのプロフィールヘッダ)なので 160px あれば
 * Retina でも足りる。フォロー一覧などで人数分まとめて転送されるため、
 * これ以上大きくすると一覧のペイロードが跳ね上がる。
 */
export const ACCOUNT_ICON_SIZE = 160;

/** JPEG 圧縮品質。160px なら 0.8 で概ね 10KB 前後に収まる。 */
export const ACCOUNT_ICON_QUALITY = 0.8;

/**
 * data URL の最大文字数。
 * `supabase/migrations/20260814090000_add_profile_avatar.sql` の CHECK 制約と
 * 同じ値。片方だけ変えると DB 側で弾かれるので必ず両方を更新する。
 */
export const MAX_AVATAR_DATA_URL_LENGTH = 200_000;

const AVATAR_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const AVATAR_INVALID_MESSAGE = 'アイコン画像の形式が不正です';
export const AVATAR_TOO_LARGE_MESSAGE = 'アイコン画像のサイズが大きすぎます';

/** 保存可能な data URL かどうか(形式のみ。長さは別途チェックする)。 */
export function isAvatarDataUrl(value: string): boolean {
  return AVATAR_DATA_URL_PATTERN.test(value);
}

export type AvatarParseResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * API から受け取ったアイコン値を検証する。
 * `null` / 空文字はアイコン削除を意味する。
 */
export function parseAvatarInput(input: unknown): AvatarParseResult {
  if (input === null || input === undefined || input === '') {
    return { ok: true, value: null };
  }

  if (typeof input !== 'string') {
    return { ok: false, error: AVATAR_INVALID_MESSAGE };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  // 長さチェックを形式チェックより先に行う。巨大な文字列に正規表現を当てると
  // 無駄にコストがかかるため。
  if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return { ok: false, error: AVATAR_TOO_LARGE_MESSAGE };
  }

  if (!isAvatarDataUrl(trimmed)) {
    return { ok: false, error: AVATAR_INVALID_MESSAGE };
  }

  return { ok: true, value: trimmed };
}

/** DB から読んだ値を表示用に正規化する(壊れた値は未設定として扱う)。 */
export function normalizeStoredAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) return null;
  return isAvatarDataUrl(trimmed) ? trimmed : null;
}
