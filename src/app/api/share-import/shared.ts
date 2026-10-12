const WORD_PATTERN = /[A-Za-z][A-Za-z'\-]{0,63}/g;

export function normalizeSpaces(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function normalizeEnglish(input: string): string {
  return normalizeSpaces(input).toLowerCase();
}

export function normalizeJapanese(input: string): string {
  return normalizeSpaces(input);
}

export function containsSentencePunctuation(input: string): boolean {
  return /[.!?。！？]/.test(input);
}

export function extractRepresentativeEnglish(text: string): { english: string; wasSentence: boolean } | null {
  const normalized = normalizeSpaces(text);
  if (!normalized) return null;

  const matches = normalized.match(WORD_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }

  const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'did', 'do', 'does',
    'for', 'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if', 'in', 'into',
    'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them',
    'there', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
    'will', 'with', 'you', 'your', 'yesterday', 'today', 'tomorrow'
  ]);

  const ranked = matches
    .map((raw) => normalizeSpaces(raw))
    .filter((token) => token.length > 1)
    .sort((lhs, rhs) => rhs.length - lhs.length);

  const picked = ranked.find((token) => !stopwords.has(token.toLowerCase()))
    ?? ranked[0]
    ?? matches[0];

  const wasSentence = matches.length > 1 || containsSentencePunctuation(normalized);

  return {
    english: picked,
    wasSentence,
  };
}

export function buildDefaultProjectTitle(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `共有 ${month}/${day} ${hour}:${minute}`;
}
