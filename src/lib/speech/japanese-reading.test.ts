import test from 'node:test';
import assert from 'node:assert/strict';

import { clearJapaneseReadingCache, lookupJapaneseReadings } from './japanese-reading';

function stubGenerate(results: Array<{ text: string; reading: string }>) {
  const prompts: string[] = [];
  return {
    prompts,
    generateText: async (prompt: string) => {
      prompts.push(prompt);
      return JSON.stringify({ results });
    },
  };
}

test('readings are looked up for the texts that need them', async () => {
  clearJapaneseReadingCache();

  const stub = stubGenerate([
    { text: '恩赦', reading: 'おんしゃ' },
    { text: '御社', reading: 'おんしゃ' },
  ]);

  const readings = await lookupJapaneseReadings(['御社', '恩赦'], stub);

  assert.equal(readings['恩赦'], 'おんしゃ');
  assert.equal(readings['御社'], 'おんしゃ');
  assert.equal(stub.prompts.length, 1);
});

test('kana-only texts are their own reading and cost no AI call', async () => {
  clearJapaneseReadingCache();

  const stub = stubGenerate([]);
  const readings = await lookupJapaneseReadings(['コケ', 'きづく'], stub);

  // カタカナはひらがなに畳んで返す。判定側と同じ土俵に乗せるため。
  assert.equal(readings['コケ'], 'こけ');
  assert.equal(readings['きづく'], 'きづく');
  assert.equal(stub.prompts.length, 0);
});

test('a reading that came back with kanji left in it is not used', async () => {
  clearJapaneseReadingCache();

  const readings = await lookupJapaneseReadings(['恩赦'], stubGenerate([
    { text: '恩赦', reading: '恩しゃ' },
  ]));

  assert.equal(readings['恩赦'], undefined);
});

test('katakana readings are folded to hiragana', async () => {
  clearJapaneseReadingCache();

  const readings = await lookupJapaneseReadings(['苔'], stubGenerate([
    { text: '苔', reading: 'コケ' },
  ]));

  assert.equal(readings['苔'], 'こけ');
});

test('a text that was already looked up is not sent again', async () => {
  clearJapaneseReadingCache();

  const first = stubGenerate([{ text: '恩赦', reading: 'おんしゃ' }]);
  await lookupJapaneseReadings(['恩赦'], first);

  const second = stubGenerate([{ text: '恩赦', reading: 'おんしゃ' }]);
  const readings = await lookupJapaneseReadings(['恩赦'], second);

  assert.equal(readings['恩赦'], 'おんしゃ');
  assert.equal(second.prompts.length, 0);
});

test('a text the AI could not read is not asked about twice', async () => {
  clearJapaneseReadingCache();

  await lookupJapaneseReadings(['々'], stubGenerate([]));

  const second = stubGenerate([]);
  const readings = await lookupJapaneseReadings(['々'], second);

  assert.deepEqual(readings, {});
  assert.equal(second.prompts.length, 0);
});

test('a failing lookup returns no readings instead of throwing', async () => {
  clearJapaneseReadingCache();

  const readings = await lookupJapaneseReadings(['恩赦'], {
    generateText: async () => {
      throw new Error('AI is down');
    },
  });

  assert.deepEqual(readings, {});
});

test('a malformed AI response is ignored', async () => {
  clearJapaneseReadingCache();

  const readings = await lookupJapaneseReadings(['恩赦'], {
    generateText: async () => 'not json at all',
  });

  assert.deepEqual(readings, {});
});

test('blank and over-long texts are skipped', async () => {
  clearJapaneseReadingCache();

  const stub = stubGenerate([]);
  const readings = await lookupJapaneseReadings(['   ', '恩'.repeat(200)], stub);

  assert.deepEqual(readings, {});
  assert.equal(stub.prompts.length, 0);
});
