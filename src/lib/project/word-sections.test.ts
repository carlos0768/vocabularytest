import test from 'node:test';
import assert from 'node:assert/strict';
import type { Word } from '@/types';
import {
  buildWordSectionGroups,
  getSectionGroupLabel,
  insertSectionName,
  removeSectionName,
  renameSectionName,
  resolveProjectSectionNames,
  suggestNewSectionName,
  UNSECTIONED_LABEL,
} from './word-sections';

function word(id: string, sectionName?: string | null): Word {
  return {
    id,
    projectId: 'p',
    english: id,
    japanese: id,
    distractors: [],
    status: 'new',
    createdAt: '2026-10-14T00:00:00.000Z',
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    sectionName,
  };
}

test('セクションが無い単語帳は全語で1つのまとまり (ラベルなし)', () => {
  const words = [word('a'), word('b')];
  const groups = buildWordSectionGroups([], words, words);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].words.length, 2);
  assert.equal(getSectionGroupLabel(groups[0], groups.length), null);
});

test('セクションごとに語を分け、未分類は語があるときだけ先頭に置く', () => {
  const words = [word('a'), word('b', 'S1'), word('c', 'S2'), word('d', 'S1')];
  const groups = buildWordSectionGroups(['S1', 'S2', 'S3'], words, words);
  assert.deepEqual(groups.map((g) => g.name), [null, 'S1', 'S2', 'S3']);
  assert.deepEqual(groups[1].words.map((w) => w.id), ['b', 'd']);
  assert.equal(groups[3].words.length, 0);
  assert.equal(getSectionGroupLabel(groups[0], groups.length), UNSECTIONED_LABEL);

  const sectioned = [word('b', 'S1')];
  assert.deepEqual(buildWordSectionGroups(['S1'], sectioned, sectioned).map((g) => g.name), ['S1']);
});

test('絞り込みで語が減ってもまとまりの数は変わらない', () => {
  const all = [word('a'), word('b', 'S1')];
  const groups = buildWordSectionGroups(['S1'], all, [all[1]]);
  assert.deepEqual(groups.map((g) => [g.name, g.words.length]), [[null, 0], ['S1', 1]]);
});

test('単語だけが持っているセクション名も一覧に足す', () => {
  assert.deepEqual(
    resolveProjectSectionNames(['S1'], [word('a', 'S2'), word('b', ' S1 '), word('c', null)]),
    ['S1', 'S2'],
  );
});

test('セクションの追加は前後どちらにも入り、重複はしない', () => {
  assert.deepEqual(insertSectionName(['A'], ' B ', 'end'), ['A', 'B']);
  assert.deepEqual(insertSectionName(['A'], 'B', 'start'), ['B', 'A']);
  assert.deepEqual(insertSectionName(['A', 'B'], 'A', 'end'), ['A', 'B']);
  assert.deepEqual(insertSectionName(['A'], '   ', 'end'), ['A']);
});

test('新しいセクション名の初期値は使われていない番号', () => {
  assert.equal(suggestNewSectionName([]), 'セクション1');
  assert.equal(suggestNewSectionName(['セクション2', 'x']), 'セクション3');
  assert.equal(suggestNewSectionName(['セクション2']), 'セクション3');
});

test('セクションの名前変更は並びを保ち、重複・空・同名では変えない', () => {
  assert.deepEqual(renameSectionName(['A', 'B', 'C'], 'B', ' B2 '), ['A', 'B2', 'C']);
  assert.deepEqual(renameSectionName(['A', 'B'], 'B', 'A'), ['A', 'B']);
  assert.deepEqual(renameSectionName(['A', 'B'], 'B', '  '), ['A', 'B']);
  assert.deepEqual(renameSectionName(['A', 'B'], 'B', 'B'), ['A', 'B']);
  assert.deepEqual(renameSectionName(['A'], 'X', 'Y'), ['A']);
});

test('セクションの削除は並びを保ち、無い名前では変えない', () => {
  assert.deepEqual(removeSectionName(['A', 'B', 'C'], ' B '), ['A', 'C']);
  assert.deepEqual(removeSectionName(['A', 'B'], 'X'), ['A', 'B']);
  assert.deepEqual(removeSectionName(['A'], ''), ['A']);
});
