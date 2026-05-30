import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/lib/ai/extract-composite-words';

test('composite extraction prompt forces independent per-mode candidate lists before union', () => {
  const { systemPrompt, userPrompt } = __internal.buildCompositeExtractionPrompts({
    modes: ['circled', 'idiom'],
    eikenLevel: null,
  });

  assert.match(systemPrompt, /和集合/);
  assert.match(systemPrompt, /積集合ではありません/);
  assert.match(systemPrompt, /各モードを必ず独立した抽出タスクとして処理/);
  assert.match(systemPrompt, /1つのモードの条件を、他のモードの候補を除外するフィルターに使ってはいけません/);
  assert.match(systemPrompt, /丸囲みの単語は熟語でなくても返し/);
  assert.match(systemPrompt, /熟語は丸囲みでなくても返してください/);
  assert.match(userPrompt, /和集合/);
});
