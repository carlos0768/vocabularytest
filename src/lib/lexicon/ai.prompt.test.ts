import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const aiSource = readFileSync(
  fileURLToPath(new URL('./ai.ts', import.meta.url)),
  'utf8',
);

test('translation hint validation prompt rejects one-sided parentheses', () => {
  assert.match(aiSource, /normalizedJapanese と suggestedJapanese に括弧を使う場合/);
  assert.match(aiSource, /片側だけの括弧は禁止/);
  assert.match(aiSource, /本質が\)Aにある/);
  assert.match(aiSource, /本質が（Aにある）/);
  assert.match(aiSource, /対応するペアで出力する/);
});
