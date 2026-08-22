import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THEME,
  THEME_COLOR,
  THEME_INIT_SCRIPT,
  THEME_LABELS,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  isTheme,
  normalizeTheme,
  resolveTheme,
} from './theme';

test('resolveTheme: 明示指定は OS 設定を無視する', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('resolveTheme: system のときだけ OS 設定に追従する', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('normalizeTheme: 壊れた保存値は既定値に落とす', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('system'), 'system');
  assert.equal(normalizeTheme(null), DEFAULT_THEME);
  assert.equal(normalizeTheme(undefined), DEFAULT_THEME);
  assert.equal(normalizeTheme(''), DEFAULT_THEME);
  assert.equal(normalizeTheme('DARK'), DEFAULT_THEME);
  assert.equal(normalizeTheme(0), DEFAULT_THEME);
});

test('isTheme は 3 つの値だけを受け入れる', () => {
  assert.ok(isTheme('light'));
  assert.ok(isTheme('dark'));
  assert.ok(isTheme('system'));
  assert.equal(isTheme('auto'), false);
  assert.equal(isTheme(null), false);
});

test('既定はライト（ダークモードは opt-in）', () => {
  // OS がダークでも、ユーザが選ぶまでは暗くしない。
  assert.equal(DEFAULT_THEME, 'light');
  assert.equal(resolveTheme(DEFAULT_THEME, true), 'light');
});

test('UI の選択肢とラベルが揃っている', () => {
  assert.deepEqual(THEME_OPTIONS, ['light', 'dark', 'system']);
  for (const option of THEME_OPTIONS) {
    assert.ok(THEME_LABELS[option].length > 0, option);
  }
});

test('THEME_COLOR は globals.css の --color-background と一致する', () => {
  // ずれると PWA のステータスバーだけ前のテーマの色が残る。
  assert.equal(THEME_COLOR.light, '#f6f5f1');
  assert.equal(THEME_COLOR.dark, '#111418');
});

test('初期化スクリプトはハイドレーション前に dark クラスを当てる', () => {
  // ThemeProvider は useEffect でしかクラスを当てないので、
  // このスクリプトが無いとダーク設定のユーザに一瞬ライトが見える。
  assert.match(THEME_INIT_SCRIPT, /classList\.toggle\('dark'/);
  assert.match(THEME_INIT_SCRIPT, /prefers-color-scheme: dark/);
  assert.ok(THEME_INIT_SCRIPT.includes(THEME_STORAGE_KEY));
  assert.ok(THEME_INIT_SCRIPT.includes(`s='${DEFAULT_THEME}'`));
  // localStorage を触れない WebView でも落ちないこと
  assert.match(THEME_INIT_SCRIPT, /try\{/);
  assert.match(THEME_INIT_SCRIPT, /catch\(e\)\{\}/);
  // </script> でタグを閉じてしまわないこと
  assert.equal(THEME_INIT_SCRIPT.includes('</'), false);
});

test('初期化スクリプトが実際に dark クラスを付け外しする', () => {
  const run = (stored: string | null, systemDark: boolean) => {
    const classes = new Set<string>();
    const root = {
      classList: {
        toggle: (name: string, on: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
      style: { colorScheme: '' },
    };
    const scope = {
      localStorage: { getItem: () => stored },
      window: { matchMedia: () => ({ matches: systemDark }) },
      document: { documentElement: root },
    };
    new Function(
      'localStorage',
      'window',
      'document',
      THEME_INIT_SCRIPT,
    )(scope.localStorage, scope.window, scope.document);
    return { dark: classes.has('dark'), colorScheme: root.style.colorScheme };
  };

  assert.deepEqual(run('dark', false), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(run('light', true), { dark: false, colorScheme: 'light' });
  assert.deepEqual(run('system', true), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(run('system', false), { dark: false, colorScheme: 'light' });
  // 未設定・不正値は既定（ライト）
  assert.deepEqual(run(null, true), { dark: false, colorScheme: 'light' });
  assert.deepEqual(run('nonsense', true), { dark: false, colorScheme: 'light' });
});
