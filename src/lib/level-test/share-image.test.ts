import test from 'node:test';
import assert from 'node:assert/strict';

import { LEVEL_ACCENT_COLORS } from './share';
import {
  LEVEL_TEST_SHARE_FILE_NAME,
  buildLevelTestCardText,
  generateLevelTestShareImage,
} from './share-image';
import type { LevelTestResultPayload } from './result-code';

function payloadOf(overrides: Partial<LevelTestResultPayload> = {}): LevelTestResultPayload {
  return {
    v: 2,
    finalLevel: 5,
    maxLevel: 6,
    clearedMax: false,
    correctTotal: 14,
    askedByLevel: [0, 0, 2, 4, 5, 6, 3],
    correctByLevel: [0, 0, 2, 4, 4, 3, 1],
    ability: 5.5,
    lowerLevel: 4,
    upperLevel: 6,
    lowerAbility: 4.5,
    upperAbility: 6,
    confidence: 'medium',
    ...overrides,
  };
}

test('buildLevelTestCardText mirrors the on-screen result card', () => {
  const text = buildLevelTestCardText(payloadOf());

  assert.equal(text.grade, '英検準1級');
  assert.equal(text.accent, LEVEL_ACCENT_COLORS[5]);
  // θ由来の推定語彙数(共有文言と同じ値)
  assert.equal(text.vocab, '9,800');
  assert.equal(text.correctText, '20問中14問正解');
  assert.equal(text.crowned, false);
  assert.ok(text.vocabRangeText?.startsWith('推定範囲 約'));
});

test('buildLevelTestCardText falls back to the level table for v1 payloads', () => {
  const text = buildLevelTestCardText(payloadOf({
    v: 1,
    ability: undefined,
    lowerAbility: undefined,
    upperAbility: undefined,
    confidence: undefined,
  }));

  assert.equal(text.vocab, '7,500');
  // 推定範囲を持たないv1では範囲行を出さない
  assert.equal(text.vocabRangeText, null);
});

test('buildLevelTestCardText drops a degenerate vocab range', () => {
  const text = buildLevelTestCardText(payloadOf({ lowerAbility: 5.5, upperAbility: 5.5 }));
  assert.equal(text.vocabRangeText, null);
});

test('clearedMax is surfaced on the card', () => {
  const text = buildLevelTestCardText(payloadOf({ finalLevel: 6, clearedMax: true }));
  assert.equal(text.grade, '英検1級');
  assert.equal(text.crowned, true);
});

test('the share file name is a png (Instagram accepts images only)', () => {
  assert.ok(LEVEL_TEST_SHARE_FILE_NAME.endsWith('.png'));
});

test('generateLevelTestShareImage returns null instead of throwing without a DOM', async () => {
  assert.equal(await generateLevelTestShareImage(payloadOf()), null);
});
