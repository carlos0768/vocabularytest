import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SCRUB_VISIBLE_DOTS,
  getScrubDots,
  getScrubIndexFromRatio,
  getScrubRatioFromPosition,
  getScrubTick,
} from '@/lib/quiz/flashcard-scrubber';

/** 点の並びを "・" (normal) / "●" (active) / "." (edge) の文字列にして見比べる */
function shape(total: number, currentIndex: number): string {
  return getScrubDots(total, currentIndex)
    .map((dot) => (dot.kind === 'active' ? '●' : dot.kind === 'edge' ? '.' : '・'))
    .join('');
}

test('カードが5枚以下なら全部の点を出す', () => {
  assert.deepEqual(
    getScrubDots(3, 1),
    [
      { index: 0, kind: 'normal' },
      { index: 1, kind: 'active' },
      { index: 2, kind: 'normal' },
    ],
  );
});

test('カードが何枚あっても点は5個まで', () => {
  for (const total of [6, 40, 500]) {
    assert.equal(getScrubDots(total, 10).length, SCRUB_VISIBLE_DOTS);
  }
});

test('省略した側の端の点だけ小さくする', () => {
  // 山札の真ん中: 左右どちらにも続きがあるので両端が小さい点
  assert.equal(shape(100, 50), '.・●・.');
  // 先頭付近: 左には続きがないので左端は普通の点のまま
  assert.equal(shape(100, 0), '●・・・.');
  assert.equal(shape(100, 1), '・●・・.');
  // 末尾付近: 右には続きがないので右端は普通の点のまま
  assert.equal(shape(100, 99), '.・・・●');
  assert.equal(shape(100, 98), '.・・●・');
});

test('5枚ちょうどのときはどこにいても端を小さくしない', () => {
  assert.equal(shape(5, 0), '●・・・・');
  assert.equal(shape(5, 2), '・・●・・');
  assert.equal(shape(5, 4), '・・・・●');
});

test('窓は現在地を中心に置き、端では止まる', () => {
  assert.deepEqual(getScrubDots(100, 50).map((d) => d.index), [48, 49, 50, 51, 52]);
  assert.deepEqual(getScrubDots(100, 0).map((d) => d.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(getScrubDots(100, 99).map((d) => d.index), [95, 96, 97, 98, 99]);
});

test('必ずどれか1つだけが active', () => {
  for (const current of [0, 1, 7, 63, 98, 99]) {
    const actives = getScrubDots(100, current).filter((d) => d.kind === 'active');
    assert.equal(actives.length, 1);
    assert.equal(actives[0].index, current);
  }
});

test('範囲外のカード番号は端に丸める', () => {
  assert.deepEqual(getScrubDots(100, -5).map((d) => d.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(getScrubDots(100, 999).map((d) => d.index), [95, 96, 97, 98, 99]);
});

test('空の山札では点を描かない', () => {
  assert.deepEqual(getScrubDots(0, 0), []);
  assert.deepEqual(getScrubDots(-3, 0), []);
});

test('ストリップの左端で1枚目、右端で最後の1枚', () => {
  assert.equal(getScrubIndexFromRatio(0, 80), 0);
  assert.equal(getScrubIndexFromRatio(1, 80), 79);
});

test('ストリップの中央は真ん中のカード', () => {
  assert.equal(getScrubIndexFromRatio(0.5, 101), 50);
});

test('はみ出した位置は端のカードで止める', () => {
  assert.equal(getScrubIndexFromRatio(-2, 40), 0);
  assert.equal(getScrubIndexFromRatio(4, 40), 39);
});

test('空の山札では0を返す', () => {
  assert.equal(getScrubIndexFromRatio(0.5, 0), 0);
});

test('矩形の左端が0、右端が1', () => {
  assert.equal(getScrubRatioFromPosition(20, 20, 200), 0);
  assert.equal(getScrubRatioFromPosition(220, 20, 200), 1);
  assert.equal(getScrubRatioFromPosition(120, 20, 200), 0.5);
});

test('矩形の外へ指が出ても0..1に収める', () => {
  assert.equal(getScrubRatioFromPosition(-100, 20, 200), 0);
  assert.equal(getScrubRatioFromPosition(9999, 20, 200), 1);
});

test('幅が取れないうちは左端扱い', () => {
  assert.equal(getScrubRatioFromPosition(50, 0, 0), 0);
});

test('振動の刻みは端から端まででも決まった回数しか変わらない', () => {
  const total = 500;
  const ticks = new Set<number>();
  for (let i = 0; i < total; i += 1) ticks.add(getScrubTick(i, total));
  assert.equal(ticks.size, 21); // 0..20
  assert.equal(getScrubTick(0, total), 0);
  assert.equal(getScrubTick(total - 1, total), 20);
});

test('カードが1枚しかなければ刻みは動かない', () => {
  assert.equal(getScrubTick(0, 1), 0);
});
