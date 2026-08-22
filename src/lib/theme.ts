/**
 * Theme (ライト / ダーク) の共有ロジック。
 *
 * テーマは 3 状態: 'light' | 'dark' | 'system'。'system' のときだけ OS の
 * prefers-color-scheme に追従する。実際に適用される色は resolveTheme() が返す
 * 'light' | 'dark' の 2 値で、これが <html> の `dark` クラスに対応する。
 *
 * このファイルは React に依存しない純粋なロジックだけを持つ。同じ判定を
 * ハイドレーション前のインラインスクリプト (THEME_INIT_SCRIPT) と
 * ThemeProvider の両方が使うので、片方だけ直すと初回描画で色がちらつく。
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** localStorage のキー。歴史的経緯で scanvocab_ 接頭辞のまま（既存ユーザの設定を捨てない）。 */
export const THEME_STORAGE_KEY = 'scanvocab_theme';

/**
 * 既定は 'light'。これまでダークモードの導線が無かったので、既存ユーザの見た目を
 * 勝手に変えないために opt-in にしている（'system' にすると OS がダークの人全員が
 * 何も操作していないのに暗くなる）。
 */
export const DEFAULT_THEME: Theme = 'light';

export const THEME_LABELS: Record<Theme, string> = {
  light: 'ライト',
  dark: 'ダーク',
  system: 'システム',
};

export const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];

/**
 * PWA のステータスバー色。--color-background と同じ値を使う。
 * globals.css 側を変えたらここも合わせる。
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f6f5f1',
  dark: '#111418',
};

/**
 * ログイン・新規登録まわりのページが敷く生成り色。
 * ライトの値は desktop.css の --color-auth-aside と揃えている。
 */
export const AUTH_PAGE_BACKGROUND = {
  light: '#f3f0e9',
  dark: '#161a1f',
} as const;

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** 保存値として妥当でなければ既定値に落とす。 */
export function normalizeTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** 'system' を OS 設定で解決して、実際に適用する 2 値にする。 */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return theme;
}

/**
 * ハイドレーション前に <head> で同期実行するスクリプト。
 *
 * ThemeProvider は useEffect でクラスを付けるので、これが無いとダーク設定の
 * ユーザに一瞬ライトの画面が出る（初回描画は必ずライトになる）。localStorage が
 * 使えない環境（Instagram の WebView 等）でも落ちないよう全体を try/catch する。
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem('${THEME_STORAGE_KEY}');
if(s!=='light'&&s!=='dark'&&s!=='system'){s='${DEFAULT_THEME}';}
var d=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;
r.classList.toggle('dark',d);
r.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;
