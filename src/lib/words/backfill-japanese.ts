import type { AIWordExtraction } from '@/types';
import { buildLexiconKey, translateWithAI, translateWordsWithAI } from '@/lib/lexicon/ai';
import {
  normalizeLexiconTranslation,
  resolvePrimaryLexiconPos,
} from '../../../shared/lexicon';

type BackfillableWord = Pick<AIWordExtraction, 'english' | 'japanese' | 'partOfSpeechTags'>;

interface BackfillJapaneseDeps {
  translateWords?: typeof translateWordsWithAI;
  translateWord?: typeof translateWithAI;
}

function normalizeUsableTranslatedJapanese(value: string | null | undefined): string {
  const normalized = normalizeLexiconTranslation(value) ?? '';
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(normalized) ? normalized : '';
}

export interface BackfillJapaneseResult<T extends BackfillableWord> {
  words: T[];
  aiBackfilledIndexes: number[];
}

export async function backfillMissingJapaneseTranslationsWithMetadata<T extends BackfillableWord>(
  words: T[],
  deps?: BackfillJapaneseDeps,
): Promise<BackfillJapaneseResult<T>> {
  if (words.length === 0) {
    return {
      words,
      aiBackfilledIndexes: [],
    };
  }

  const translateWords = deps?.translateWords ?? translateWordsWithAI;
  const translateWord = deps?.translateWord ?? translateWithAI;
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
    return {
      words: words.map((word) => {
        const normalizedJapanese = normalizeLexiconTranslation(word.japanese) ?? '';
        return normalizedJapanese === word.japanese
          ? word
          : { ...word, japanese: normalizedJapanese };
      }),
      aiBackfilledIndexes: [],
    };
  }

  let translations = new Map<string, string | null>();
  try {
    translations = await translateWords(Array.from(pendingInputs.values()));
  } catch (error) {
    console.error('[backfill-japanese] Failed to translate missing Japanese values:', error);
  }

  const unresolvedInputs = Array.from(pendingInputs.entries())
    .filter(([key]) => {
      const translatedJapanese = normalizeUsableTranslatedJapanese(translations.get(key));
      return !translatedJapanese;
    })
    .map(([, value]) => value);

  if (unresolvedInputs.length > 0) {
    if (unresolvedInputs.length === pendingInputs.size) {
      console.warn('[backfill-japanese] Batch translation returned no usable values, falling back to per-word translation', {
        wordCount: pendingInputs.size,
      });
    }

    for (const input of unresolvedInputs) {
      try {
        const translatedJapanese = normalizeUsableTranslatedJapanese(
          await translateWord(input.english, input.pos),
        );
        if (!translatedJapanese) {
          continue;
        }
        translations.set(buildLexiconKey(input.english, input.pos), translatedJapanese);
      } catch (error) {
        console.error('[backfill-japanese] Failed to translate word fallback:', {
          english: input.english,
          pos: input.pos,
          error,
        });
      }
    }
  }

  const aiBackfilledIndexes: number[] = [];
  const translatedWords = words.map((word, index) => {
    const normalizedJapanese = normalizeLexiconTranslation(word.japanese) ?? '';
    if (normalizedJapanese) {
      return normalizedJapanese === word.japanese
        ? word
        : { ...word, japanese: normalizedJapanese };
    }

    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = buildLexiconKey(word.english, pos);
    const translatedJapanese = normalizeUsableTranslatedJapanese(translations.get(key));

    if (!translatedJapanese) {
      return normalizedJapanese === word.japanese
        ? word
        : { ...word, japanese: normalizedJapanese };
    }

    aiBackfilledIndexes.push(index);
    return {
      ...word,
      japanese: translatedJapanese,
    };
  });

  return {
    words: translatedWords,
    aiBackfilledIndexes,
  };
}

export async function backfillMissingJapaneseTranslations<T extends BackfillableWord>(
  words: T[],
  deps?: BackfillJapaneseDeps,
): Promise<T[]> {
  const result = await backfillMissingJapaneseTranslationsWithMetadata(words, deps);
  return result.words;
}
