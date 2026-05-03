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

test('word extraction prompts limit heading phrase handling to vocabulary-list layouts', () => {
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /単語帳・語彙リスト形式/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /生の英文・長文パッセージ・英語の文章が画像の主体/);
  assert.match(WORD_EXTRACTION_SYSTEM_PROMPT, /文章中に出てくる単語は個別の単語として抽出する通常ルール/);
  assert.match(USER_PROMPT_TEMPLATE, /単語帳・語彙リスト形式/);
  assert.match(USER_PROMPT_TEMPLATE, /生の英文・長文・パッセージが画像の主体の場合はこのルールを適用しない/);
  assert.match(USER_PROMPT_TEMPLATE, /The paradigm shifted dramatically\./);
});
