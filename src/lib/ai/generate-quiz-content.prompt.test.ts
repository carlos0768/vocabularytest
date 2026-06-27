import test from 'node:test';
import assert from 'node:assert/strict';

import { BATCH_DISTRACTOR_PROMPT } from '@/lib/ai/generate-quiz-content';

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
