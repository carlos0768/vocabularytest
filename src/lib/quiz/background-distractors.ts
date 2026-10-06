/**
 * 誤答生成 API (`/api/generate-quiz-distractors`) へ渡す「出題語の他の訳」。
 * 正解 (`word.japanese`) 以外の語義を集める。誤答がこれらのどれかと一致すると
 * 正解が2つある問題になるので、サーバー側がプロンプトでの禁止と生成後の
 * フィルタに使う。正解そのもの・空文字・重複は除く。
 */
export function collectKnownTranslations(
  word: { japanese: string; translations?: ReadonlyArray<{ translationJa?: string | null }> | null },
): string[] {
  const correct = word.japanese.trim();
  const seen = new Set<string>([correct]);
  const result: string[] = [];
  for (const translation of word.translations ?? []) {
    const value = typeof translation?.translationJa === 'string' ? translation.translationJa.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

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
