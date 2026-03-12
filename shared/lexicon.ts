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
  const normalized = value
    .trim()
    .replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
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
