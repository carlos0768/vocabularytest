import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_SWIPE_SESSION,
  SWIPE_COMMIT_PX,
  buildSwipeWordUpdate,
  collectSwipedWords,
  countSwipes,
  forgetSwipe,
  getSwipeIntensity,
  getSwipePreview,
  getSwipeVerdict,
  getSwipeVerdictFor,
  recordSwipe,
} from '@/lib/quiz/flashcard-swipe';
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

test('しきい値を超えた向きだけが仕分けになる', () => {
  assert.equal(getSwipeVerdict(SWIPE_COMMIT_PX), 'known');
  assert.equal(getSwipeVerdict(-SWIPE_COMMIT_PX), 'unknown');
  assert.equal(getSwipeVerdict(SWIPE_COMMIT_PX - 1), null);
  assert.equal(getSwipeVerdict(-(SWIPE_COMMIT_PX - 1)), null);
  assert.equal(getSwipeVerdict(0), null);
});

test('スタンプの濃さはしきい値で頭打ちになる', () => {
  assert.equal(getSwipeIntensity(0, 100), 0);
  assert.equal(getSwipeIntensity(50, 100), 0.5);
  assert.equal(getSwipeIntensity(-50, 100), 0.5);
  assert.equal(getSwipeIntensity(400, 100), 1);
});

test('しきい値未満でも向きが決まっていればスタンプは出す', () => {
  assert.deepEqual(getSwipePreview(30, 100), { verdict: 'known', intensity: 0.3, committed: false });
  assert.deepEqual(getSwipePreview(-120, 100), { verdict: 'unknown', intensity: 1, committed: true });
  assert.equal(getSwipePreview(0, 100), null);
});

test('覚えてるはクイズ正解と同じ重みで単語を進める', () => {
  const target = word({ id: 'w1', status: 'review', repetition: 1, intervalDays: 1, easeFactor: 2.5 });
  const update = buildSwipeWordUpdate(target, 'known');

  assert.equal(update.status, 'active');
  assert.equal(update.repetition, 2);
  assert.ok(update.intervalDays > 1, '正解では次の復習が先に延びる');
  assert.ok(new Date(update.nextReviewAt).getTime() > Date.now());
});

test('覚えてないは復習を翌日に引き戻す', () => {
  const target = word({ id: 'w1', status: 'mastered', repetition: 5, intervalDays: 30, easeFactor: 2.5 });
  const update = buildSwipeWordUpdate(target, 'unknown');

  assert.equal(update.status, 'active');
  assert.equal(update.repetition, 0);
  assert.equal(update.intervalDays, 1);
});

test('同じ単語を仕分け直すと後の判定で上書きされる', () => {
  let session = recordSwipe(EMPTY_SWIPE_SESSION, 'w1', 'unknown');
  session = recordSwipe(session, 'w2', 'known');
  session = recordSwipe(session, 'w1', 'known');

  assert.deepEqual(session.unknown, []);
  assert.deepEqual(session.known, ['w2', 'w1']);
  assert.deepEqual(countSwipes(session), { known: 2, unknown: 0, total: 2 });
  assert.equal(getSwipeVerdictFor(session, 'w1'), 'known');
  assert.equal(getSwipeVerdictFor(session, 'missing'), null);
});

test('記録は書き換えではなく作り直しで返す', () => {
  const session = recordSwipe(EMPTY_SWIPE_SESSION, 'w1', 'known');

  assert.deepEqual(EMPTY_SWIPE_SESSION.known, []);
  assert.deepEqual(session.known, ['w1']);
});

test('やり直しは山札から抜いた記録だけを消す', () => {
  let session = recordSwipe(EMPTY_SWIPE_SESSION, 'w1', 'known');
  session = recordSwipe(session, 'w2', 'unknown');
  session = forgetSwipe(session, 'w2');

  assert.deepEqual(session, { known: ['w1'], unknown: [] });
});

test('未習得の山は仕分けた順のまま単語に戻せる', () => {
  const words = [word({ id: 'w1' }), word({ id: 'w2' }), word({ id: 'w3' })];
  let session = recordSwipe(EMPTY_SWIPE_SESSION, 'w3', 'unknown');
  session = recordSwipe(session, 'w1', 'unknown');
  session = recordSwipe(session, 'w2', 'known');

  assert.deepEqual(collectSwipedWords(words, session, 'unknown').map((w) => w.id), ['w3', 'w1']);
  assert.deepEqual(collectSwipedWords(words, session, 'known').map((w) => w.id), ['w2']);
});

test('消えた単語IDは山札に混ぜない', () => {
  const session = recordSwipe(EMPTY_SWIPE_SESSION, 'gone', 'unknown');

  assert.deepEqual(collectSwipedWords([word({ id: 'w1' })], session, 'unknown'), []);
});
