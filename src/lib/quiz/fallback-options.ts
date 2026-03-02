export interface BuildLocalDistractorsFallbackInput {
  correct: string;
  candidateValues: string[];
  fallbackValues?: string[];
  count?: number;
}

export const DEFAULT_JA_DISTRACTOR_FALLBACKS = [
  '確認する',
  '提供する',
  '参加する',
  '検討する',
  '対応する',
];

export const DEFAULT_EN_DISTRACTOR_FALLBACKS = [
  'sample',
  'option',
  'example',
  'answer',
  'choice',
];

function normalizeChoice(value: string): string {
  return value.trim();
}

export function buildLocalDistractorsFallback({
  correct,
  candidateValues,
  fallbackValues = DEFAULT_JA_DISTRACTOR_FALLBACKS,
  count = 3,
}: BuildLocalDistractorsFallbackInput): string[] {
  const normalizedCorrect = normalizeChoice(correct);
  const seen = new Set<string>([normalizedCorrect]);
  const result: string[] = [];

  const append = (value: string) => {
    const normalized = normalizeChoice(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  for (const value of candidateValues) {
    append(value);
    if (result.length >= count) {
      return result;
    }
  }

  for (const value of fallbackValues) {
    append(value);
    if (result.length >= count) {
      return result;
    }
  }

  let suffix = 1;
  while (result.length < count) {
    append(`選択肢${suffix}`);
    suffix += 1;
  }

  return result;
}

