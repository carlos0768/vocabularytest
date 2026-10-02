import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DICTATED_WORDS,
  finalizeDictatedEntries,
  keepEntriesFoundInTranscript,
  normalizeDictatedEntry,
  splitDictatedTranscript,
  splitTranscriptByWhitespace,
} from './dictated-words';

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

test('finalizeDictatedEntries removes duplicates case-insensitively and keeps order', () => {
  assert.deepEqual(
    finalizeDictatedEntries(['apple', 'Banana', 'APPLE', 'banana', 'cherry']),
    ['apple', 'Banana', 'cherry'],
  );
});

test('finalizeDictatedEntries caps the number of entries', () => {
  const many = Array.from(
    { length: MAX_DICTATED_WORDS + 20 },
    (_, i) => `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
  );
  assert.equal(finalizeDictatedEntries(many).length, MAX_DICTATED_WORDS);
});

test('splitTranscriptByWhitespace returns one entry per spoken word', () => {
  assert.deepEqual(
    splitTranscriptByWhitespace('apple, banana uh beautiful'),
    ['apple', 'banana', 'beautiful'],
  );
});

test('keepEntriesFoundInTranscript drops entries the AI rewrote or invented', () => {
  const transcript = 'apple look forward to beautifull';
  assert.deepEqual(
    keepEntriesFoundInTranscript(
      ['apple', 'look forward to', 'beautiful', 'orange', 'forward look'],
      transcript,
    ),
    ['apple', 'look forward to'],
  );
});

test('splitDictatedTranscript groups idioms using the AI split', async () => {
  const prompts: string[] = [];
  const entries = await splitDictatedTranscript('apple look forward to beautiful', {
    generateText: async (prompt) => {
      prompts.push(prompt);
      return JSON.stringify({ entries: ['apple', 'look forward to', 'beautiful'] });
    },
  });

  assert.deepEqual(entries, ['apple', 'look forward to', 'beautiful']);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /apple look forward to beautiful/);
});

test('splitDictatedTranscript skips the AI for a single word', async () => {
  const entries = await splitDictatedTranscript('Serendipity', {
    generateText: async () => {
      throw new Error('should not be called');
    },
  });
  assert.deepEqual(entries, ['Serendipity']);
});

test('splitDictatedTranscript falls back to whitespace when the AI fails', async () => {
  const entries = await splitDictatedTranscript('apple banana', {
    generateText: async () => 'not json',
  });
  assert.deepEqual(entries, ['apple', 'banana']);
});

test('splitDictatedTranscript falls back when nothing the AI returned is in the transcript', async () => {
  const entries = await splitDictatedTranscript('apple banana', {
    generateText: async () => JSON.stringify({ entries: ['orange'] }),
  });
  assert.deepEqual(entries, ['apple', 'banana']);
});

test('splitDictatedTranscript returns nothing for an empty transcript', async () => {
  assert.deepEqual(await splitDictatedTranscript('   '), []);
});
