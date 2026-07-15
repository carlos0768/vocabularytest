import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JAPANESE_PARENTHESIS_RULES } from '@/lib/ai/prompts/japanese-format';
import {
  normalizeTranslatedSenses,
  primaryTranslation,
  POS_CLASSIFICATION_RESPONSE_SCHEMA,
} from '@/lib/lexicon/ai';
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

test('translation prompts are polysemy-aware (senses format)', () => {
  // 単発・バッチ両方の訳生成プロンプトが多義語（senses）形式で指示していること
  assert.match(aiSource, /意味（語義）ごとに返してください/);
  assert.match(aiSource, /最大3件/);
  assert.match(aiSource, /無理に増やさない/);
  assert.match(aiSource, /isPrimary は最も一般的な意味1件だけ true/);
  // 旧形式「最も一般的な訳を1つ返す」指示が残っていないこと
  assert.equal(aiSource.includes('最も一般的な訳を1つ返す'), false);
  assert.equal(aiSource.includes('最も一般的な日本語訳を1つだけ返す'), false);
});

test('normalizeTranslatedSenses dedupes, caps, and enforces a single primary', () => {
  const senses = normalizeTranslatedSenses([
    { japanese: '走る', meaningSummary: '移動する', isPrimary: false },
    { japanese: '走る', meaningSummary: '重複', isPrimary: false },
    { japanese: '経営する', meaningSummary: null, isPrimary: false },
    { japanese: '立候補する', isPrimary: false },
    { japanese: '流れる', isPrimary: false },
    { japanese: '上映する', isPrimary: false },
  ]);

  assert.equal(senses.length, 4); // MAX_TRANSLATED_SENSES で制限
  assert.equal(senses.filter((s) => s.isPrimary).length, 1);
  assert.equal(senses[0].japanese, '走る');
  assert.equal(senses[0].isPrimary, true); // primary未指定なら先頭を昇格
});

test('normalizeTranslatedSenses keeps the explicitly flagged primary', () => {
  const senses = normalizeTranslatedSenses([
    { japanese: '経営する', isPrimary: false },
    { japanese: '走る', isPrimary: true },
  ]);

  assert.equal(senses.filter((s) => s.isPrimary).length, 1);
  assert.equal(senses.find((s) => s.isPrimary)?.japanese, '走る');
  assert.equal(primaryTranslation(senses), '走る');
});

test('primaryTranslation falls back to the first sense and handles empty input', () => {
  assert.equal(primaryTranslation([]), null);
  assert.equal(
    primaryTranslation([
      { japanese: '走る', meaningSummary: null, isPrimary: false },
    ]),
    '走る',
  );
});
