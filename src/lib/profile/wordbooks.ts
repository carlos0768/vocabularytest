// プロフィールに並べる「その人が持っている単語帳」。
// 一覧の見た目に要るもの(タイトル・アイコン・種別・語数)だけを持ち、
// 単語の中身や共有ID は含めない —— 他人のプロフィールからは中身を開かせないため。

export type ProfileWordbook = {
  id: string;
  title: string;
  /** 単語帳アイコン(data URL)。未設定なら null。 */
  iconImage: string | null;
  /** 古文単語帳なら 'classical'。それ以外は 'english'。 */
  kind: 'english' | 'classical';
  wordCount: number;
};

export type ProfileWordbookList = {
  items: ProfileWordbook[];
  /** 持っている単語帳の総数。items は上限で切っているので、これより少ないことがある。 */
  total: number;
};

/** 1回に返す冊数の上限。アイコンが data URL なので、全部返すとレスポンスが重くなる。 */
export const PROFILE_WORDBOOK_LIMIT = 60;

export type ProfileWordbookRow = {
  id: string;
  title: string | null;
  icon_image?: string | null;
  kind?: string | null;
};

export function toProfileWordbooks(
  rows: ProfileWordbookRow[],
  wordCounts: Map<string, number>,
): ProfileWordbook[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || '無題の単語帳',
    iconImage: row.icon_image?.startsWith('data:image/') ? row.icon_image : null,
    kind: row.kind === 'classical' ? 'classical' : 'english',
    wordCount: wordCounts.get(row.id) ?? 0,
  }));
}
