import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import {
  LAYOUT_MODE_ATTR,
  LAYOUT_OVERRIDE_STORAGE_KEY,
  TABLET_SIDEBAR_ATTR,
  TABLET_SIDEBAR_COLLAPSED,
  TABLET_SIDEBAR_STORAGE_KEY,
  TABLET_SIZE_ATTR,
  layoutModeBootstrapScript,
  parseLayoutOverride,
  resolveLayoutMode,
  type LayoutInput,
  type LayoutSnapshot,
} from './layout-mode';

type Case = { name: string; input: LayoutInput; expected: LayoutSnapshot };

const touch = { hoverCapable: false, isIPadOS: false };
const mouse = { hoverCapable: true, isIPadOS: false };

// 実機の CSS px。iPad は縦 / 横の両方を入れる
const CASES: Case[] = [
  { name: 'iPhone 15 縦', input: { width: 390, height: 844, ...touch }, expected: { mode: 'phone', tabletSize: null } },
  { name: 'iPhone 15 Pro Max 横 (幅はあるが短辺が低い)', input: { width: 932, height: 430, ...touch }, expected: { mode: 'phone', tabletSize: null } },
  { name: 'iPad mini 縦', input: { width: 744, height: 1133, ...touch }, expected: { mode: 'tablet', tabletSize: 'compact' } },
  { name: 'iPad Air 11" 縦', input: { width: 834, height: 1194, ...touch }, expected: { mode: 'tablet', tabletSize: 'compact' } },
  { name: 'iPad Pro 12.9" 縦 (1024px でも hover 無しなら tablet)', input: { width: 1024, height: 1366, ...touch }, expected: { mode: 'tablet', tabletSize: 'regular' } },
  { name: 'iPad Air 11" 横', input: { width: 1194, height: 834, ...touch }, expected: { mode: 'tablet', tabletSize: 'regular' } },
  { name: 'iPad Pro 12.9" 横', input: { width: 1366, height: 1024, ...touch }, expected: { mode: 'tablet', tabletSize: 'regular' } },
  { name: 'iPad + トラックパッド (hover が真でも iPadOS なら tablet)', input: { width: 1366, height: 1024, hoverCapable: true, isIPadOS: true }, expected: { mode: 'tablet', tabletSize: 'regular' } },
  { name: 'ノート PC', input: { width: 1280, height: 800, ...mouse }, expected: { mode: 'desktop', tabletSize: null } },
  { name: 'PC の狭いウィンドウ (1024 未満は hover があっても tablet)', input: { width: 900, height: 700, ...mouse }, expected: { mode: 'tablet', tabletSize: 'compact' } },
  { name: 'PC の極端に狭いウィンドウ', input: { width: 600, height: 900, ...mouse }, expected: { mode: 'phone', tabletSize: null } },
  { name: 'タッチ専用の大画面 (hover 無しは幅があっても tablet)', input: { width: 1920, height: 1080, ...touch }, expected: { mode: 'tablet', tabletSize: 'regular' } },
];

describe('resolveLayoutMode', () => {
  for (const c of CASES) {
    it(c.name, () => {
      assert.deepEqual(resolveLayoutMode(c.input), c.expected);
    });
  }
});

/**
 * ブートストラップ文字列を偽の window / document / navigator に対して実行し、
 * `<html>` に書かれた属性を返す。
 */
function runBootstrap(
  input: LayoutInput,
  options: { allowOverride?: boolean; override?: string | null; sidebar?: string | null } = {},
) {
  const attrs = new Map<string, string>();
  const documentElement = {
    setAttribute: (k: string, v: string) => { attrs.set(k, v); },
    removeAttribute: (k: string) => { attrs.delete(k); },
  };
  const sandbox = {
    window: {
      innerWidth: input.width,
      innerHeight: input.height,
      matchMedia: (q: string) => ({ matches: q.includes('hover') ? input.hoverCapable : false }),
    },
    document: { documentElement },
    navigator: input.isIPadOS
      ? { platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari' }
      : { platform: 'Win32', maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' },
    localStorage: {
      getItem: (k: string) => {
        if (k === LAYOUT_OVERRIDE_STORAGE_KEY) return options.override ?? null;
        if (k === TABLET_SIDEBAR_STORAGE_KEY) return options.sidebar ?? null;
        return null;
      },
    },
  };
  vm.runInNewContext(layoutModeBootstrapScript(options.allowOverride ?? false), sandbox);
  return {
    mode: attrs.get(LAYOUT_MODE_ATTR) ?? null,
    tabletSize: attrs.get(TABLET_SIZE_ATTR) ?? null,
    sidebar: attrs.get(TABLET_SIDEBAR_ATTR) ?? null,
  };
}

describe('layoutModeBootstrapScript', () => {
  for (const c of CASES) {
    it(`resolveLayoutMode と同じ結果を <html> に書く: ${c.name}`, () => {
      const { sidebar, ...result } = runBootstrap(c.input);
      assert.deepEqual(result, c.expected);
      assert.equal(sidebar, null);
    });
  }

  it('サイドバーを格納していれば data-tablet-sidebar="collapsed" も初回描画前に付ける', () => {
    const r = runBootstrap({ width: 1194, height: 834, ...touch }, { sidebar: TABLET_SIDEBAR_COLLAPSED });
    assert.equal(r.sidebar, TABLET_SIDEBAR_COLLAPSED);
    assert.equal(r.mode, 'tablet');
    const r2 = runBootstrap({ width: 1194, height: 834, ...touch }, { sidebar: 'open' });
    assert.equal(r2.sidebar, null);
  });

  it('本番 (allowOverride=false) では localStorage の上書きを読まない', () => {
    const r = runBootstrap({ width: 1280, height: 800, ...mouse }, { allowOverride: false, override: 'tablet-compact' });
    assert.deepEqual(r, { mode: 'desktop', tabletSize: null, sidebar: null });
  });

  it('開発 (allowOverride=true) では localStorage の上書きが勝つ', () => {
    const r = runBootstrap({ width: 1280, height: 800, ...mouse }, { allowOverride: true, override: 'tablet-compact' });
    assert.deepEqual(r, { mode: 'tablet', tabletSize: 'compact', sidebar: null });
    const r2 = runBootstrap({ width: 390, height: 844, ...touch }, { allowOverride: true, override: 'desktop' });
    assert.deepEqual(r2, { mode: 'desktop', tabletSize: null, sidebar: null });
  });

  it('不正な上書き値は無視する', () => {
    const r = runBootstrap({ width: 834, height: 1194, ...touch }, { allowOverride: true, override: 'tv' });
    assert.deepEqual(r, { mode: 'tablet', tabletSize: 'compact', sidebar: null });
  });

  it('例外が起きても何も投げない (try/catch で包んでいる)', () => {
    assert.doesNotThrow(() => vm.runInNewContext(layoutModeBootstrapScript(false), {}));
  });
});

describe('parseLayoutOverride', () => {
  it('ブートストラップと同じ 4 値を受け付ける', () => {
    assert.deepEqual(parseLayoutOverride('phone'), { mode: 'phone', tabletSize: null });
    assert.deepEqual(parseLayoutOverride('desktop'), { mode: 'desktop', tabletSize: null });
    assert.deepEqual(parseLayoutOverride('tablet-compact'), { mode: 'tablet', tabletSize: 'compact' });
    assert.deepEqual(parseLayoutOverride('tablet-regular'), { mode: 'tablet', tabletSize: 'regular' });
    assert.equal(parseLayoutOverride('tablet'), null);
    assert.equal(parseLayoutOverride(null), null);
  });
});
