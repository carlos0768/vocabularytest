import type { AIWordExtraction } from '@/types';
import { buildLexiconKey, translateWordsWithAI } from '@/lib/lexicon/ai';
import {
  normalizeLexiconTranslation,
  resolvePrimaryLexiconPos,
} from '../../../shared/lexicon';

type BackfillableWord = Pick<AIWordExtraction, 'english' | 'japanese' | 'partOfSpeechTags'>;

interface BackfillJapaneseDeps {
  translateWords?: typeof translateWordsWithAI;
}

export async function backfillMissingJapaneseTranslations<T extends BackfillableWord>(
  words: T[],
  deps?: BackfillJapaneseDeps,
): Promise<T[]> {
  if (words.length === 0) {
    return words;
  }

  const translateWords = deps?.translateWords ?? translateWordsWithAI;
  const pendingInputs = new Map<string, { english: string; pos: ReturnType<typeof resolvePrimaryLexiconPos> }>();

  for (const word of words) {
    const normalizedJapanese = normalizeLexiconTranslation(word.japanese) ?? '';
    if (normalizedJapanese) {
      continue;
    }

    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = buildLexiconKey(word.english, pos);
    if (!pendingInputs.has(key)) {
      pendingInputs.set(key, { english: word.english, pos });
    }
  }

  if (pendingInputs.size === 0) {
    return words.map((word) => {
      const normalizedJapanese = normalizeLexiconTranslation(word.japanese) ?? '';
      return normalizedJapanese === word.japanese
        ? word
        : { ...word, japanese: normalizedJapanese };
    });
  }

  let translations = new Map<string, string | null>();
  try {
    translations = await translateWords(Array.from(pendingInputs.values()));
  } catch (error) {
    console.error('[backfill-japanese] Failed to translate missing Japanese values:', error);
  }

  return words.map((word) => {
    const normalizedJapanese = normalizeLexiconTranslation(word.japanese) ?? '';
    if (normalizedJapanese) {
      return normalizedJapanese === word.japanese
        ? word
        : { ...word, japanese: normalizedJapanese };
    }

    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = buildLexiconKey(word.english, pos);
    const translatedJapanese = normalizeLexiconTranslation(translations.get(key)) ?? '';

    if (!translatedJapanese) {
      return normalizedJapanese === word.japanese
        ? word
        : { ...word, japanese: normalizedJapanese };
    }

    return {
      ...word,
      japanese: translatedJapanese,
    };
  });
}
