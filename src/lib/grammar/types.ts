/**
 * 共有ページ (/shared) に公開された語法問題集のカード表現。
 * 中身 (問題文・解説) は含めず、一覧に出す要約だけを持つ。
 */
export type PublicGrammarBookCard = {
  /** grammar_books.id。一覧の key と共有停止に使う (閲覧は shareId 経由) */
  id: string;
  shareId: string;
  title: string;
  questionCount: number;
  importCount: number;
  publishedAt: string | null;
  ownerUsername: string | null;
  ownerAccountId: string | null;
};

export type PublicGrammarBookListPayload = {
  items: PublicGrammarBookCard[];
  nextCursor: string | null;
};
