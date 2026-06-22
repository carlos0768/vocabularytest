import type {
  AIJapaneseTranslation,
  CustomSection,
  WordTranslation,
  WordTranslationSource,
} from './types';

export const TRANSLATION_NOTES_SECTION_ID = 'translation-notes';
export const TRANSLATION_NOTES_SECTION_TITLE = '訳注';

const INVALID_TRANSLATIONS = new Set(['unknown', '不明', 'n/a', 'N/A', '-', '---', '']);

type RawTranslationRecord = {
  japanese?: unknown;
  translationJa?: unknown;
  translation_ja?: unknown;
  source?: unknown;
  japaneseSource?: unknown;
  annotationRanges?: unknown;
  annotation_ranges?: unknown;
  lexiconSenseId?: unknown;
  lexicon_sense_id?: unknown;
  meaningRank?: unknown;
  meaning_rank?: unknown;
};

export interface NormalizedTranslationPayload {
  japanese: string;
  japaneseSource?: Extract<WordTranslationSource, 'scan' | 'ai'>;
  translations: WordTranslation[];
  annotationNotes: string[];
  customSections?: CustomSection[];
}

export function normalizeTranslationText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return INVALID_TRANSLATIONS.has(normalized) ? '' : normalized;
}

function normalizeSource(value: unknown): WordTranslationSource | undefined {
  return value === 'scan' || value === 'ai' || value === 'user' ? value : undefined;
}

function normalizeAiSource(value: unknown): Extract<WordTranslationSource, 'scan' | 'ai'> | undefined {
  return value === 'scan' || value === 'ai' ? value : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = normalizeTranslationText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeUuidish(value: unknown): string | undefined {
  const normalized = normalizeTranslationText(value);
  return normalized || undefined;
}

function normalizeMeaningRank(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function removeAnnotationRanges(text: string, ranges: readonly string[]): string {
  let cleaned = text;
  for (const range of ranges) {
    const normalizedRange = normalizeTranslationText(range);
    if (!normalizedRange) continue;
    cleaned = cleaned.split(normalizedRange).join(' ');
  }
  return normalizeTranslationText(
    cleaned
      .replace(/\s+([、。，．・])/g, '$1')
      .replace(/([（(［\[])\s+/g, '$1')
      .replace(/\s+([）)］\]])/g, '$1')
      .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '$1$2'),
  );
}

function splitNumberedTranslations(text: string): string[] {
  const markerPattern = /(?:^|\s)(?:\d+|[①②③④⑤⑥⑦⑧⑨⑩])[\.\)、)]\s*/g;
  const matches = Array.from(text.matchAll(markerPattern));
  if (matches.length < 2) return [text];

  return text
    .replace(markerPattern, '\n')
    .split('\n')
    .map(normalizeTranslationText)
    .filter(Boolean);
}

export function splitJapaneseTranslations(value: unknown): string[] {
  const normalized = normalizeTranslationText(value);
  if (!normalized) return [];

  const numberedParts = splitNumberedTranslations(normalized);
  const candidates = numberedParts.length > 1 ? numberedParts : [normalized];
  return candidates.flatMap((candidate) => (
    candidate
      .split(/[;；]/)
      .map(normalizeTranslationText)
      .filter(Boolean)
  ));
}

function getRawTranslationText(record: RawTranslationRecord): string {
  return normalizeTranslationText(record.japanese ?? record.translationJa ?? record.translation_ja);
}

function normalizeTranslationRecords(params: {
  translations?: unknown;
  japanese?: unknown;
  rawJapanese?: unknown;
  japaneseSource?: unknown;
  lexiconSenseId?: unknown;
}): Array<{
  text: string;
  source?: WordTranslationSource;
  annotationRanges: string[];
  lexiconSenseId?: string;
  meaningRank: number;
}> {
  const records: Array<{
    text: string;
    source?: WordTranslationSource;
    annotationRanges: string[];
    lexiconSenseId?: string;
    meaningRank: number;
  }> = [];

  if (Array.isArray(params.translations)) {
    for (const item of params.translations) {
      if (typeof item === 'string') {
        const source = normalizeSource(params.japaneseSource);
        for (const text of splitJapaneseTranslations(item)) {
          records.push({
            text,
            source,
            annotationRanges: [],
            lexiconSenseId: normalizeUuidish(params.lexiconSenseId),
            meaningRank: records.length + 1,
          });
        }
        continue;
      }

      if (!item || typeof item !== 'object') continue;
      const record = item as RawTranslationRecord;
      const annotationRanges = normalizeStringList(record.annotationRanges ?? record.annotation_ranges);
      const rawText = getRawTranslationText(record);
      const textWithoutNotes = removeAnnotationRanges(rawText, annotationRanges);
      const source = normalizeSource(record.source ?? record.japaneseSource ?? params.japaneseSource);
      const lexiconSenseId = normalizeUuidish(record.lexiconSenseId ?? record.lexicon_sense_id ?? params.lexiconSenseId);
      const meaningRank = normalizeMeaningRank(record.meaningRank ?? record.meaning_rank, records.length + 1);

      const splitTexts = splitJapaneseTranslations(textWithoutNotes);
      for (const text of splitTexts) {
        records.push({
          text,
          source,
          annotationRanges,
          lexiconSenseId,
          meaningRank: splitTexts.length > 1 ? records.length + 1 : meaningRank,
        });
      }
    }
  }

  if (records.length === 0) {
    const fallback = normalizeTranslationText(params.japanese ?? params.rawJapanese);
    const source = normalizeSource(params.japaneseSource);
    for (const text of splitJapaneseTranslations(fallback)) {
      records.push({
        text,
        source,
        annotationRanges: [],
        lexiconSenseId: normalizeUuidish(params.lexiconSenseId),
        meaningRank: records.length + 1,
      });
    }
  }

  return records;
}

export function normalizeWordTranslationPayload(params: {
  translations?: unknown;
  japanese?: unknown;
  rawJapanese?: unknown;
  japaneseSource?: unknown;
  lexiconSenseId?: unknown;
  customSections?: unknown;
}): NormalizedTranslationPayload {
  const records = normalizeTranslationRecords(params);
  const translations: WordTranslation[] = [];
  const seen = new Set<string>();
  const annotationNotes: string[] = [];
  const seenNotes = new Set<string>();

  for (const record of records) {
    const normalized = normalizeTranslationText(record.text);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      translations.push({
        lexiconSenseId: record.lexiconSenseId,
        translationJa: normalized,
        normalizedTranslationJa: normalized,
        source: record.source,
        meaningRank: normalizeMeaningRank(record.meaningRank, translations.length + 1),
        position: translations.length,
        isPrimary: translations.length === 0,
      });
    }

    for (const note of record.annotationRanges) {
      const normalizedNote = normalizeTranslationText(note);
      if (!normalizedNote || seenNotes.has(normalizedNote)) continue;
      seenNotes.add(normalizedNote);
      annotationNotes.push(normalizedNote);
    }
  }

  const japanese = translations[0]?.translationJa ?? '';
  const japaneseSource = normalizeAiSource(translations[0]?.source);
  const customSections = mergeTranslationNoteSection(params.customSections, annotationNotes);

  return {
    japanese,
    japaneseSource,
    translations,
    annotationNotes,
    ...(customSections ? { customSections } : {}),
  };
}

export function mergeTranslationNoteSection(
  rawCustomSections: unknown,
  notes: readonly string[],
): CustomSection[] | undefined {
  const existing = normalizeCustomSections(rawCustomSections);
  const normalizedNotes = notes.map(normalizeTranslationText).filter(Boolean);
  if (normalizedNotes.length === 0) {
    return existing.length > 0 ? existing : undefined;
  }

  const noteContent = normalizedNotes.join('\n');
  const nextSections = [...existing];
  const existingIndex = nextSections.findIndex((section) => section.id === TRANSLATION_NOTES_SECTION_ID);

  if (existingIndex >= 0) {
    const section = nextSections[existingIndex];
    const lines = new Set(
      section.content
        .split('\n')
        .map(normalizeTranslationText)
        .filter(Boolean),
    );
    for (const note of normalizedNotes) {
      lines.add(note);
    }
    nextSections[existingIndex] = {
      ...section,
      title: section.title || TRANSLATION_NOTES_SECTION_TITLE,
      content: Array.from(lines).join('\n'),
    };
    return nextSections;
  }

  nextSections.push({
    id: TRANSLATION_NOTES_SECTION_ID,
    title: TRANSLATION_NOTES_SECTION_TITLE,
    content: noteContent,
  });
  return nextSections;
}

export function normalizeCustomSections(raw: unknown): CustomSection[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  const sections: CustomSection[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = normalizeTranslationText(record.id);
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const content = typeof record.content === 'string' ? record.content.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sections.push({ id, title, content });
  }
  return sections;
}

export function toAIJapaneseTranslations(translations: readonly WordTranslation[] | undefined): AIJapaneseTranslation[] | undefined {
  if (!translations || translations.length === 0) return undefined;
  return translations.map((translation) => ({
    japanese: translation.translationJa,
    meaningRank: translation.meaningRank,
    ...(translation.source === 'scan' || translation.source === 'ai'
      ? { source: translation.source }
      : {}),
    ...(translation.lexiconSenseId ? { lexiconSenseId: translation.lexiconSenseId } : {}),
  }));
}
