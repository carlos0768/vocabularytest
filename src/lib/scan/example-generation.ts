import type { ExampleSeedWord, GeneratedExample } from '@/lib/ai/generate-example-sentences';

export interface ClientLocalExampleWord {
  english: string;
  japanese: string;
  partOfSpeechTags?: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

export interface ServerCloudExampleCandidateWord {
  id: string;
  english: string;
  japanese: string;
  example_sentence?: string | null;
}

export interface ServerCloudExampleUpdatePayload {
  example_sentence: string;
  example_sentence_ja: string;
  part_of_speech_tags: string[];
}

export function buildClientLocalExampleSeedWords(
  words: readonly ClientLocalExampleWord[],
): ExampleSeedWord[] {
  const seedWords: ExampleSeedWord[] = [];

  for (const word of words) {
    if (word.exampleSentence) {
      continue;
    }

    seedWords.push({
      id: String(seedWords.length),
      english: word.english,
      japanese: word.japanese,
    });
  }

  return seedWords;
}

export function applyClientLocalGeneratedExamples<T extends ClientLocalExampleWord>(
  words: readonly T[],
  generatedExamples: readonly GeneratedExample[],
): T[] {
  const exampleMap = new Map(generatedExamples.map((example) => [example.wordId, example]));
  let exampleIndex = 0;

  return words.map((word) => {
    if (word.exampleSentence) {
      return word;
    }

    const generated = exampleMap.get(String(exampleIndex));
    exampleIndex += 1;

    if (!generated) {
      return word;
    }

    const nextWord: T = {
      ...word,
      exampleSentence: generated.exampleSentence,
      exampleSentenceJa: generated.exampleSentenceJa,
    };

    if (!word.partOfSpeechTags?.length) {
      nextWord.partOfSpeechTags = generated.partOfSpeechTags;
    }

    return nextWord;
  });
}

export function buildServerCloudExampleSeedWords(
  words: readonly ServerCloudExampleCandidateWord[],
): ExampleSeedWord[] {
  return words
    .filter((word) => !word.example_sentence || word.example_sentence.trim().length === 0)
    .map((word) => ({
      id: word.id,
      english: word.english,
      japanese: word.japanese,
    }));
}

export function buildServerCloudExampleUpdatePayload(
  example: GeneratedExample,
): ServerCloudExampleUpdatePayload {
  return {
    example_sentence: example.exampleSentence,
    example_sentence_ja: example.exampleSentenceJa,
    part_of_speech_tags: example.partOfSpeechTags,
  };
}
