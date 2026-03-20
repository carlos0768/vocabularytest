import test from 'node:test';
import assert from 'node:assert/strict';

import {
  USER_PROMPT_TEMPLATE,
  WORD_EXTRACTION_SYSTEM_PROMPT,
} from '@/lib/ai/prompts';

test('word extraction prompt enforces context-first Japanese translation rules', () => {
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /最優先/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /文脈に合う訳語だけ/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /辞書の先頭訳/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /言い換え・要約・別表現/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /文脈判断に十分な情報がない場合のみ/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /最大30語/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /partOfSpeechTags は必須/);
});

test('user prompt repeats context constraints for ambiguous translations', () => {
  assert.match(USER_PROMPT_TEMPLATE, /最優先でそのまま使ってください/);
  assert.match(USER_PROMPT_TEMPLATE, /同じ行\/近傍/);
  assert.match(USER_PROMPT_TEMPLATE, /辞書の先頭訳への置換/);
  assert.match(USER_PROMPT_TEMPLATE, /文脈に合わない訳語の補完は禁止/);
  assert.match(USER_PROMPT_TEMPLATE, /partOfSpeechTags/);
});
