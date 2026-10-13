import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HIDE_RELATED_WORDS_STORAGE_KEY,
  readHideRelatedWords,
  writeHideRelatedWords,
} from './related-words-display';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('related words display preference', () => {
  it('既定は表示（隠さない）', () => {
    assert.equal(readHideRelatedWords(memoryStorage()), false);
  });

  it('保存した値を読み戻せる', () => {
    const storage = memoryStorage();
    writeHideRelatedWords(true, storage);
    assert.equal(storage.getItem(HIDE_RELATED_WORDS_STORAGE_KEY), '1');
    assert.equal(readHideRelatedWords(storage), true);
    writeHideRelatedWords(false, storage);
    assert.equal(readHideRelatedWords(storage), false);
  });

  it('storage が無い・投げる場合は表示に倒す', () => {
    assert.equal(readHideRelatedWords(null), false);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    assert.equal(readHideRelatedWords(throwing), false);
    assert.doesNotThrow(() => writeHideRelatedWords(true, throwing));
  });
});
