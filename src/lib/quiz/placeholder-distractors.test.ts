import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isPlaceholderDistractor,
  withoutPlaceholderDistractors,
} from '@/lib/quiz/placeholder-distractors';

test('detects the 選択肢N placeholders the quiz generator falls back to', () => {
  assert.equal(isPlaceholderDistractor('選択肢1'), true);
  assert.equal(isPlaceholderDistractor('選択肢2'), true);
  assert.equal(isPlaceholderDistractor('選択肢 3'), true);
  assert.equal(isPlaceholderDistractor(' 選択肢10 '), true);
});

test('leaves real meanings alone', () => {
  assert.equal(isPlaceholderDistractor('りんご'), false);
  assert.equal(isPlaceholderDistractor('選択肢を選ぶ'), false);
  assert.equal(isPlaceholderDistractor(''), false);
  assert.equal(isPlaceholderDistractor(null), false);
});

test('withoutPlaceholderDistractors drops placeholders and blanks, keeping order', () => {
  assert.deepEqual(
    withoutPlaceholderDistractors(['りんご', '選択肢1', '  ', 'みかん', '選択肢2']),
    ['りんご', 'みかん'],
  );
});

test('withoutPlaceholderDistractors tolerates a missing list', () => {
  assert.deepEqual(withoutPlaceholderDistractors(undefined), []);
  assert.deepEqual(withoutPlaceholderDistractors(null), []);
});
