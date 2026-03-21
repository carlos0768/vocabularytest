import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/lib/ai/extract-words';

test('word extraction prompts include explicit reading-order instruction', () => {
  const basic = __internal.buildWordExtractionPrompts({});
  const withExamples = __internal.buildWordExtractionPrompts({ includeExamples: true });

  assert.match(basic.systemPrompt, /reading order/i);
  assert.match(basic.userPrompt, /reading order/i);
  assert.match(withExamples.systemPrompt, /top-to-bottom/i);
  assert.match(withExamples.userPrompt, /left-to-right/i);
});
