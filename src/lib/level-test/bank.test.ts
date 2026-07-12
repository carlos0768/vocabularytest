import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseLevelTestBank } from './bank';

function validBankJson() {
  return {
    version: 1,
    levels: Array.from({ length: 7 }, (_, levelIndex) => [
      [`word-${levelIndex}`, `訳${levelIndex}`, ['誤1', '誤2', '誤3']],
      [`other-${levelIndex}`, `別訳${levelIndex}`, ['誤4', '誤5', '誤6']],
    ]),
  };
}

test('parseLevelTestBank accepts a valid bank', () => {
  const bank = parseLevelTestBank(validBankJson());
  assert.equal(bank.version, 1);
  assert.equal(bank.levels.length, 7);
  assert.deepEqual(bank.levels[0][0], {
    english: 'word-0',
    japanese: '訳0',
    distractors: ['誤1', '誤2', '誤3'],
  });
});

test('parseLevelTestBank rejects malformed shapes', () => {
  assert.throws(() => parseLevelTestBank(null));
  assert.throws(() => parseLevelTestBank({ levels: [] }));
  assert.throws(() => parseLevelTestBank({ version: 1, levels: [[]] }));

  const wrongLevelCount = validBankJson();
  wrongLevelCount.levels.pop();
  assert.throws(() => parseLevelTestBank(wrongLevelCount));

  const emptyLevel = validBankJson();
  emptyLevel.levels[3] = [];
  assert.throws(() => parseLevelTestBank(emptyLevel));
});

test('parseLevelTestBank drops rows with short distractor arrays or non-string fields', () => {
  const bank = validBankJson();
  bank.levels[0].push(['broken', '訳', ['誤1', '誤2']] as never);
  bank.levels[0].push([123, '訳', ['誤1', '誤2', '誤3']] as never);
  bank.levels[0].push(['empty-ja', '', ['誤1', '誤2', '誤3']] as never);

  const parsed = parseLevelTestBank(bank);
  assert.equal(parsed.levels[0].length, 2);
});

test('the committed bank-v1.json parses and has 7 well-formed levels', () => {
  const raw = readFileSync(join(process.cwd(), 'public', 'level-test', 'bank-v1.json'), 'utf8');
  const bank = parseLevelTestBank(JSON.parse(raw));
  assert.equal(bank.levels.length, 7);
  for (const level of bank.levels) {
    assert.ok(level.length >= 100, `level has only ${level.length} words`);
    for (const word of level) {
      assert.ok(!word.distractors.includes(word.japanese));
    }
  }
});
