import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/lib/ai/extract-composite-words';
import { JAPANESE_PARENTHESIS_RULES } from '@/lib/ai/prompts/japanese-format';

test('composite extraction prompt treats multiple selected modes as an intersection', () => {
  const { systemPrompt, userPrompt } = __internal.buildCompositeExtractionPrompts({
    modes: ['circled', 'idiom'],
    eikenLevel: null,
  });

  assert.match(systemPrompt, /積集合/);
  assert.match(systemPrompt, /選択された複数条件をすべて満たす語・フレーズだけ/);
  assert.match(systemPrompt, /1つでも選択条件を満たさない候補は返してはいけません/);
  assert.match(systemPrompt, /丸囲みされた熟語・句動詞だけ/);
  assert.match(systemPrompt, /丸囲みでも単語なら除外/);
  assert.match(systemPrompt, /熟語でも丸囲みでなければ除外/);
  assert.ok(systemPrompt.includes(JAPANESE_PARENTHESIS_RULES));
  assert.match(userPrompt, /選択条件（丸囲み、熟語・イディオム）をすべて満たす/);
});
