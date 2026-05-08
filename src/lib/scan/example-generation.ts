import type { ExampleSeedWord, GeneratedExample } from '@/lib/ai/generate-example-sentences';

export interface ClientLocalExampleWord {
  english: string;
  japanese: string;
  partOfSpeechTags?: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
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
