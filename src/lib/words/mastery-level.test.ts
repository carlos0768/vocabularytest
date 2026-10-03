import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MASTERY_LEVEL_FILLS,
  MASTERY_LEVEL_VOCABULARY_CYCLE,
  getMasteryLevel,
  getMasteryLevelFill,
  getMasteryLevelLabel,
  getVocabularyTypeForMasteryLevel,
} from './mastery-level';

test('習得でない語のレベルは、値が残っていても 0 として読む', () => {
  assert.equal(getMasteryLevel({ status: 'active', masteryLevel: 5 }), 0);
  assert.equal(getMasteryLevel({ status: 'new', masteryLevel: 2 }), 0);
  assert.equal(getMasteryLevel({ status: 'mastered', masteryLevel: 5 }), 5);
  // 未設定・不正値は 0
  assert.equal(getMasteryLevel({ status: 'mastered' }), 0);
  assert.equal(getMasteryLevel({ status: 'mastered', masteryLevel: null }), 0);
  assert.equal(getMasteryLevel({ status: 'mastered', masteryLevel: -3 }), 0);
  assert.equal(getMasteryLevel({ status: 'mastered', masteryLevel: 2.7 }), 2);
});

test('ラベルは Lv.0 だけ「習得」、以降は Lv.N', () => {
  assert.equal(getMasteryLevelLabel(0), '習得');
  assert.equal(getMasteryLevelLabel(1), 'Lv.1');
  assert.equal(getMasteryLevelLabel(12), 'Lv.12');
});

test('マスの色は Lv.0 が従来の黄緑で、レベルごとに変わり、一巡して繰り返す', () => {
  assert.equal(getMasteryLevelFill(0), '#84cc16');
  assert.notEqual(getMasteryLevelFill(1), getMasteryLevelFill(0));
  assert.notEqual(getMasteryLevelFill(2), getMasteryLevelFill(1));
  const n = MASTERY_LEVEL_FILLS.length;
  assert.equal(getMasteryLevelFill(n), getMasteryLevelFill(0));
  assert.equal(getMasteryLevelFill(n + 3), getMasteryLevelFill(3));
  // 他の段階の色 (定着中の青 / 学習中のオレンジ) とはかぶらない
  for (const fill of MASTERY_LEVEL_FILLS) {
    assert.notEqual(fill.toLowerCase(), '#2563eb');
    assert.notEqual(fill.toLowerCase(), '#f59e0b');
  }
  assert.equal(new Set(MASTERY_LEVEL_FILLS).size, n, '同じ色が2回入っている');
});

test('語彙モードは Lv.1 から passive, active の順に循環し、Lv.0 では切り替えない', () => {
  assert.deepEqual([...MASTERY_LEVEL_VOCABULARY_CYCLE], ['passive', 'active']);
  assert.equal(getVocabularyTypeForMasteryLevel(0), null);
  assert.equal(getVocabularyTypeForMasteryLevel(1), 'passive');
  assert.equal(getVocabularyTypeForMasteryLevel(2), 'active');
  assert.equal(getVocabularyTypeForMasteryLevel(3), 'passive');
  assert.equal(getVocabularyTypeForMasteryLevel(4), 'active');
  assert.equal(getVocabularyTypeForMasteryLevel(101), 'passive');
});
