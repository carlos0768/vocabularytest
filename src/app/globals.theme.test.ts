import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`^${escaped} \\{\\n(.*?)^\\}`, 'ms'));
  assert.ok(match, `${selector} ブロックが globals.css に見つからない`);
  return match![1];
}

function tokensOf(selector: string): Map<string, string> {
  const entries = [...block(selector).matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)];
  return new Map(entries.map(([, name, value]) => [name, value.trim()]));
}

const rootTokens = tokensOf(':root');
const darkTokens = tokensOf('.dark');
const forceLightTokens = tokensOf('.force-light');

test('.dark が上書きするトークンはすべて :root にライト値がある', () => {
  // :root に無い変数を .dark だけで定義すると、ライトでは undefined になる。
  for (const name of darkTokens.keys()) {
    assert.ok(rootTokens.has(name), `${name} が :root に無い`);
  }
});

test('.force-light は .dark と同じトークン集合を打ち消す', () => {
  // 取りこぼすと、ライト固定したはずのLPでその変数だけダーク値が残る。
  const missing = [...darkTokens.keys()].filter((name) => !forceLightTokens.has(name));
  assert.deepEqual(missing, [], `.force-light に不足: ${missing.join(', ')}`);

  const extra = [...forceLightTokens.keys()].filter((name) => !darkTokens.has(name));
  assert.deepEqual(extra, [], `.dark が上書きしないのに戻している: ${extra.join(', ')}`);
});

test('.force-light の値は :root のライト値と一致する', () => {
  for (const [name, value] of forceLightTokens) {
    assert.equal(value, rootTokens.get(name), `${name} の値が :root とずれている`);
  }
});

test('前景と背景がダークで入れ替わっている', () => {
  // ここが片方だけだと「白地に白文字」になる。
  assert.notEqual(darkTokens.get('--color-background'), rootTokens.get('--color-background'));
  assert.notEqual(darkTokens.get('--color-foreground'), rootTokens.get('--color-foreground'));
  assert.notEqual(darkTokens.get('--color-ink'), rootTokens.get('--color-ink'));
  assert.notEqual(darkTokens.get('--solid-ink'), rootTokens.get('--solid-ink'));
  // ink 面に乗せる文字色も反転していること
  assert.equal(rootTokens.get('--color-on-ink'), '#ffffff');
  assert.notEqual(darkTokens.get('--color-on-ink'), '#ffffff');
});

test('THEME_COLOR と --color-background が一致する', async () => {
  const { THEME_COLOR } = await import('@/lib/theme');
  assert.equal(rootTokens.get('--color-background'), THEME_COLOR.light);
  assert.equal(darkTokens.get('--color-background'), THEME_COLOR.dark);
});

test('反転する塗りの上の text-white を打ち消す規則がある', () => {
  // これが無いと bg-[var(--solid-ink)] text-white のボタンが
  // ダークで白地に白文字になる（190箇所以上ある）。
  const rule = CSS.match(/\.dark\s*\n?\s*:is\((.*?)\)\.text-white \{\s*color: var\(--color-on-ink\);/s);
  assert.ok(rule, 'text-white の反転打ち消し規則が見つからない');
  for (const token of ['--solid-ink', '--color-foreground', '--color-primary', '--color-accent']) {
    assert.ok(rule![1].includes(token), `${token} が打ち消し対象に入っていない`);
  }
});
