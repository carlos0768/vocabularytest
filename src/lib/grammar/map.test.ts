import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGrammarMap, filterQuestionsByGrammarNode, type GrammarMapNode } from '@/lib/grammar/map';

function findNode(nodes: GrammarMapNode[], id: string): GrammarMapNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

test('buildGrammarMap keeps every taxonomy node, including empty ones', () => {
  const map = buildGrammarMap([], []);
  const subjunctive = findNode(map.nodes, 'subjunctive');
  assert.ok(subjunctive);
  assert.equal(subjunctive.total, 0);
  assert.equal(subjunctive.status, 'empty');
  assert.equal(map.summary.totalQuestions, 0);
  assert.ok(map.summary.totalLeaves > 30);
  // 未分類は問題が無ければ出さない
  assert.equal(findNode(map.nodes, 'uncategorized'), null);
});

test('buildGrammarMap rolls child counts up into the category', () => {
  const map = buildGrammarMap(
    [
      { id: 'q1', grammarPoint: '仮定法過去' },
      { id: 'q2', grammarPoint: '仮定法過去完了' },
      { id: 'q3', grammarPoint: '分詞構文' },
    ],
    [
      { questionId: 'q1', mastered: true },
      { questionId: 'q2', mastered: false },
    ],
  );

  const subjunctive = findNode(map.nodes, 'subjunctive');
  assert.ok(subjunctive);
  assert.equal(subjunctive.total, 2);
  assert.equal(subjunctive.mastered, 1);
  assert.equal(subjunctive.attempted, 2);
  assert.equal(subjunctive.masteryPercent, 50);
  assert.equal(subjunctive.status, 'learning');

  const past = findNode(map.nodes, 'subjunctive-past');
  assert.equal(past?.total, 1);
  assert.equal(past?.status, 'mastered');
  assert.equal(past?.masteryPercent, 100);

  // 未回答の問題は untouched のまま
  const participle = findNode(map.nodes, 'participle-construction');
  assert.equal(participle?.total, 1);
  assert.equal(participle?.attempted, 0);
  assert.equal(participle?.status, 'untouched');
});

test('buildGrammarMap summarises overall mastery and leaf coverage', () => {
  const map = buildGrammarMap(
    [
      { id: 'q1', grammarPoint: '関係代名詞' },
      { id: 'q2', grammarPoint: '関係代名詞' },
      { id: 'q3', grammarPoint: '倒置' },
    ],
    [
      { questionId: 'q1', mastered: true },
      { questionId: 'q2', mastered: true },
      { questionId: 'q3', mastered: false },
    ],
  );

  assert.equal(map.summary.totalQuestions, 3);
  assert.equal(map.summary.masteredQuestions, 2);
  assert.equal(map.summary.attemptedQuestions, 3);
  assert.equal(map.summary.masteryPercent, 67);
  assert.equal(map.summary.coveredLeaves, 2);
  assert.equal(map.summary.masteredLeaves, 1);
  assert.equal(map.summary.uncategorizedQuestions, 0);
});

test('buildGrammarMap collects unknown tags into an uncategorized node', () => {
  const map = buildGrammarMap(
    [
      { id: 'q1', grammarPoint: 'ビジネス英語の言い回し' },
      { id: 'q2', grammarPoint: null },
    ],
    [{ questionId: 'q1', mastered: true }],
  );

  const uncategorized = findNode(map.nodes, 'uncategorized');
  assert.ok(uncategorized);
  assert.equal(uncategorized.total, 2);
  assert.equal(uncategorized.mastered, 1);
  assert.deepEqual(uncategorized.samplePoints, ['ビジネス英語の言い回し']);
  assert.equal(map.summary.uncategorizedQuestions, 2);
});

test('buildGrammarMap treats a duplicated progress row as mastered once', () => {
  const map = buildGrammarMap(
    [{ id: 'q1', grammarPoint: '倒置' }],
    [
      { questionId: 'q1', mastered: false },
      { questionId: 'q1', mastered: true },
    ],
  );
  const inversion = findNode(map.nodes, 'inversion');
  assert.equal(inversion?.total, 1);
  assert.equal(inversion?.mastered, 1);
  assert.equal(inversion?.masteryPercent, 100);
});

test('filterQuestionsByGrammarNode selects a whole subtree', () => {
  const rows = [
    { id: 'q1', grammarPoint: '仮定法過去' },
    { id: 'q2', grammarPoint: '仮定法過去完了' },
    { id: 'q3', grammarPoint: '関係代名詞' },
    { id: 'q4', grammarPoint: 'よくわからないタグ' },
  ];

  assert.deepEqual(filterQuestionsByGrammarNode(rows, 'subjunctive').map((r) => r.id), ['q1', 'q2']);
  assert.deepEqual(filterQuestionsByGrammarNode(rows, 'subjunctive-past').map((r) => r.id), ['q1']);
  assert.deepEqual(filterQuestionsByGrammarNode(rows, 'uncategorized').map((r) => r.id), ['q4']);
  assert.deepEqual(filterQuestionsByGrammarNode(rows, 'nope'), []);
});
