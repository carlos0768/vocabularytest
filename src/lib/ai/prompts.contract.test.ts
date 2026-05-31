import test from 'node:test';
import assert from 'node:assert/strict';

import * as promptExports from '@/lib/ai/prompts';
import {
  CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT,
  CIRCLED_WORD_USER_PROMPT,
  CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT,
  EIKEN_LEVEL_DESCRIPTIONS,
  EIKEN_OCR_PROMPT,
  EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT,
  GRAMMAR_ANALYSIS_SYSTEM_PROMPT,
  HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT,
  HIGHLIGHTED_WORD_USER_PROMPT,
  HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT,
  IDIOM_EXTRACTION_SYSTEM_PROMPT,
  IDIOM_USER_PROMPT,
  USER_PROMPT_TEMPLATE,
  USER_PROMPT_WITH_EXAMPLES_TEMPLATE,
  WORD_EXTRACTION_SYSTEM_PROMPT,
  WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT,
  WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT,
  WRONG_ANSWER_OCR_SYSTEM_PROMPT,
  getEikenFilterInstruction,
  getEikenLevelsAbove,
} from '@/lib/ai/prompts';
import { JAPANESE_PARENTHESIS_RULES } from '@/lib/ai/prompts/japanese-format';

const expectedPromptExports = [
  'CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT',
  'CIRCLED_WORD_USER_PROMPT',
  'CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT',
  'EIKEN_LEVEL_DESCRIPTIONS',
  'EIKEN_OCR_PROMPT',
  'EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT',
  'EIKEN_WORD_ANALYSIS_USER_PROMPT',
  'GRAMMAR_ANALYSIS_SYSTEM_PROMPT',
  'GRAMMAR_ANALYSIS_USER_PROMPT',
  'GRAMMAR_OCR_PROMPT',
  'HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT',
  'HIGHLIGHTED_WORD_USER_PROMPT',
  'HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT',
  'IDIOM_EXTRACTION_SYSTEM_PROMPT',
  'IDIOM_USER_PROMPT',
  'USER_PROMPT_TEMPLATE',
  'USER_PROMPT_WITH_EXAMPLES_TEMPLATE',
  'WORD_EXTRACTION_SYSTEM_PROMPT',
  'WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT',
  'WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT',
  'WRONG_ANSWER_ANALYSIS_USER_PROMPT',
  'WRONG_ANSWER_OCR_SYSTEM_PROMPT',
  'WRONG_ANSWER_OCR_USER_PROMPT',
  'getEikenFilterInstruction',
  'getEikenLevelsAbove',
  'getGrammarLevelFilterInstruction',
];

function assertIncludesAll(name: string, prompt: string, snippets: string[]): void {
  for (const snippet of snippets) {
    assert.equal(prompt.includes(snippet), true, `${name} should include ${snippet}`);
  }
}

test('prompts module keeps the existing public exports stable', () => {
  assert.deepEqual(Object.keys(promptExports).sort(), expectedPromptExports.sort());
});

test('sourceLabels prompts reject generic material labels and require physical source labels', () => {
  const prompts = [
    ['WORD_EXTRACTION_SYSTEM_PROMPT', WORD_EXTRACTION_SYSTEM_PROMPT],
    ['USER_PROMPT_TEMPLATE', USER_PROMPT_TEMPLATE],
    ['WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT', WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT],
    ['USER_PROMPT_WITH_EXAMPLES_TEMPLATE', USER_PROMPT_WITH_EXAMPLES_TEMPLATE],
    ['CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT', CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['CIRCLED_WORD_USER_PROMPT', CIRCLED_WORD_USER_PROMPT],
    ['EIKEN_OCR_PROMPT', EIKEN_OCR_PROMPT],
    ['EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT', EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT],
    ['IDIOM_EXTRACTION_SYSTEM_PROMPT', IDIOM_EXTRACTION_SYSTEM_PROMPT],
    ['IDIOM_USER_PROMPT', IDIOM_USER_PROMPT],
    ['HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['HIGHLIGHTED_WORD_USER_PROMPT', HIGHLIGHTED_WORD_USER_PROMPT],
    ['WRONG_ANSWER_OCR_SYSTEM_PROMPT', WRONG_ANSWER_OCR_SYSTEM_PROMPT],
    ['WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT', WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT],
  ] as const;

  for (const [name, prompt] of prompts) {
    assertIncludesAll(name, prompt, [
      'sourceLabels',
      '物理',
      '一般名詞',
      '英語教材',
      '参考書',
      'ノート',
    ]);
  }
});

test('structured extraction prompts keep JSON-only or JSON-format output instructions', () => {
  const strictJsonPrompts = [
    ['WORD_EXTRACTION_SYSTEM_PROMPT', WORD_EXTRACTION_SYSTEM_PROMPT],
    ['WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT', WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT],
    ['CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT', CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT', CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT],
    ['EIKEN_OCR_PROMPT', EIKEN_OCR_PROMPT],
    ['EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT', EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT],
    ['HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT],
  ] as const;

  for (const [name, prompt] of strictJsonPrompts) {
    assert.match(prompt, /JSON(?:形式)?のみ/, `${name} should keep a JSON-only instruction`);
  }

  assertIncludesAll('IDIOM_EXTRACTION_SYSTEM_PROMPT', IDIOM_EXTRACTION_SYSTEM_PROMPT, [
    'JSON形式で返してください',
    '{"words": []}',
  ]);
  assertIncludesAll('HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT, [
    '出力はJSON形式',
    '"words"',
  ]);
  assertIncludesAll('WRONG_ANSWER_OCR_SYSTEM_PROMPT', WRONG_ANSWER_OCR_SYSTEM_PROMPT, [
    '出力フォーマット（JSON）',
    '"questions"',
  ]);
  assertIncludesAll('WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT', WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT, [
    '出力フォーマット（JSON）',
    '"words"',
  ]);
});

test('word extraction prompts reject one-sided Japanese parentheses', () => {
  const prompts = [
    ['WORD_EXTRACTION_SYSTEM_PROMPT', WORD_EXTRACTION_SYSTEM_PROMPT],
    ['USER_PROMPT_TEMPLATE', USER_PROMPT_TEMPLATE],
    ['WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT', WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT],
    ['USER_PROMPT_WITH_EXAMPLES_TEMPLATE', USER_PROMPT_WITH_EXAMPLES_TEMPLATE],
    ['CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT', CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['CIRCLED_WORD_USER_PROMPT', CIRCLED_WORD_USER_PROMPT],
    ['CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT', CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT],
    ['EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT', EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT],
    ['IDIOM_EXTRACTION_SYSTEM_PROMPT', IDIOM_EXTRACTION_SYSTEM_PROMPT],
    ['IDIOM_USER_PROMPT', IDIOM_USER_PROMPT],
    ['HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['HIGHLIGHTED_WORD_USER_PROMPT', HIGHLIGHTED_WORD_USER_PROMPT],
    ['HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT],
    ['WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT', WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT],
  ] as const;

  for (const [name, prompt] of prompts) {
    assertIncludesAll(name, prompt, [
      JAPANESE_PARENTHESIS_RULES,
      '片側だけの括弧は出力禁止',
      '本質が)Aにある',
      '自己チェック',
    ]);
  }
});

test('word-producing prompts keep partOfSpeechTags in the output contract', () => {
  const prompts = [
    ['WORD_EXTRACTION_SYSTEM_PROMPT', WORD_EXTRACTION_SYSTEM_PROMPT],
    ['WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT', WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT],
    ['CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT', CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT', CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT],
    ['EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT', EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT],
    ['IDIOM_EXTRACTION_SYSTEM_PROMPT', IDIOM_EXTRACTION_SYSTEM_PROMPT],
    ['HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT],
    ['WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT', WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT],
  ] as const;

  for (const [name, prompt] of prompts) {
    assertIncludesAll(name, prompt, ['"partOfSpeechTags"', 'partOfSpeechTags']);
  }

  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /partOfSpeechTags は必須/);
  assert.match(WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT, /partOfSpeechTags は必須/);
});

test('EIKEN helpers and prompts keep this-level-and-above filtering', () => {
  assert.deepEqual(getEikenLevelsAbove('5'), ['5', '4', '3', 'pre2', '2', 'pre1', '1']);
  assert.deepEqual(getEikenLevelsAbove('3'), ['3', 'pre2', '2', 'pre1', '1']);
  assert.deepEqual(getEikenLevelsAbove('pre2'), ['pre2', '2', 'pre1', '1']);
  assert.deepEqual(getEikenLevelsAbove('unknown'), []);

  const instruction = getEikenFilterInstruction('pre2');

  assert.match(instruction, /「以上」に相当する単語/);
  assert.match(instruction, /対象レベル/);
  assert.match(instruction, /より明らかに簡単すぎる単語は除外/);
  assert.match(instruction, /より難しい単語も積極的に抽出/);
  assert.equal(instruction.includes(EIKEN_LEVEL_DESCRIPTIONS['pre2']), true);
  assert.equal(instruction.includes(EIKEN_LEVEL_DESCRIPTIONS['2']), true);
  assert.equal(instruction.includes(EIKEN_LEVEL_DESCRIPTIONS['pre1']), true);
  assert.equal(instruction.includes(EIKEN_LEVEL_DESCRIPTIONS['1']), true);
  assert.equal(instruction.includes(EIKEN_LEVEL_DESCRIPTIONS['3']), false);
  assert.equal(getEikenFilterInstruction(null), '');

  assertIncludesAll('EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT', EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT, [
    '指定された英検レベル「以上」',
    '{LEVEL_DESC}「以上」に相当する単語',
    '指定レベル未満の単語は1語も出力しない',
    'レベル判定に迷う単語は安全側で除外',
  ]);
});

test('idiom and phrasal verb classification rules stay explicit', () => {
  const generalWordPrompts = [
    ['WORD_EXTRACTION_SYSTEM_PROMPT', WORD_EXTRACTION_SYSTEM_PROMPT],
    ['WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT', WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT],
  ] as const;

  for (const [name, prompt] of generalWordPrompts) {
    assertIncludesAll(name, prompt, [
      'idiom',
      'phrasal_verb',
      '熟語は idiom、句動詞は phrasal_verb を優先',
    ]);
  }

  assertIncludesAll('IDIOM_EXTRACTION_SYSTEM_PROMPT', IDIOM_EXTRACTION_SYSTEM_PROMPT, [
    'イディオム・熟語・句動詞',
    'partOfSpeechTags は idiom / phrasal_verb のいずれかを入れる',
    '"partOfSpeechTags": ["idiom"]',
  ]);
  assertIncludesAll('HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT', HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT, [
    'idiom',
    'phrasal_verb',
  ]);
  assert.match(GRAMMAR_ANALYSIS_SYSTEM_PROMPT, /準1級〜1級レベル専用/);
});
