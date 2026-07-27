// 公開ソースにもとづく文法問題バンクの入口。
// マップの習得度はこのバンクに対する進捗だけで決まる (ユーザー自身の
// 語法問題集 grammar_questions はマップの集計には一切使わない)。

import { CORE_QUESTIONS } from './core';
import { PERIPHERAL_QUESTIONS } from './peripheral';
import { PUBLIC_BLANK_MARKER, type PublicGrammarQuestion } from './types';

export { PUBLIC_BLANK_MARKER };
export type { PublicGrammarQuestion };

export const PUBLIC_GRAMMAR_BANK: PublicGrammarQuestion[] = [
  ...CORE_QUESTIONS,
  ...PERIPHERAL_QUESTIONS,
];

const byId = new Map<string, PublicGrammarQuestion>();
const byNode = new Map<string, PublicGrammarQuestion[]>();

for (const question of PUBLIC_GRAMMAR_BANK) {
  if (byId.has(question.id)) {
    throw new Error(`duplicate public grammar question id: ${question.id}`);
  }
  byId.set(question.id, question);
  const list = byNode.get(question.nodeId);
  if (list) list.push(question);
  else byNode.set(question.nodeId, [question]);
}

export function findPublicQuestion(id: string): PublicGrammarQuestion | null {
  return byId.get(id) ?? null;
}

/** 小単元IDに属する問題を返す */
export function publicQuestionsForSubUnit(subUnitId: string): PublicGrammarQuestion[] {
  return byNode.get(subUnitId) ?? [];
}

/** 小単元ID -> 問題数 */
export function publicQuestionCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [nodeId, questions] of byNode) counts.set(nodeId, questions.length);
  return counts;
}

/** バンクが実際に参照している公開ソースのID一覧 */
export function publicBankSourceIds(): string[] {
  return Array.from(new Set(PUBLIC_GRAMMAR_BANK.map((question) => question.sourceId)));
}
