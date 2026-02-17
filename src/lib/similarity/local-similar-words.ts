import type { Word } from '@/types';

export interface LocalSimilarWordCandidate {
  id: string;
  english: string;
  japanese: string;
  score: number;
}

interface FindLocalSimilarWordsOptions {
  limit?: number;
  minScore?: number;
  excludeIds?: Iterable<string>;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function toEnglishNgrams(value: string, n = 3): Set<string> {
  const normalized = normalizeText(value).replace(/[^a-z0-9]/g, '');
  if (!normalized) return new Set();
  if (normalized.length < n) return new Set([normalized]);

  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i += 1) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

function toJapaneseTokens(value: string): Set<string> {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\u3000/g, ' ');

  if (!normalized) return new Set();

  const tokens = normalized
    .split(/[\s、。・,.;:!?！？（）()\[\]【】「」『』]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const tokenSet = new Set(tokens);
  const compact = normalized.replace(/[\s、。・,.;:!?！？（）()\[\]【】「」『』]/g, '');
  if (compact.length >= 2) {
    for (let i = 0; i < compact.length - 1; i += 1) {
      tokenSet.add(compact.slice(i, i + 2));
    }
  }

  return tokenSet;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function uniqueByText(candidates: LocalSimilarWordCandidate[]): LocalSimilarWordCandidate[] {
  const seen = new Set<string>();
  const unique: LocalSimilarWordCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${normalizeText(candidate.english)}::${candidate.japanese.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

export function findLocalSimilarWords(
  sourceWord: Pick<Word, 'id' | 'english' | 'japanese'>,
  allUserWords: Array<Pick<Word, 'id' | 'english' | 'japanese'>>,
  options: FindLocalSimilarWordsOptions = {},
): LocalSimilarWordCandidate[] {
  const {
    limit = 3,
    minScore = 0.08,
    excludeIds = [],
  } = options;

  const excluded = new Set<string>([sourceWord.id, ...excludeIds]);
  const sourceEnglish = toEnglishNgrams(sourceWord.english);
  const sourceJapanese = toJapaneseTokens(sourceWord.japanese);

  const scored = allUserWords
    .filter((word) => !excluded.has(word.id))
    .map((word) => {
      const englishScore = jaccardSimilarity(sourceEnglish, toEnglishNgrams(word.english));
      const japaneseScore = jaccardSimilarity(sourceJapanese, toJapaneseTokens(word.japanese));
      const score = japaneseScore * 0.7 + englishScore * 0.3;
      return {
        id: word.id,
        english: word.english,
        japanese: word.japanese,
        score,
      };
    })
    .filter((candidate) => candidate.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return uniqueByText(scored).slice(0, limit);
}
