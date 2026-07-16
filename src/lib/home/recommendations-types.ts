import type { WordMorphology } from '@/types';

/**
 * ホームのおすすめ（共有単語帳 + リールプレビュー）のAPI payload 型。
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

/** ホームに流すリールのプレビュー1件。語源（morphology）がある単語のみ。 */
export type HomeReelPreviewItem = {
  /** stable key: `s:<sharedWordId>` | `o:<wordId>` */
  id: string;
  source: 'shared' | 'official';
  english: string;
  japanese: string;
  pronunciation: string | null;
  /** 語源分解。ホームプレビューは語源がある単語限定なので必ず存在する */
  morphology: WordMorphology;
  bookTitle: string;
};

export type HomeRecommendationsPayload = {
  books: HomeRecommendedBook[];
  reels: HomeReelPreviewItem[];
};
