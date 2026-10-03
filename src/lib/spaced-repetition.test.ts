import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateNextReview,
  calculateNextReviewByQuality,
  compareWordsByPriority,
  getProgressAfterAnswer,
  getProgressAfterQuality,
  getStatusAfterQuality,
} from './spaced-repetition';
import type { Word } from '@/types';

const baseWord: Word = {
  id: 'word-1',
  projectId: 'project-1',
  english: 'run',
  japanese: '走る',
  distractors: ['walk', 'eat', 'sleep'],
  status: 'review',
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  easeFactor: 2.5,
  intervalDays: 6,
  repetition: 2,
  isFavorite: false,
};

test('calculateNextReviewByQuality resets repetition on low quality', () => {
  const result = calculateNextReviewByQuality(1, baseWord);

  assert.equal(result.repetition, 0);
  assert.equal(result.intervalDays, 1);
  assert.ok(result.easeFactor < baseWord.easeFactor);
});

test('calculateNextReviewByQuality keeps progression on high quality', () => {
  const hard = calculateNextReviewByQuality(3, baseWord);
  const easy = calculateNextReviewByQuality(5, baseWord);

  assert.equal(hard.repetition, 3);
  assert.equal(easy.repetition, 3);
  assert.equal(hard.intervalDays, 15);
  assert.equal(easy.intervalDays, 15);
  assert.ok(easy.easeFactor > hard.easeFactor);
});

test('calculateNextReview remains compatible with boolean API', () => {
  const fromBoolean = calculateNextReview(true, baseWord);
  const fromQuality = calculateNextReviewByQuality(4, baseWord);

  assert.equal(fromBoolean.intervalDays, fromQuality.intervalDays);
  assert.equal(fromBoolean.repetition, fromQuality.repetition);
  assert.equal(fromBoolean.easeFactor, fromQuality.easeFactor);
});

test('getStatusAfterQuality treats low quality as failed recall', () => {
  assert.equal(getStatusAfterQuality('new', 2), 'new');
  assert.equal(getStatusAfterQuality('review', 2), 'new');
  assert.equal(getStatusAfterQuality('active', 2), 'active');
  assert.equal(getStatusAfterQuality('mastered', 2), 'active');
  assert.equal(getStatusAfterQuality('review', 3), 'review');
});

test('getProgressAfterQuality は習得までは status だけを進め、レベルは 0 のまま', () => {
  assert.deepEqual(getProgressAfterQuality({ status: 'new' }, 4), { status: 'review', masteryLevel: 0 });
  assert.deepEqual(getProgressAfterQuality({ status: 'review' }, 4), { status: 'active', masteryLevel: 0 });
  assert.deepEqual(getProgressAfterQuality({ status: 'active' }, 4), { status: 'mastered', masteryLevel: 0 });
  // 習得でない語に古いレベルが残っていても持ち越さない
  assert.deepEqual(getProgressAfterQuality({ status: 'active', masteryLevel: 7 }, 2), { status: 'active', masteryLevel: 0 });
});

test('習得からは正解でレベルが 1 ずつ上がり、上限が無い', () => {
  assert.deepEqual(
    getProgressAfterQuality({ status: 'mastered', masteryLevel: 0, vocabularyType: 'passive' }, 4),
    { status: 'mastered', masteryLevel: 1 },
  );
  const high = getProgressAfterQuality({ status: 'mastered', masteryLevel: 999 }, 5);
  assert.equal(high.status, 'mastered');
  assert.equal(high.masteryLevel, 1000);
});

test('習得で間違えると 1 段戻る: Lv.N → Lv.N-1、Lv.0 → 定着中', () => {
  assert.equal(getProgressAfterQuality({ status: 'mastered', masteryLevel: 3 }, 1).masteryLevel, 2);
  assert.equal(getProgressAfterQuality({ status: 'mastered', masteryLevel: 3 }, 1).status, 'mastered');
  assert.deepEqual(getProgressAfterQuality({ status: 'mastered', masteryLevel: 0 }, 1), { status: 'active', masteryLevel: 0 });
  // 難しかった (quality 3) は据え置き
  assert.equal(getProgressAfterQuality({ status: 'mastered', masteryLevel: 3 }, 3).masteryLevel, 3);
});

test('Lv.1 からは語彙モードを passive → active → passive … と付け替える', () => {
  // Lv.0 → Lv.1: passive
  assert.equal(getProgressAfterAnswer({ status: 'mastered', masteryLevel: 0, vocabularyType: 'active' }, true).vocabularyType, 'passive');
  // Lv.1 → Lv.2: active
  assert.equal(getProgressAfterAnswer({ status: 'mastered', masteryLevel: 1, vocabularyType: 'passive' }, true).vocabularyType, 'active');
  // Lv.2 → Lv.3: passive
  assert.equal(getProgressAfterAnswer({ status: 'mastered', masteryLevel: 2, vocabularyType: 'active' }, true).vocabularyType, 'passive');
  // 戻るときも新しいレベルに合わせる: Lv.2 → Lv.1 は passive
  assert.equal(getProgressAfterAnswer({ status: 'mastered', masteryLevel: 2, vocabularyType: 'active' }, false).vocabularyType, 'passive');
  // 未設定 (null) から Lv.1 へ上がるときも passive を明示する (未設定は Passive あつかいだが、
  // 以後は交互に回るので印を付けておく)
  assert.equal(getProgressAfterAnswer({ status: 'mastered', masteryLevel: 0, vocabularyType: null }, true).vocabularyType, 'passive');
});

test('語彙モードが既にそのレベルの値なら更新に含めない (無駄な書き込みをしない)', () => {
  const update = getProgressAfterAnswer({ status: 'mastered', masteryLevel: 0, vocabularyType: 'passive' }, true);
  assert.equal(update.masteryLevel, 1);
  assert.equal('vocabularyType' in update, false);
});

test('習得したて (Lv.0) に落ち着くときは語彙モードに触らない', () => {
  // 定着中 → 習得 (Lv.0)
  const toMastered = getProgressAfterAnswer({ status: 'active', vocabularyType: 'active' }, true);
  assert.equal(toMastered.status, 'mastered');
  assert.equal('vocabularyType' in toMastered, false);
  // Lv.1 → Lv.0 (間違い) も触らない
  const back = getProgressAfterAnswer({ status: 'mastered', masteryLevel: 1, vocabularyType: 'passive' }, false);
  assert.deepEqual(back, { status: 'mastered', masteryLevel: 0 });
});

test('古典語はレベルは上がるが語彙モードは回さない (記述クイズに出さないため)', () => {
  const update = getProgressAfterAnswer(
    { status: 'mastered', masteryLevel: 0, vocabularyType: null, classicalEntryId: 'ce-1' },
    true,
  );
  assert.equal(update.masteryLevel, 1);
  assert.equal('vocabularyType' in update, false);
});

test('習得同士はレベルの低い語を先に出す', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const low = { id: 'a', status: 'mastered' as const, createdAt: '2026-01-02T00:00:00.000Z', masteryLevel: 1 };
  const high = { id: 'b', status: 'mastered' as const, createdAt: '2026-01-01T00:00:00.000Z', masteryLevel: 4 };
  assert.ok(compareWordsByPriority(low, high, now) < 0);
  assert.ok(compareWordsByPriority(high, low, now) > 0);
  // 段階が違えば段階が優先 (定着中は習得より先)
  const active = { id: 'c', status: 'active' as const, createdAt: '2026-01-03T00:00:00.000Z' };
  assert.ok(compareWordsByPriority(active, low, now) < 0);
});
