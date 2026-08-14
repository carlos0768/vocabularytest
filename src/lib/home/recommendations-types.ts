/**
 * ホームのおすすめ（共有単語帳）のAPI payload 型。
 * サーバー側の組み立ては src/app/api/home/recommendations/shared.ts。
 */

/** 英検級に基づくおすすめ共有単語帳（ホーム上部グリッドの空き枠に流す）。 */
export type HomeRecommendedBook = {
  /** /share/<shareId> への deep link */
  shareId: string;
  title: string;
  iconImage: string | null;
  wordCount: number;
  likeCount: number;
  /** 表示用の英検級タグ（例: "英検準2級"）。無い単語帳は null */
  eikenLevelTag: string | null;
};

export type HomeRecommendationsPayload = {
  books: HomeRecommendedBook[];
};
