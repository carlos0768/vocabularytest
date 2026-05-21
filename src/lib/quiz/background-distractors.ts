export interface QuizBackgroundDistractorExample {
  exampleSentence: string;
  exampleSentenceJa: string;
}

export interface ParsedQuizBackgroundDistractorResults {
  distractorMap: Map<string, string[]>;
  exampleMap: Map<string, QuizBackgroundDistractorExample>;
  succeededIds: Set<string>;
}

export function parseQuizBackgroundDistractorResults(
  results: unknown,
): ParsedQuizBackgroundDistractorResults {
  const distractorMap = new Map<string, string[]>();
  const exampleMap = new Map<string, QuizBackgroundDistractorExample>();
  const succeededIds = new Set<string>();

  if (!Array.isArray(results)) {
    return { distractorMap, exampleMap, succeededIds };
  }

  for (const result of results) {
    if (typeof result !== 'object' || result === null) continue;
    const record = result as Record<string, unknown>;
    if (typeof record.wordId !== 'string') continue;
    if (!Array.isArray(record.distractors) || record.distractors.length === 0) continue;

    distractorMap.set(record.wordId, record.distractors as string[]);
    succeededIds.add(record.wordId);

    if (typeof record.exampleSentence === 'string' && record.exampleSentence.length > 0) {
      exampleMap.set(record.wordId, {
        exampleSentence: record.exampleSentence,
        exampleSentenceJa: typeof record.exampleSentenceJa === 'string'
          ? record.exampleSentenceJa
          : '',
      });
    }
  }

  return { distractorMap, exampleMap, succeededIds };
}
