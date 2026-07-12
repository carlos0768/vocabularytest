import test from 'node:test';
import assert from 'node:assert/strict';

import { findAffixCandidates } from './candidates';
import { AFFIX_CATALOG } from './affix-catalog';

function candidateIds(english: string): string[] {
  return findAffixCandidates(english).map((sense) => sense.id);
}

test('unhappy matches the un- prefix senses (both meanings of the same spelling)', () => {
  const ids = candidateIds('unhappy');
  // 同綴り異義: un-not（否定）と un-reverse（逆転）の両方が候補に含まれ、
  // AI がどちらかを id で指定して返す。
  assert.ok(ids.includes('un-not'));
  assert.ok(ids.includes('un-reverse'));
});

test('unanimous matches both un- and uni- so the AI can pick the correct origin', () => {
  const ids = candidateIds('unanimous');
  assert.ok(ids.includes('un-not'));
  assert.ok(ids.includes('uni-one'));
});

test('a matched form includes ALL senses sharing that (form, kind)', () => {
  const ids = candidateIds('teacher');
  // -er は「〜する人」と「比較級」の2 sense — 両方送る
  assert.ok(ids.includes('er-agent'));
  assert.ok(ids.includes('er-comparative'));
});

test('prefix match requires at least 3 remaining root letters', () => {
  // "rest" は re + st（残り2文字）なので re- 候補にしない
  assert.ok(!candidateIds('rest').includes('re-again'));
  // "rebuild" は re + build なので候補になる
  assert.ok(candidateIds('rebuild').includes('re-again'));
});

test('suffix match works and respects the min-root guard', () => {
  assert.ok(candidateIds('happiness').includes('ness-noun'));
  assert.ok(candidateIds('dangerous').includes('ous-adj'));
});

test('infix connecting vowels match word-interior occurrences', () => {
  const ids = candidateIds('herbivore');
  assert.ok(ids.includes('i-link'));
  const thermoIds = candidateIds('thermometer');
  assert.ok(thermoIds.includes('o-link'));
});

test('very short words return no candidates', () => {
  assert.deepEqual(findAffixCandidates('an'), []);
  assert.deepEqual(findAffixCandidates(''), []);
});

test('normalization strips case and non-letters before matching', () => {
  assert.ok(candidateIds('  Unhappy!  ').includes('un-not'));
});

test('catalog invariants: unique ids, lowercase forms, valid kinds, non-empty content', () => {
  const seenIds = new Set<string>();
  for (const sense of AFFIX_CATALOG) {
    assert.ok(!seenIds.has(sense.id), `duplicate affix id: ${sense.id}`);
    seenIds.add(sense.id);
    assert.match(sense.form, /^[a-z]+$/, `form must be lowercase ascii: ${sense.id}`);
    assert.ok(['prefix', 'suffix', 'infix'].includes(sense.kind), `invalid kind: ${sense.id}`);
    assert.ok(sense.meaningJa.length > 0, `meaningJa required: ${sense.id}`);
    assert.ok(sense.examples.length > 0, `examples required: ${sense.id}`);
  }
});

test('catalog keeps same-spelling different-meaning senses as separate rows', () => {
  const unSenses = AFFIX_CATALOG.filter((sense) => sense.form === 'un' && sense.kind === 'prefix');
  assert.ok(unSenses.length >= 2, 'un- must have at least 2 senses (否定 / 逆転)');
  const meanings = new Set(unSenses.map((sense) => sense.meaningJa));
  assert.equal(meanings.size, unSenses.length, 'each un- sense must have a distinct meaning');
});
