// 古典語フラグメントの配置と、既存の英語向けルールを壊していないことの回帰テスト。
//
// この機能でいちばん怖いのは古典語のバグではなく「英語スキャンの劣化」。
// 古典語を無条件に抽出するルールを足したせいで、丸囲みモードが丸の付いていない
// 英単語を返し始めたり、英検モードが級のフィルタを緩めたりするのが最悪の結果になる。
// そのため各モードのフィルタ文言がそのまま残っていることをここで固定する。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT,
  EIKEN_SINGLE_PASS_SYSTEM_PROMPT,
  EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT,
  IDIOM_EXTRACTION_SYSTEM_PROMPT,
  WORD_EXTRACTION_SYSTEM_PROMPT,
  WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT,
  buildCustomExtractionSystemPrompt,
} from '@/lib/ai/prompts';
import * as promptExports from '@/lib/ai/prompts';
import { CLASSICAL_JAPANESE_EXTRACTION_RULES } from '@/lib/ai/prompts/classical';
import {
  JAPANESE_TRANSLATION_STRUCTURE_RULES,
  POLYSEMOUS_HEADWORD_MERGE_RULES,
} from '@/lib/ai/prompts/japanese-format';
import { LEMMA_NORMALIZATION_RULES } from '@/lib/ai/prompts/lemma';

const MODE_PROMPTS: Array<[string, string]> = [
  ['WORD_EXTRACTION_SYSTEM_PROMPT', WORD_EXTRACTION_SYSTEM_PROMPT],
  ['WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT', WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT],
  ['CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT', CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT],
  ['EIKEN_SINGLE_PASS_SYSTEM_PROMPT', EIKEN_SINGLE_PASS_SYSTEM_PROMPT],
  ['EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT', EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT],
  ['IDIOM_EXTRACTION_SYSTEM_PROMPT', IDIOM_EXTRACTION_SYSTEM_PROMPT],
  ['buildCustomExtractionSystemPrompt', buildCustomExtractionSystemPrompt('動詞だけ抜き出して')],
];

test('every live extraction mode carries the classical rules', () => {
  // 専用モードを作らず自動判定にしたので、全モードに入っていないと
  // 「あるモードでは古典語が拾えない」という分かりにくい穴になる
  for (const [name, prompt] of MODE_PROMPTS) {
    assert.equal(
      prompt.includes(CLASSICAL_JAPANESE_EXTRACTION_RULES),
      true,
      `${name} should carry the classical extraction rules`,
    );
  }
});

test('the classical rules sit after the rules they override', () => {
  // フラグメントは「上の【日本語訳の構造化ルール】」「上の【重要】単語の原形化ルール」
  // と参照しているので、順序が逆になると指示が意味を失う
  for (const [name, prompt] of MODE_PROMPTS) {
    const structureAt = prompt.indexOf(JAPANESE_TRANSLATION_STRUCTURE_RULES);
    const lemmaAt = prompt.indexOf(LEMMA_NORMALIZATION_RULES);
    const classicalAt = prompt.indexOf(CLASSICAL_JAPANESE_EXTRACTION_RULES);

    assert.ok(structureAt >= 0, `${name} should still carry the translation structure rules`);
    assert.ok(lemmaAt >= 0, `${name} should still carry the lemma rules`);
    assert.ok(classicalAt > structureAt, `${name}: classical rules must come after the structure rules`);
    assert.ok(classicalAt > lemmaAt, `${name}: classical rules must come after the lemma rules`);
  }
});

test('the classical rules state the extraction condition and the hint behaviour', () => {
  const required = [
    '単語帳・語彙リスト形式で掲載されている場合にのみ',
    '抽出条件はこれだけ',
    '"isClassical": true',
    'すべて translations に入れる',
    '古典語には適用しない',
    'ハルシネーション禁止',
  ];

  for (const snippet of required) {
    assert.equal(
      CLASSICAL_JAPANESE_EXTRACTION_RULES.includes(snippet),
      true,
      `classical rules should state: ${snippet}`,
    );
  }
});

test('the classical rules opt out when the image has no classical vocabulary', () => {
  // 英語教材をスキャンしたときに、このルールがモデルを迷わせないための歯止め
  assert.equal(
    CLASSICAL_JAPANESE_EXTRACTION_RULES.includes('画像に古典語が含まれない場合、このルールは一切適用しない'),
    true,
  );
  assert.equal(
    CLASSICAL_JAPANESE_EXTRACTION_RULES.includes('英単語の抽出結果に古典語の項目を足したり、英単語の扱いを変えたりしてはいけない'),
    true,
  );
});

test('the English rules the classical fragment overrides are left untouched', () => {
  // 英語側の縮約ルールを緩めて古典語の要件を満たすのは禁じ手。既存の文言が
  // そのまま残っていることを確認する（緩めると英語スキャンの訳が過剰分割される）
  assert.equal(
    JAPANESE_TRANSLATION_STRUCTURE_RULES.includes('訳同士の意味が本当に独立している場合だけにする'),
    true,
  );
  assert.equal(
    JAPANESE_TRANSLATION_STRUCTURE_RULES.includes('同義語・言い換え・ニュアンス差にすぎない場合は分けない'),
    true,
  );
  assert.equal(
    POLYSEMOUS_HEADWORD_MERGE_RULES.includes('同じ english を複数回出力してはいけない'),
    true,
  );
  assert.equal(
    LEMMA_NORMALIZATION_RULES.includes('english は原形（辞書の見出し語）で出力してください'),
    true,
  );
});

test('each mode keeps its own English filter wording', () => {
  // 「古典語は無条件で拾う」が波及して各モードの絞り込みが緩んでいないこと
  assert.equal(CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT.includes('丸'), true);
  assert.equal(IDIOM_EXTRACTION_SYSTEM_PROMPT.includes('イディオム'), true);
  assert.equal(EIKEN_SINGLE_PASS_SYSTEM_PROMPT.includes('英検'), true);
  assert.equal(WORD_EXTRACTION_SYSTEM_PROMPT.includes('最大30語'), true);
});

test('the classical fragment is not re-exported from the prompts barrel', () => {
  // バレルの export 一覧は prompts.contract.test.ts が deepEqual で固定しているので、
  // ここに足すとあちらが落ちる。共通フラグメントは各プロンプトが直接 import する規約。
  assert.equal(
    Object.keys(promptExports).includes('CLASSICAL_JAPANESE_EXTRACTION_RULES'),
    false,
  );
});
