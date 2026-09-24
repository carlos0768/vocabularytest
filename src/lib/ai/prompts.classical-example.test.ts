import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASSICAL_EXAMPLE_SYSTEM_PROMPT,
  buildClassicalExampleUserPrompt,
} from './prompts/classical-example';

// このプロンプトの一番の要件は「出典を書かせないこと」。
// 『枕草子』『源氏物語』のような実在の作品名を出させると、モデルは高い確率で
// 実在しない一節を本物の引用として提示する。学習者は出典を確認しないので、
// 捏造がそのまま暗記される。禁止文言が消えていないことを固定する。
test('classical example prompt forbids citing a source work', () => {
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('出典'));
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('書いてはいけません'));
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('創作であり'));
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('引用ではありません'));
  // 「有名な一節をうろ覚えで再現しようとする」挙動そのものを禁じる文
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('うろ覚え'));
});

test('classical example prompt asks for classical Japanese, not modern', () => {
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('古文'));
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('現代日本語で書かない'));
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('歴史的仮名遣い'));
});

test('classical example prompt requires both the sentence and its modern translation', () => {
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('"exampleSentence"'));
  assert.ok(CLASSICAL_EXAMPLE_SYSTEM_PROMPT.includes('"exampleSentenceJa"'));
});

// 英語のプロンプトが紛れ込んでいないこと（古典語に英文が付く事故の再発防止）
test('classical example prompt contains no English instruction text', () => {
  const latin = CLASSICAL_EXAMPLE_SYSTEM_PROMPT.match(/[A-Za-z]{4,}/g) ?? [];
  // JSONのキー名だけは英字で出てくる
  assert.deepEqual(
    Array.from(new Set(latin)).sort(),
    ['exampleSentence', 'exampleSentenceJa', 'JSON'].sort(),
  );
});

test('buildClassicalExampleUserPrompt includes the headword and the sense to use', () => {
  const prompt = buildClassicalExampleUserPrompt({
    headword: 'あさまし',
    meaning: '驚きあきれる',
  });

  assert.ok(prompt.includes('見出し語: あさまし'));
  assert.ok(prompt.includes('この語義で使うこと: 驚きあきれる'));
  assert.ok(prompt.includes('出典は書かないでください'));
  // 未指定の任意項目は行ごと出さない
  assert.ok(!prompt.includes('読み:'));
  assert.ok(!prompt.includes('活用:'));
});

test('buildClassicalExampleUserPrompt adds reading and conjugation when known', () => {
  const prompt = buildClassicalExampleUserPrompt({
    headword: 'をかし',
    meaning: '趣がある',
    reading: 'をかし',
    conjugationType: 'シク活用',
  });

  assert.ok(prompt.includes('読み: をかし'));
  assert.ok(prompt.includes('活用: シク活用'));
});
