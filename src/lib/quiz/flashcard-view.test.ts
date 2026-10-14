import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLASHCARD_VIEW_STORAGE_KEY,
  isFlashcardView,
  readFlashcardView,
  reelIndexFromScroll,
  saveFlashcardView,
  type FlashcardViewStorage,
} from './flashcard-view';

function memoryStorage(initial: Record<string, string> = {}): FlashcardViewStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value; },
  };
}

test('isFlashcardView accepts only card and reel', () => {
  assert.equal(isFlashcardView('card'), true);
  assert.equal(isFlashcardView('reel'), true);
  assert.equal(isFlashcardView('grid'), false);
  assert.equal(isFlashcardView(null), false);
});

test('readFlashcardView defaults to card when nothing or garbage is stored', () => {
  assert.equal(readFlashcardView(null), 'card');
  assert.equal(readFlashcardView(memoryStorage()), 'card');
  assert.equal(readFlashcardView(memoryStorage({ [FLASHCARD_VIEW_STORAGE_KEY]: 'broken' })), 'card');
});

test('saveFlashcardView round-trips through storage', () => {
  const storage = memoryStorage();
  saveFlashcardView('reel', storage);
  assert.equal(storage.data[FLASHCARD_VIEW_STORAGE_KEY], 'reel');
  assert.equal(readFlashcardView(storage), 'reel');
});

test('readFlashcardView and saveFlashcardView survive a throwing storage', () => {
  const throwing: FlashcardViewStorage = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  assert.equal(readFlashcardView(throwing), 'card');
  assert.doesNotThrow(() => saveFlashcardView('reel', throwing));
});

test('reelIndexFromScroll snaps to the nearest panel and clamps to the deck', () => {
  assert.equal(reelIndexFromScroll(0, 600, 10), 0);
  assert.equal(reelIndexFromScroll(1190, 600, 10), 2);
  assert.equal(reelIndexFromScroll(1290, 600, 10), 2);
  assert.equal(reelIndexFromScroll(99999, 600, 10), 9);
  assert.equal(reelIndexFromScroll(-50, 600, 10), 0);
  assert.equal(reelIndexFromScroll(500, 0, 10), 0);
  assert.equal(reelIndexFromScroll(500, 600, 0), 0);
});
