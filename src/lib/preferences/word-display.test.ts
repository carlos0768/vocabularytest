import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HIDEABLE_WORD_SECTIONS,
  WORD_SECTION_STORAGE_KEYS,
  readHideWordSection,
  writeHideWordSection,
} from './word-display';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('word display preference', () => {
  it('既定はどの項目も表示（隠さない）', () => {
    for (const section of HIDEABLE_WORD_SECTIONS) {
      assert.equal(readHideWordSection(section, memoryStorage()), false);
    }
  });

  it('保存した値を読み戻せる', () => {
    const storage = memoryStorage();
    writeHideWordSection('etymology', true, storage);
    assert.equal(readHideWordSection('etymology', storage), true);
    writeHideWordSection('etymology', false, storage);
    assert.equal(readHideWordSection('etymology', storage), false);
  });

  it('項目ごとに独立している', () => {
    const storage = memoryStorage();
    writeHideWordSection('etymology', true, storage);
    assert.equal(readHideWordSection('relatedWords', storage), false);
    assert.equal(readHideWordSection('etymology', storage), true);
  });

  it('関連語のキーは既存ユーザーの設定を引き継ぐ', () => {
    assert.equal(WORD_SECTION_STORAGE_KEYS.relatedWords, 'merken_hide_related_words');
    assert.equal(readHideWordSection('relatedWords', memoryStorage({ merken_hide_related_words: '1' })), true);
  });

  it('storage が無い・投げる場合は表示に倒す', () => {
    assert.equal(readHideWordSection('etymology', null), false);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    assert.equal(readHideWordSection('etymology', throwing), false);
    assert.doesNotThrow(() => writeHideWordSection('etymology', true, throwing));
  });
});
