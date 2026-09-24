import test from 'node:test';
import assert from 'node:assert/strict';

import {
  excludeClassicalWords,
  isClassicalWord,
  selectClassicalWords,
  shouldSkipEnglishEnrichment,
} from '@/lib/classical/is-classical';

test('isClassicalWord accepts the extraction-time flag', () => {
  assert.equal(isClassicalWord({ isClassical: true }), true);
  assert.equal(isClassicalWord({ isClassical: false }), false);
});

test('isClassicalWord accepts a persisted dictionary link', () => {
  // words テーブルに is_classical 列は無く、classical_entry_id の有無が印になる
  assert.equal(isClassicalWord({ classicalEntryId: 'entry-1' }), true);
  assert.equal(isClassicalWord({ classicalEntryId: null }), false);
  assert.equal(isClassicalWord({ classicalEntryId: '' }), false);
});

test('isClassicalWord treats an unmarked or missing word as English', () => {
  // 既存の英単語は全部このパスを通るので、既定が false であることが重要
  assert.equal(isClassicalWord({}), false);
  assert.equal(isClassicalWord(null), false);
  assert.equal(isClassicalWord(undefined), false);
});

// 本番障害の回帰テスト。
//
// isClassicalWord が見出し語の文字種から「古典語である」と昇格させていたため、
// filterWordsForProjectKind が日本語見出しの語を英語単語帳から軒並み捨て、
// 古文単語帳のスキャンで1語も保存されないまま「N語追加しました」と通知した。
// 同一性の判定は印だけで行うこと。
test('isClassicalWord never promotes from the headword script alone', () => {
  assert.equal(isClassicalWord({ english: 'あさまし' }), false);
  assert.equal(isClassicalWord({ english: 'やむごとなし' }), false);
  // 現代日本語はなおさら古典語ではない
  assert.equal(isClassicalWord({ english: '勉強' }), false);
  assert.equal(isClassicalWord({ english: 'コンピュータ' }), false);
  // 印があれば当然 true
  assert.equal(isClassicalWord({ english: 'あさまし', isClassical: true }), true);
  assert.equal(isClassicalWord({ english: 'あさまし', classicalEntryId: 'entry-1' }), true);
});

test('shouldSkipEnglishEnrichment still protects Japanese headwords from English processing', () => {
  // 「英語処理をやらない」方向の判断なので、印が無くても文字種で拾ってよい。
  // 英語の語源解析・例文生成を日本語の見出し語に回してもコインを捨てるだけ。
  assert.equal(shouldSkipEnglishEnrichment({ english: 'あさまし' }), true);
  assert.equal(shouldSkipEnglishEnrichment({ english: '勉強' }), true);
  assert.equal(shouldSkipEnglishEnrichment({ isClassical: true }), true);
  assert.equal(shouldSkipEnglishEnrichment({ classicalEntryId: 'entry-1' }), true);

  // 英単語は当然そのまま英語処理に回す
  assert.equal(shouldSkipEnglishEnrichment({ english: 'admire' }), false);
  assert.equal(shouldSkipEnglishEnrichment({ english: 'take care of' }), false);
  assert.equal(shouldSkipEnglishEnrichment({}), false);
  assert.equal(shouldSkipEnglishEnrichment(null), false);
});

test('excludeClassicalWords keeps only the words English-only enrichment may touch', () => {
  const words = [
    { id: 'a', isClassical: false },
    { id: 'b', isClassical: true },
    { id: 'c', classicalEntryId: 'entry-1' },
    { id: 'd' },
    // 印は無いが見出し語が日本語 → 英語処理からは外す（が、古典語だとは断定しない）
    { id: 'e', english: 'あさまし' },
  ];

  assert.deepEqual(excludeClassicalWords(words).map((word) => word.id), ['a', 'd']);
  assert.deepEqual(selectClassicalWords(words).map((word) => word.id), ['b', 'c']);
});
