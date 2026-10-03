import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDictatedEntry, resolveSpokenEntry } from './dictated-words';

const neverCalled = async () => {
  throw new Error('AI should not be called');
};

test('normalizeDictatedEntry strips punctuation and rejects non-English entries', () => {
  assert.equal(normalizeDictatedEntry(' Apple. '), 'Apple');
  assert.equal(normalizeDictatedEntry('look  forward to,'), 'look forward to');
  assert.equal(normalizeDictatedEntry("don't"), "don't");
  assert.equal(normalizeDictatedEntry('りんご'), null);
  assert.equal(normalizeDictatedEntry('123'), null);
  assert.equal(normalizeDictatedEntry('um'), null);
  assert.equal(normalizeDictatedEntry(''), null);
  // 長すぎる並びは見出し語ではなく文
  assert.equal(normalizeDictatedEntry('this is a whole sentence said aloud'), null);
});

test('a confident English result is used as is without calling the AI', async () => {
  const entry = await resolveSpokenEntry(
    { english: ['beautiful'], englishConfidence: 0.93, japanese: ['ビューティフル'] },
    { generateText: neverCalled },
  );
  assert.equal(entry, 'beautiful');
});

test('a Japanese-accented utterance is resolved from both recognizers', async () => {
  const prompts: string[] = [];
  const entry = await resolveSpokenEntry(
    { english: ['a pole', 'a pull'], englishConfidence: 0.42, japanese: ['アップル'] },
    {
      generateText: async (prompt) => {
        prompts.push(prompt);
        return JSON.stringify({ entry: 'apple' });
      },
    },
  );

  assert.equal(entry, 'apple');
  assert.equal(prompts.length, 1);
  // 両方の認識結果を AI に見せていること
  assert.match(prompts[0], /a pole/);
  assert.match(prompts[0], /アップル/);
});

test('an idiom stays one entry', async () => {
  const entry = await resolveSpokenEntry(
    { english: ['look forward to'], englishConfidence: 0.95, japanese: [] },
    { generateText: neverCalled },
  );
  assert.equal(entry, 'look forward to');
});

test('a misheard multi-word result is never split into several entries', async () => {
  // AI が失敗しても、発話全体が1項目のまま返る (2語として追加されない)
  const entry = await resolveSpokenEntry(
    { english: ['a pole'], englishConfidence: 0.4, japanese: [] },
    { generateText: async () => 'not json' },
  );
  assert.equal(entry, 'a pole');
});

test('the AI cannot return something that is not an English headword', async () => {
  const entry = await resolveSpokenEntry(
    { english: ['apple'], englishConfidence: 0.5, japanese: ['アップル'] },
    { generateText: async () => JSON.stringify({ entry: 'りんご' }) },
  );
  // 使えない答えは捨て、英語の候補に落とす
  assert.equal(entry, 'apple');
});

test('Japanese-only recognition can still produce an English entry via the AI', async () => {
  const entry = await resolveSpokenEntry(
    { english: [], englishConfidence: 0, japanese: ['ビューティフル'] },
    { generateText: async () => JSON.stringify({ entry: 'beautiful' }) },
  );
  assert.equal(entry, 'beautiful');
});

test('nothing heard yields no entry and no AI call', async () => {
  const entry = await resolveSpokenEntry(
    { english: [], englishConfidence: 0, japanese: [] },
    { generateText: neverCalled },
  );
  assert.equal(entry, null);
});

test('an AI answer of "unknown" falls back to the English candidate', async () => {
  const entry = await resolveSpokenEntry(
    { english: ['serendipity'], englishConfidence: 0.6, japanese: [] },
    { generateText: async () => JSON.stringify({ entry: '' }) },
  );
  assert.equal(entry, 'serendipity');
});
