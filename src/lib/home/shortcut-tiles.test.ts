import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHomeShortcutTiles } from './shortcut-tiles';

const p = (id: string) => ({ id });
const g = (id: string) => ({ id });
const b = (id: string) => ({ id });

test('自分の単語帳とグループが埋まる場合、おすすめは表示されない', () => {
  const tiles = buildHomeShortcutTiles({
    projects: [p('p1'), p('p2'), p('p3'), p('p4'), p('p5')],
    groups: [g('g1'), g('g2')],
    recommendations: [b('b1'), b('b2'), b('b3')],
    slots: 7,
  });

  assert.equal(tiles.length, 7);
  assert.deepEqual(
    tiles.map((tile) => tile.kind),
    ['project', 'project', 'project', 'project', 'project', 'group', 'group'],
  );
});

test('単語帳が少ない場合、空き枠だけおすすめで補完される', () => {
  const tiles = buildHomeShortcutTiles({
    projects: [p('p1'), p('p2')],
    groups: [g('g1')],
    recommendations: [b('b1'), b('b2'), b('b3'), b('b4'), b('b5')],
    slots: 7,
  });

  assert.deepEqual(
    tiles.map((tile) => tile.kind),
    ['project', 'project', 'group', 'recommendation', 'recommendation', 'recommendation', 'recommendation'],
  );
});

test('単語帳が枠を超える場合、枠数で切り詰められる', () => {
  const tiles = buildHomeShortcutTiles({
    projects: Array.from({ length: 10 }, (_, i) => p(`p${i}`)),
    groups: [g('g1')],
    recommendations: [b('b1')],
    slots: 7,
  });

  assert.equal(tiles.length, 7);
  assert.ok(tiles.every((tile) => tile.kind === 'project'));
});

test('コンテンツが無い新規ユーザーはおすすめのみになる', () => {
  const tiles = buildHomeShortcutTiles({
    projects: [],
    groups: [],
    recommendations: [b('b1'), b('b2')],
    slots: 7,
  });

  assert.deepEqual(
    tiles.map((tile) => tile.kind),
    ['recommendation', 'recommendation'],
  );
});

test('全て空なら空配列を返す', () => {
  const tiles = buildHomeShortcutTiles({ projects: [], groups: [], recommendations: [], slots: 7 });
  assert.deepEqual(tiles, []);
});
