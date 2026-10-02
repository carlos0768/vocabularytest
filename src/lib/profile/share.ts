// プロフィールのシェア用URL・本文。純粋関数にしてテストで固定する。

/** 公開プロフィール `/profile/[accountId]` の絶対URL。末尾スラッシュや先頭の @ は吸収する。 */
export function buildProfileShareUrl(origin: string, accountId: string): string {
  const base = origin.replace(/\/+$/, '');
  const id = accountId.trim().replace(/^@/, '');
  return `${base}/profile/${encodeURIComponent(id)}`;
}

/** ネイティブ共有シート・クリップボードに渡す本文(URLは含めない)。 */
export function buildProfileShareText(name: string, accountId: string): string {
  const id = accountId.trim().replace(/^@/, '');
  const displayName = name.trim();
  // 名前未設定のときは呼び出し側が `@accountId` を名前として渡すので、二重に出さない
  if (!displayName || displayName === `@${id}`) return `@${id}のMERKENプロフィール`;
  return `${displayName}（@${id}）のMERKENプロフィール`;
}

/** シェア画像・メタデータに載せるプロフィールの情報。 */
export type ProfileSharePreview = {
  name: string;
  accountId: string;
  avatarUrl: string | null;
  streakDays: number;
  totalWords: number;
  masteredWords: number;
};

/** リンクプレビューの説明文。アカウントが見つからないときは汎用の文言にする。 */
export function buildProfileShareDescription(preview: ProfileSharePreview | null): string {
  if (!preview) return 'MERKENで一緒に英単語を覚えよう。写真から単語帳を作って、クイズで定着させる英単語アプリ。';
  return `${preview.totalWords.toLocaleString('ja-JP')}語を学習中・連続${preview.streakDays}日。MERKENで一緒に英単語を覚えよう。`;
}

/**
 * シェア画像の名前表示。長い名前でもカードからはみ出さないよう、
 * 文字数に応じてフォントを小さくし、それでも収まらなければ省略する。
 */
export function fitProfileShareName(name: string): { text: string; fontSize: number } {
  // 名前欄は約 680px。全角で1行に収まる文字数を目安にしている
  const chars = Array.from(name.trim());
  if (chars.length <= 8) return { text: chars.join(''), fontSize: 84 };
  if (chars.length <= 10) return { text: chars.join(''), fontSize: 66 };
  if (chars.length <= 13) return { text: chars.join(''), fontSize: 52 };
  return { text: `${chars.slice(0, 12).join('')}…`, fontSize: 52 };
}
