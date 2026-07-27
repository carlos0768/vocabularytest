import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SENSE_EIKEN_CEFR_TOLERANCE,
  filterSensesByEikenLevel,
  isSenseTooEasyForEikenLevel,
  normalizeCefrLevel,
} from './sense-eiken-level';

test('normalizeCefrLevel accepts A1-C2 case-insensitively and rejects junk', () => {
  assert.equal(normalizeCefrLevel('b2'), 'B2');
  assert.equal(normalizeCefrLevel(' C1 '), 'C1');
  assert.equal(normalizeCefrLevel('B3'), undefined);
  assert.equal(normalizeCefrLevel(null), undefined);
  assert.equal(normalizeCefrLevel(undefined), undefined);
});

test('tolerance is two CEFR steps below the level threshold', () => {
  assert.equal(SENSE_EIKEN_CEFR_TOLERANCE, 2);
});

test('pre-1 learners skip A1/A2 senses but keep B1 and above', () => {
  // 準1級 -> CEFR B2 帯。しきい値から2段以上易しい語義は出さない。
  assert.equal(isSenseTooEasyForEikenLevel('A1', 'pre1'), true);
  assert.equal(isSenseTooEasyForEikenLevel('A2', 'pre1'), true);
  assert.equal(isSenseTooEasyForEikenLevel('B1', 'pre1'), false);
  assert.equal(isSenseTooEasyForEikenLevel('B2', 'pre1'), false);
  assert.equal(isSenseTooEasyForEikenLevel('C1', 'pre1'), false);
});

test('lower levels keep easier senses', () => {
  // 3級 -> A2 帯。A1 は1段差なので残す。
  assert.equal(isSenseTooEasyForEikenLevel('A1', '3'), false);
  // 2級 -> B1 帯。A1 は2段差なので落とす。
  assert.equal(isSenseTooEasyForEikenLevel('A1', '2'), true);
  assert.equal(isSenseTooEasyForEikenLevel('A2', '2'), false);
  // 1級 -> C1 帯。B1 まで落とし、B2 以上を残す。
  assert.equal(isSenseTooEasyForEikenLevel('B1', '1'), true);
  assert.equal(isSenseTooEasyForEikenLevel('B2', '1'), false);
});

test('unknown sense level and unknown eiken level never drop a sense', () => {
  assert.equal(isSenseTooEasyForEikenLevel(null, 'pre1'), false);
  assert.equal(isSenseTooEasyForEikenLevel(undefined, 'pre1'), false);
  assert.equal(isSenseTooEasyForEikenLevel('A1', null), false);
  assert.equal(isSenseTooEasyForEikenLevel('A1', 'unknown-grade'), false);
});

test('a pre-1 learner keeps "right = 権利" and drops "right = 右"', () => {
  const senses = [
    { name: '右', cefrLevel: 'A1', isPrimary: true },
    { name: '権利', cefrLevel: 'B1', isPrimary: false },
  ];

  const kept = filterSensesByEikenLevel(senses, 'pre1');

  assert.deepEqual(kept.map((sense) => sense.name), ['権利']);
});

test('a 3rd-grade learner keeps every sense of the same word', () => {
  const senses = [
    { name: '右', cefrLevel: 'A1', isPrimary: true },
    { name: '権利', cefrLevel: 'B1', isPrimary: false },
  ];

  assert.equal(filterSensesByEikenLevel(senses, '3').length, 2);
});

test('senses are never all filtered out: the hardest one survives', () => {
  const senses = [
    { name: '右', cefrLevel: 'A1', isPrimary: true },
    { name: '正しい', cefrLevel: 'A2', isPrimary: false },
  ];

  const kept = filterSensesByEikenLevel(senses, '1');

  assert.deepEqual(kept.map((sense) => sense.name), ['正しい']);
});

test('when the surviving senses tie on level, the primary meaning wins', () => {
  const senses = [
    { name: '右', cefrLevel: 'A1', isPrimary: true },
    { name: 'ぴったりの', cefrLevel: 'A1', isPrimary: false },
  ];

  const kept = filterSensesByEikenLevel(senses, 'pre1');

  assert.deepEqual(kept.map((sense) => sense.name), ['右']);
});

test('no eiken level means no filtering', () => {
  const senses = [
    { name: '右', cefrLevel: 'A1', isPrimary: true },
    { name: '権利', cefrLevel: 'B1', isPrimary: false },
  ];

  assert.equal(filterSensesByEikenLevel(senses, null).length, 2);
  assert.equal(filterSensesByEikenLevel([], 'pre1').length, 0);
});
