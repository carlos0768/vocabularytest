import type { LexiconEntry } from './types';

export const LEXICON_POS_VALUES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'idiom',
  'phrasal_verb',
  'preposition',
  'conjunction',
  'pronoun',
  'determiner',
  'interjection',
  'auxiliary',
  'other',
] as const;

export type LexiconPos = (typeof LEXICON_POS_VALUES)[number];

export const LEXICON_CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type LexiconCefrLevel = (typeof LEXICON_CEFR_LEVELS)[number];

export const LEXICON_TRANSLATION_SOURCES = ['scan', 'ai'] as const;
export type LexiconTranslationSource = (typeof LEXICON_TRANSLATION_SOURCES)[number];

const APP_TO_LEXICON_POS: Record<string, LexiconPos> = {
  noun: 'noun',
  verb: 'verb',
  adjective: 'adjective',
  adverb: 'adverb',
  idiom: 'idiom',
  phrasal_verb: 'phrasal_verb',
  preposition: 'preposition',
  conjunction: 'conjunction',
  pronoun: 'pronoun',
  determiner: 'determiner',
  interjection: 'interjection',
  auxiliary: 'auxiliary',
  other: 'other',
};

const OLP_TO_LEXICON_POS: Record<string, LexiconPos> = {
  adjective: 'adjective',
  adverb: 'adverb',
  'be-verb': 'auxiliary',
  conjunction: 'conjunction',
  determiner: 'determiner',
  'do-verb': 'auxiliary',
  'have-verb': 'auxiliary',
  'infinitive-to': 'other',
  interjection: 'interjection',
  'modal auxiliary': 'auxiliary',
  noun: 'noun',
  number: 'other',
  preposition: 'preposition',
  pronoun: 'pronoun',
  verb: 'verb',
  vern: 'other',
};

const TRANSLATION_FIELD_KEYS = [
  'japanese',
  'translation',
  'normalizedJapanese',
  'suggestedJapanese',
] as const;

const VERBOSE_TRANSLATION_MARKERS = [
  '思考プロセス',
  '最終出力',
  '入力の理解',
  '主要な意味',
  'ルール',
  '判定ルール',
  '出力形式',
  '日本語候補',
  '英語:',
  '品詞:',
  'useHint',
  'thoughts:',
  'think:',
  'here is the json requested',
  'json required',
];

const JAPANESE_SPAN_REGEX = /[ぁ-んァ-ヶ一-龠々ー〜・]+(?:\s*[ぁ-んァ-ヶ一-龠々ー〜・]+)*/g;

export function mergeLexiconEntries(...groups: Array<LexiconEntry[] | null | undefined>): LexiconEntry[] {
  const merged = new Map<string, LexiconEntry>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
      if (!entry?.id) continue;
      merged.set(entry.id, entry);
    }
  }
  return Array.from(merged.values());
}

export function normalizeHeadword(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
}

export function normalizeLexiconPos(value: string | null | undefined): LexiconPos {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return 'other';
  return OLP_TO_LEXICON_POS[normalized] ?? APP_TO_LEXICON_POS[normalized] ?? 'other';
}

export function resolvePrimaryLexiconPos(value: string[] | null | undefined): LexiconPos {
  if (!Array.isArray(value) || value.length === 0) return 'other';
  for (const item of value) {
    const normalized = APP_TO_LEXICON_POS[item];
    if (normalized) return normalized;
  }
  return 'other';
}

export function normalizeLexiconTranslation(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const normalized = sanitizeLexiconTranslation(value);
  return normalized.length > 0 ? normalized : null;
}

function sanitizeLexiconTranslation(value: string): string {
  const extractedFromJson = extractTranslationFromJson(value);
  const extractedFromMarker = extractTranslationFromFinalOutput(value);
  let candidate = extractedFromJson ?? extractedFromMarker ?? value;

  candidate = candidate
    .replace(/```(?:json)?/gi, ' ')
    .replace(/```/g, ' ')
    .replace(/\*\*/g, ' ')
    .replace(/__/g, ' ')
    .replace(/\r/g, '\n');

  candidate = candidate
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  candidate = stripWrappingDecorations(stripLeadingTranslationLabel(candidate));
  candidate = dedupeRepeatedTranslation(candidate);

  if (!candidate) {
    return '';
  }

  const lowerCandidate = candidate.toLowerCase();
  const looksVerbose = VERBOSE_TRANSLATION_MARKERS.some((marker) => lowerCandidate.includes(marker.toLowerCase()))
    || candidate.includes('{')
    || candidate.includes('}')
    || candidate.includes('->')
    || candidate.length > 60;

  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(candidate) && looksVerbose) {
    return '';
  }

  if (looksVerbose) {
    const extracted = extractLastJapaneseSpan(candidate);
    if (extracted) {
      candidate = extracted;
    }
  }

  return dedupeRepeatedTranslation(
    stripWrappingDecorations(stripLeadingTranslationLabel(candidate)).replace(/\s+/g, ' ').trim(),
  );
}

function extractTranslationFromJson(value: string): string | null {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of TRANSLATION_FIELD_KEYS) {
      const candidate = parsed[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    // Ignore malformed JSON and try heuristic extraction below.
  }

  for (const key of TRANSLATION_FIELD_KEYS) {
    const match = trimmed.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i'));
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractTranslationFromFinalOutput(value: string): string | null {
  const normalized = value.replace(/\*\*/g, ' ');
  const match = normalized.match(/(?:最終出力|final output)\s*[:：]\s*([\s\S]+)$/i);
  return match?.[1]?.trim() ?? null;
}

function stripLeadingTranslationLabel(value: string): string {
  return value.replace(/^(?:日本語訳?|訳|translation|answer)\s*[:：]\s*/i, '');
}

function stripWrappingDecorations(value: string): string {
  return value
    .replace(/^[\s"'`“”‘’「」『』【】\(\)（）]+/, '')
    .replace(/[\s"'`“”‘’「」『』【】\(\)（）]+$/, '')
    .trim();
}

function dedupeRepeatedTranslation(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const repeated = normalized.match(/^(.+?)\s+\1$/);
  return repeated?.[1]?.trim() ?? normalized;
}

function extractLastJapaneseSpan(value: string): string | null {
  const matches = value.match(JAPANESE_SPAN_REGEX);
  if (!matches) {
    return null;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = dedupeRepeatedTranslation(matches[index]!.replace(/\s+/g, ' ').trim());
    if (!candidate) continue;
    if (VERBOSE_TRANSLATION_MARKERS.some((marker) => candidate.toLowerCase().includes(marker.replace(/[:：]/g, '').toLowerCase()))) {
      continue;
    }
    return candidate;
  }

  return null;
}

export function normalizeLexiconDatasetSources(value: Iterable<string>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const source of value) {
    const text = source.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }

  return normalized.sort((a, b) => a.localeCompare(b));
}

export function normalizeCefrLevel(value: string | null | undefined): LexiconCefrLevel | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return (LEXICON_CEFR_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as LexiconCefrLevel)
    : null;
}

export function pickHarderCefrLevel(
  current: LexiconCefrLevel | null | undefined,
  incoming: LexiconCefrLevel | null | undefined,
): LexiconCefrLevel | null {
  const currentValue = current ?? null;
  const incomingValue = incoming ?? null;
  const currentIndex = currentValue ? LEXICON_CEFR_LEVELS.indexOf(currentValue) : -1;
  const incomingIndex = incomingValue ? LEXICON_CEFR_LEVELS.indexOf(incomingValue) : -1;
  if (incomingIndex === -1) return currentValue;
  if (currentIndex === -1) return incomingValue;
  return incomingIndex > currentIndex ? incomingValue : currentValue;
}
