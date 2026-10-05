import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeParaphraseHeadword, paraphraseHeadwordCandidates } from './headword';

test('見出し語は小文字・空白区切りに揃え、補足や記号を落とす', () => {
  assert.equal(normalizeParaphraseHeadword('  Plummet '), 'plummet');
  assert.equal(normalizeParaphraseHeadword('put off (延期する)'), 'put off');
  assert.equal(normalizeParaphraseHeadword('look forward to ~'), 'look forward to');
  assert.equal(normalizeParaphraseHeadword('look forward to 〜ing'), 'look forward to ing');
  assert.equal(normalizeParaphraseHeadword('deceive / trick'), 'deceive');
  assert.equal(normalizeParaphraseHeadword('to plummet'), 'plummet');
  assert.equal(normalizeParaphraseHeadword('be fond of'), 'fond of');
});

test('sb / sth のプレースホルダは外し、所有格は one’s に寄せる', () => {
  assert.equal(normalizeParaphraseHeadword('play a trick on sb'), 'play a trick on');
  assert.equal(normalizeParaphraseHeadword('make up sb’s mind'), "make up one's mind");
  assert.equal(normalizeParaphraseHeadword('take sth into account'), 'take into account');
  assert.equal(normalizeParaphraseHeadword("make up one's mind"), "make up one's mind");
});

test('日本語だけの見出し語は空になる (古典語は言い換えの対象外)', () => {
  assert.equal(normalizeParaphraseHeadword('いとをかし'), '');
  assert.deepEqual(paraphraseHeadwordCandidates('いとをかし'), []);
});

test('候補は忠実な形が先で、末尾の前置詞を落とした形が後', () => {
  assert.deepEqual(paraphraseHeadwordCandidates('cope with'), ['cope with', 'cope']);
  assert.deepEqual(paraphraseHeadwordCandidates('take part in'), ['take part in', 'take part']);
  assert.equal(paraphraseHeadwordCandidates('play a trick on sb')[0], 'play a trick on');
});

test('1 語なら活用を素朴に戻した候補も並べる', () => {
  const candidates = paraphraseHeadwordCandidates('plummeted');
  assert.equal(candidates[0], 'plummeted');
  assert.ok(candidates.includes('plummet'));
  assert.ok(paraphraseHeadwordCandidates('running').includes('run'));
  assert.ok(paraphraseHeadwordCandidates('studies').includes('study'));
  assert.ok(paraphraseHeadwordCandidates('boxes').includes('box'));
});

test('ハイフンと空白は互いに読み替える', () => {
  assert.ok(paraphraseHeadwordCandidates('well-known').includes('well known'));
  assert.ok(paraphraseHeadwordCandidates('well known').includes('well-known'));
});
