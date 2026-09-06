import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_GRADE_SESSION,
  FLASHCARD_GRADES,
  FLASHCARD_GRADE_QUALITY,
  buildGradeWordUpdate,
  collectGradedWords,
  countGrades,
  getGradeFor,
  gradeForKey,
  isFlashcardGrade,
  isPassingGrade,
  recordGrade,
} from '@/lib/quiz/flashcard-grade';
import { calculateNextReviewByQuality, getStatusAfterQuality } from '@/lib/spaced-repetition';
import type { Word } from '@/types';

function word(overrides: Partial<Word> & { id: string }): Word {
  return {
    projectId: 'p1',
    english: `word-${overrides.id}`,
    japanese: '意味',
    status: 'new',
    isFavorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Word;
}

test('4段階は弱い記憶から強い記憶の順に並び、quality も単調に増える', () => {
  assert.deepEqual([...FLASHCARD_GRADES], ['again', 'hard', 'good', 'easy']);
  const qualities = FLASHCARD_GRADES.map((grade) => FLASHCARD_GRADE_QUALITY[grade]);
  for (let i = 1; i < qualities.length; i += 1) {
    assert.ok(qualities[i] > qualities[i - 1], `${qualities[i - 1]} < ${qualities[i]}`);
  }
});

test('「もう一度」だけが不合格、それ以外は覚えていた側に数える', () => {
  assert.equal(isPassingGrade('again'), false);
  assert.equal(isPassingGrade('hard'), true);
  assert.equal(isPassingGrade('good'), true);
  assert.equal(isPassingGrade('easy'), true);
});

test('キーボードの 1〜4 がボタンの並び順に対応する', () => {
  assert.equal(gradeForKey('1'), 'again');
  assert.equal(gradeForKey('2'), 'hard');
  assert.equal(gradeForKey('3'), 'good');
  assert.equal(gradeForKey('4'), 'easy');
  assert.equal(gradeForKey('5'), null);
  assert.equal(gradeForKey('a'), null);
});

test('isFlashcardGrade は4つだけを通す', () => {
  for (const grade of FLASHCARD_GRADES) assert.ok(isFlashcardGrade(grade));
  assert.equal(isFlashcardGrade('known'), false);
  assert.equal(isFlashcardGrade(null), false);
  assert.equal(isFlashcardGrade(3), false);
});

test('評価はクイズと同じ SM-2 関数で単語を更新する', () => {
  const target = word({ id: 'w1', status: 'review', easeFactor: 2.5, intervalDays: 6, repetition: 2 });

  for (const grade of FLASHCARD_GRADES) {
    const quality = FLASHCARD_GRADE_QUALITY[grade];
    const update = buildGradeWordUpdate(target, grade);
    const expected = calculateNextReviewByQuality(quality, target);
    assert.equal(update.status, getStatusAfterQuality(target.status, quality), grade);
    assert.equal(update.easeFactor, expected.easeFactor, grade);
    assert.equal(update.intervalDays, expected.intervalDays, grade);
    assert.equal(update.repetition, expected.repetition, grade);
    assert.ok(update.nextReviewAt, grade);
    assert.ok(update.lastReviewedAt, grade);
  }
});

test('「もう一度」は繰り返し回数を戻し、「簡単」は間隔と ease を伸ばす', () => {
  const target = word({ id: 'w1', status: 'active', easeFactor: 2.5, intervalDays: 6, repetition: 2 });

  const again = buildGradeWordUpdate(target, 'again');
  assert.equal(again.repetition, 0);
  assert.equal(again.intervalDays, 1);
  assert.ok(again.easeFactor < 2.5);
  // 定着中は取りこぼしても定着中のまま (クイズと同じ床)
  assert.equal(again.status, 'active');

  const easy = buildGradeWordUpdate(target, 'easy');
  assert.equal(easy.repetition, 3);
  assert.ok(easy.intervalDays > 6);
  assert.ok(easy.easeFactor > 2.5);
  assert.equal(easy.status, 'mastered');

  // 「難しい」は正解扱いだが ease は削られる。「普通」は ease を据え置く。
  const hard = buildGradeWordUpdate(target, 'hard');
  assert.equal(hard.repetition, 3);
  assert.ok(hard.easeFactor < 2.5);
  const good = buildGradeWordUpdate(target, 'good');
  assert.equal(good.easeFactor, 2.5);
});

test('同じ単語を再評価したら後の評価で上書きし、二重に数えない', () => {
  let session = recordGrade(EMPTY_GRADE_SESSION, 'w1', 'again');
  session = recordGrade(session, 'w2', 'good');
  session = recordGrade(session, 'w1', 'easy');

  assert.equal(getGradeFor(session, 'w1'), 'easy');
  assert.equal(getGradeFor(session, 'w2'), 'good');
  assert.equal(getGradeFor(session, 'w3'), null);
  assert.deepEqual(countGrades(session), { again: 0, hard: 0, good: 1, easy: 1, total: 2 });
  // 元のセッションは触らない
  assert.deepEqual(countGrades(EMPTY_GRADE_SESSION), { again: 0, hard: 0, good: 0, easy: 0, total: 0 });
});

test('「もう一度」の単語だけを山札の順で集める', () => {
  const words = [word({ id: 'a' }), word({ id: 'b' }), word({ id: 'c' }), word({ id: 'd' })];
  let session = recordGrade(EMPTY_GRADE_SESSION, 'c', 'again');
  session = recordGrade(session, 'a', 'again');
  session = recordGrade(session, 'b', 'good');

  assert.deepEqual(collectGradedWords(words, session, 'again').map((w) => w.id), ['a', 'c']);
  assert.deepEqual(collectGradedWords(words, session, 'good').map((w) => w.id), ['b']);
  assert.deepEqual(collectGradedWords(words, session, 'easy'), []);
});
