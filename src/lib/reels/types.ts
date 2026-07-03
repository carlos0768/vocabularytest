import type { WordTranslation } from '@/types';

export type ReelSource = 'shared' | 'official';

export type ReelBook = {
  type: ReelSource;
  /** shared_wordbooks.id or the official project's id */
  id: string;
  title: string;
  iconImage: string | null;
  /** shared books only — deep link target /share/<shareId> */
  shareId?: string;
  /** official books only */
  officialSlug?: string;
  sharedTags: string[];
  eikenLevel: string | null;
  /** display name of the publisher; null for official books */
  ownerName: string | null;
  wordCount: number;
  likeCount: number;
  createdAt: string | null;
  /** whether the current user already imported this book (Pro/remote only) */
  importedByMe: boolean;
};

export type ReelItem = {
  /** stable client key: `s:<sharedWordId>` or `o:<wordId>` */
  id: string;
  source: ReelSource;
  wordId: string;
  english: string;
  /** IPA, e.g. "/ɪˈlæb.ər.ət/" */
  pronunciation: string | null;
  japanese: string;
  translations?: WordTranslation[];
  exampleSentence: string | null;
  exampleSentenceJa: string | null;
  partOfSpeechTags: string[];
  /** CEFR level joined from lexicon_entries; official words only */
  cefrLevel: string | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  book: ReelBook;
};

export type ReelFeedback = 'interested' | 'not_interested';

export type ReelComment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  isMine: boolean;
};

export type ReelFeedUsage = {
  /** remaining cards today; null = unlimited (Pro) */
  remaining: number | null;
  /** daily limit; null = unlimited (Pro) */
  limit: number | null;
  isPro: boolean;
};

export type ReelFeedPage = {
  items: ReelItem[];
  nextCursor: string | null;
  usage: ReelFeedUsage;
  limitReached: boolean;
};

/** Candidate fed into the ranking function (before like/imported enrichment). */
export type ReelCandidate = Omit<ReelItem, 'likeCount' | 'likedByMe' | 'commentCount'>;

/** Personalization context for ranking. */
export type ReelRankingContext = {
  eikenLevel: string | null;
  /** lowercased interest tags (example genres + own published tags) */
  interestTags: string[];
  /** ISO timestamp of "now" so ranking stays a pure function */
  now: string;
  /** semantic tag similarity per shared book id (pgvector, 0..1) */
  tagSimilarityByBookId?: Record<string, number>;
  /** book refs ('s:<shareId>' | 'o:<slug>') the user marked interested */
  interestedBookRefs?: string[];
  /** not-interested feedback count per book ref */
  notInterestedBookCounts?: Record<string, number>;
};
