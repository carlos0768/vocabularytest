import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JAPANESE_PARENTHESIS_RULES } from '@/lib/ai/prompts/japanese-format';

const aiSource = readFileSync(
  fileURLToPath(new URL('./ai.ts', import.meta.url)),
  'utf8',
);

test('lexicon translation prompts reject one-sided parentheses', () => {
  assert.match(JAPANESE_PARENTHESIS_RULES, /片側だけの括弧は出力禁止/);
  assert.match(JAPANESE_PARENTHESIS_RULES, /本質が\)Aにある/);
  assert.match(JAPANESE_PARENTHESIS_RULES, /自己チェック/);

  const ruleUseCount = aiSource.match(/JAPANESE_PARENTHESIS_RULES/g)?.length ?? 0;
  assert.ok(ruleUseCount >= 4, 'lexicon AI prompts should include the shared Japanese parentheses rule');
});
