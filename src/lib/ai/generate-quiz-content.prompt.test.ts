import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATCH_DISTRACTOR_PROMPT,
  buildQuizContentResults,
  resolveQuizContentNeeds,
} from '@/lib/ai/generate-quiz-content';

test('distractor prompt forbids using the quiz word\'s own alternate meanings as distractors', () => {
  // The dedicated, high-priority polysemy/homonym rule must be present so that a
  // distractor is never another valid meaning of the same English word (which would
  // make the question have two correct answers).
  const requiredSnippets = [
    '出題語そのものの「別の意味」を誤答に絶対に使わない',
    '多義語・同音異義語の禁止',
    '誤答は必ず「正解とは別の英単語」の日本語訳から作ること',
    '正解が2つ以上ある不正な問題',
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      BATCH_DISTRACTOR_PROMPT.includes(snippet),
      true,
      `BATCH_DISTRACTOR_PROMPT should include: ${snippet}`,
    );
  }
});

test('distractor prompt keeps the prohibition restated in the 禁止事項 section', () => {
  assert.equal(
    BATCH_DISTRACTOR_PROMPT.includes(
      '出題語自身が持つ「別の正しい意味（多義語・同音異義語の別義）」を誤答に含めない',
    ),
    true,
    'BATCH_DISTRACTOR_PROMPT 禁止事項 should restate the alternate-meaning prohibition',
  );
});

test('prompt instructs the model to leave non-requested fields empty', () => {
  const requiredSnippets = [
    '生成対象フィールドの指定',
    '生成対象に含まれないフィールドは生成せず、必ず空で返すこと',
  ];
  for (const snippet of requiredSnippets) {
    assert.equal(
      BATCH_DISTRACTOR_PROMPT.includes(snippet),
      true,
      `BATCH_DISTRACTOR_PROMPT should include: ${snippet}`,
    );
  }
});

test('resolveQuizContentNeeds defaults every field to true for backward compatibility', () => {
  const needs = resolveQuizContentNeeds({ id: 'w1', english: 'run', japanese: '走る' });
  assert.deepEqual(needs, { distractors: true, example: true, pronunciation: true, pos: true });
});

test('buildQuizContentResults accepts distractor-less results when distractors were not requested', () => {
  const words = [
    {
      id: 'w1',
      english: 'run',
      japanese: '走る',
      needs: { distractors: false, example: true, pronunciation: false, pos: false },
    },
  ];
  const results = buildQuizContentResults(
    [{ id: 'w1', distractors: [], exampleSentence: 'I run every day.', exampleSentenceJa: '私は毎日走る。' }],
    words,
  );
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].distractors, []);
  assert.equal(results[0].exampleSentence, 'I run every day.');
  assert.equal(results[0].exampleSentenceJa, '私は毎日走る。');
});

test('buildQuizContentResults drops fields the caller did not request even if the model returned them', () => {
  const words = [
    {
      id: 'w1',
      english: 'run',
      japanese: '走る',
      needs: { distractors: true, example: false, pronunciation: false, pos: false },
    },
  ];
  const results = buildQuizContentResults(
    [{
      id: 'w1',
      distractors: ['歩く', '泳ぐ', '飛ぶ'],
      partOfSpeechTags: ['verb'],
      pronunciation: '/rʌn/',
      exampleSentence: 'She runs a company.',
      exampleSentenceJa: '彼女は会社を経営する。',
    }],
    words,
  );
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].distractors, ['歩く', '泳ぐ', '飛ぶ']);
  assert.deepEqual(results[0].partOfSpeechTags, []);
  assert.equal(results[0].pronunciation, '');
  assert.equal(results[0].exampleSentence, '');
  assert.equal(results[0].exampleSentenceJa, '');
});

test('buildQuizContentResults still requires 3 distractors when distractors are requested', () => {
  const words = [
    { id: 'w1', english: 'run', japanese: '走る' },
  ];
  const results = buildQuizContentResults(
    [{ id: 'w1', distractors: ['歩く'], exampleSentence: 'x', exampleSentenceJa: 'y' }],
    words,
  );
  assert.equal(results.length, 0);
});
