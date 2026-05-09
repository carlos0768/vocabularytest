import { needsWordLexiconResolution } from '@/lib/lexicon/word-resolution-jobs';
import {
  buildQuizPrefillSeedWords,
  type QuizPrefillCandidateWord,
  type QuizPrefillSeedWord,
} from '@/lib/scan/quiz-prefill';

export interface PostScanLexiconResolutionWord {
  id: string;
  lexicon_entry_id?: string | null;
  part_of_speech_tags?: unknown;
}

export function buildPostScanLexiconResolutionWordIds(
  words: PostScanLexiconResolutionWord[],
  aiTranslatedWordIds: string[],
): string[] {
  const aiTranslatedWordIdSet = new Set(aiTranslatedWordIds);

  return words
    .filter((word) =>
      aiTranslatedWordIdSet.has(word.id) ||
      needsWordLexiconResolution({
        lexiconEntryId: word.lexicon_entry_id ?? null,
        partOfSpeechTags: word.part_of_speech_tags,
      })
    )
    .map((word) => word.id);
}

export function buildPostScanQuizPrefillSeedWords(
  words: QuizPrefillCandidateWord[],
): QuizPrefillSeedWord[] {
  return buildQuizPrefillSeedWords(words);
}
