import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_SHORTCUT_RECENT_WINDOW_MS,
  buildHomeShortcutTiles,
  homeShortcutContentSlots,
  selectHomeShortcutProjects,
} from './shortcut-tiles';

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

test('コンテンツ枠数は固定タイルを除いた残り', () => {
  // モバイルのホームは固定タイル無し → 8枠すべてコンテンツ
  assert.equal(homeShortcutContentSlots(0), 8);
  // デスクトップは goal 1枠、保存済みタイル表示時はさらに1枠減る
  assert.equal(homeShortcutContentSlots(1), 7);
  assert.equal(homeShortcutContentSlots(2), 6);
  assert.equal(homeShortcutContentSlots(99), 0);
});

test('溢れた単語帳の計算がグリッドの表示数と一致する', () => {
  // ホーム側は min(単語帳数, 枠数) をグリッド掲載数として溢れを求める。
  // グリッド本体（buildHomeShortcutTiles）の project タイル数と一致すること。
  const projects = Array.from({ length: 10 }, (_, i) => p(`p${i}`));
  const slots = homeShortcutContentSlots(0);
  const tiles = buildHomeShortcutTiles({ projects, groups: [], recommendations: [], slots });
  const gridProjectCount = Math.min(projects.length, slots);
  assert.equal(tiles.filter((tile) => tile.kind === 'project').length, gridProjectCount);
});

const NOW = new Date('2026-10-02T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;
const proj = (id: string, binder: string | null = null, lastUsedAt: string | null = null) => ({
  id,
  binder,
  lastUsedAt,
});

test('バインダー内の単語帳は、直近使っていればグリッド候補に入る', () => {
  const selected = selectHomeShortcutProjects(
    [proj('a'), proj('inBinder', '英検', ago(HOUR)), proj('b')],
    NOW,
  );
  assert.deepEqual(selected.map((p) => p.id), ['inBinder', 'a', 'b']);
});

test('バインダー内でも直近使っていなければ候補に入らない', () => {
  const selected = selectHomeShortcutProjects(
    [
      proj('a'),
      proj('neverUsed', '英検'),
      proj('oldUse', '英検', ago(HOME_SHORTCUT_RECENT_WINDOW_MS + HOUR)),
      proj('blankBinder', '  ', null),
    ],
    NOW,
  );
  // 空白だけのバインダー名は未分類あつかい（ホームの unfiled 判定と同じ）
  assert.deepEqual(selected.map((p) => p.id), ['a', 'blankBinder']);
});

test('直近使った単語帳は新しい順に先頭、残りは元の並びのまま', () => {
  const selected = selectHomeShortcutProjects(
    [
      proj('a'),
      proj('usedOld', null, ago(48 * HOUR)),
      proj('b'),
      proj('binderNew', 'X', ago(HOUR)),
      proj('oldUnfiled', null, ago(HOME_SHORTCUT_RECENT_WINDOW_MS * 2)),
    ],
    NOW,
  );
  assert.deepEqual(selected.map((p) => p.id), ['binderNew', 'usedOld', 'a', 'b', 'oldUnfiled']);
});

test('バインダー外の単語帳が枠を超えていても、直近使ったバインダー内の単語帳はグリッドに載る', () => {
  const unfiled = Array.from({ length: 10 }, (_, i) => proj(`p${i}`));
  const selected = selectHomeShortcutProjects([...unfiled, proj('inBinder', 'B', ago(HOUR))], NOW);
  const tiles = buildHomeShortcutTiles({
    projects: selected,
    groups: [],
    recommendations: [],
    slots: homeShortcutContentSlots(0),
  });
  assert.equal(tiles[0].kind, 'project');
  assert.equal(tiles[0].kind === 'project' && tiles[0].project.id, 'inBinder');
});

test('不正な lastUsedAt は未使用あつかい', () => {
  const selected = selectHomeShortcutProjects([proj('bad', 'B', 'not-a-date'), proj('a')], NOW);
  assert.deepEqual(selected.map((p) => p.id), ['a']);
});
