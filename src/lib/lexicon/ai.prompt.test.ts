import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JAPANESE_PARENTHESIS_RULES } from '@/lib/ai/prompts/japanese-format';
import { POS_CLASSIFICATION_RESPONSE_SCHEMA } from '@/lib/lexicon/ai';
import { LEXICON_POS_VALUES } from '../../../shared/lexicon';

const aiSource = readFileSync(
  fileURLToPath(new URL('./ai.ts', import.meta.url)),
  'utf8',
);

test('POS_CLASSIFICATION_RESPONSE_SCHEMA sources its pos enum from LEXICON_POS_VALUES', () => {
  assert.equal(POS_CLASSIFICATION_RESPONSE_SCHEMA.type, 'OBJECT');
  assert.deepEqual(POS_CLASSIFICATION_RESPONSE_SCHEMA.required, ['results']);
  const item = POS_CLASSIFICATION_RESPONSE_SCHEMA.properties?.results?.items;
  assert.deepEqual(item?.required, ['english', 'pos']);
  assert.deepEqual(item?.properties?.pos?.enum, [...LEXICON_POS_VALUES]);
});

test('lexicon translation prompts reject one-sided parentheses', () => {
  assert.match(JAPANESE_PARENTHESIS_RULES, /片側だけの括弧は出力禁止/);
  assert.match(JAPANESE_PARENTHESIS_RULES, /本質が\)Aにある/);
  assert.match(JAPANESE_PARENTHESIS_RULES, /自己チェック/);

  const ruleUseCount = aiSource.match(/JAPANESE_PARENTHESIS_RULES/g)?.length ?? 0;
  assert.ok(ruleUseCount >= 4, 'lexicon AI prompts should include the shared Japanese parentheses rule');
});
