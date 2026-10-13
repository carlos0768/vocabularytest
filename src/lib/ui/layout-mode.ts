/**
 * レイアウトモード (phone / tablet / desktop) の決め方。ここが唯一の判定箇所。
 *
 * 幅だけでは iPad 横 (1024–1366px) と PC を区別できないので、幅・短辺・hover 可否・
 * iPadOS かどうかを合わせて決める。結果は `<html data-layout data-tablet-size>` に
 * 書き、Tailwind の `desktop:` / `tablet:` / `tablet-compact:` / `tablet-regular:`
 * バリアント (globals.css) と `useLayoutMode()` が同じ値を読む。
 *
 * - phone:   幅 744px 未満、または短辺 600px 未満 (横向きの iPhone を tablet にしない)
 * - desktop: 幅 1024px 以上で hover が使えて、iPadOS でない
 * - tablet:  それ以外。幅 1024px 以上なら regular (横向き)、未満なら compact (縦向き)
 *
 * 判定の文字列版 (`layoutModeBootstrapScript`) は `<head>` で初回描画の前に走る。
 * `resolveLayoutMode` とズレないことは layout-mode.test.ts が固定している。
 */

export type LayoutMode = 'phone' | 'tablet' | 'desktop';
export type TabletSize = 'compact' | 'regular';

export type LayoutSnapshot = {
  mode: LayoutMode;
  /** mode が tablet のときだけ値を持つ */
  tabletSize: TabletSize | null;
};

export type LayoutInput = {
  width: number;
  height: number;
  /** `(hover: hover) and (pointer: fine)` が真か (マウス / トラックパッドがある) */
  hoverCapable: boolean;
  /** iPadOS の Safari か (デスクトップ UA を名乗るので別に見る) */
  isIPadOS: boolean;
};

/** これ未満の幅はスマホ。iPad mini の縦が 744px */
export const PHONE_MAX_WIDTH = 744;
/** 短辺がこれ未満なら向きに関係なくスマホ (iPhone 横向きは 430px 前後) */
export const PHONE_MAX_SHORT_SIDE = 600;
/** これ以上の幅で hover が使えれば PC。タブレットでは compact / regular の境目 */
export const DESKTOP_MIN_WIDTH = 1024;

export const LAYOUT_MODE_ATTR = 'data-layout';
export const TABLET_SIZE_ATTR = 'data-tablet-size';

/** 開発時に判定を固定するための localStorage キー (本番ビルドでは読まない) */
export const LAYOUT_OVERRIDE_STORAGE_KEY = 'merken_layout_override';

/**
 * タブレットのサイドバーを格納しているか。横向きでもアイコンのレールに畳む。
 * 値は localStorage に持ち、<html data-tablet-sidebar="collapsed"> で CSS に伝える
 * (tablet.css)。ブートストラップでも読むので初回描画から畳んだ状態で出る。
 */
export const TABLET_SIDEBAR_STORAGE_KEY = 'merken_tablet_sidebar';
export const TABLET_SIDEBAR_ATTR = 'data-tablet-sidebar';
export const TABLET_SIDEBAR_COLLAPSED = 'collapsed';

export function resolveLayoutMode(input: LayoutInput): LayoutSnapshot {
  const { width, height, hoverCapable, isIPadOS } = input;
  const shortSide = Math.min(width, height);
  if (width < PHONE_MAX_WIDTH || shortSide < PHONE_MAX_SHORT_SIDE) {
    return { mode: 'phone', tabletSize: null };
  }
  if (width >= DESKTOP_MIN_WIDTH && hoverCapable && !isIPadOS) {
    return { mode: 'desktop', tabletSize: null };
  }
  return { mode: 'tablet', tabletSize: width >= DESKTOP_MIN_WIDTH ? 'regular' : 'compact' };
}

export function isLayoutMode(value: unknown): value is LayoutMode {
  return value === 'phone' || value === 'tablet' || value === 'desktop';
}

/**
 * 判定を上書き指定に合わせる。`phone` / `desktop` / `tablet` (幅で compact/regular) /
 * `tablet-compact` / `tablet-regular` を受け付け、それ以外は null。
 */
export function parseLayoutOverride(raw: string | null | undefined): LayoutSnapshot | null {
  switch (raw) {
    case 'phone':
      return { mode: 'phone', tabletSize: null };
    case 'desktop':
      return { mode: 'desktop', tabletSize: null };
    case 'tablet-compact':
      return { mode: 'tablet', tabletSize: 'compact' };
    case 'tablet-regular':
      return { mode: 'tablet', tabletSize: 'regular' };
    default:
      return null;
  }
}

/**
 * `<head>` で同期実行するブートストラップ。バンドルより先に動くので文字列で持つ。
 * `allowOverride` は開発時だけ true にして localStorage の上書きを読む。
 */
export function layoutModeBootstrapScript(allowOverride: boolean): string {
  const override = allowOverride
    ? `var o=null;try{o=localStorage.getItem(${JSON.stringify(LAYOUT_OVERRIDE_STORAGE_KEY)});}catch(e){}
if(o==='phone'){m='phone';s=null;}else if(o==='desktop'){m='desktop';s=null;}
else if(o==='tablet-compact'){m='tablet';s='compact';}else if(o==='tablet-regular'){m='tablet';s='regular';}`
    : '';
  return `(function(){try{
var w=window.innerWidth,h=window.innerHeight;
var hv=window.matchMedia('(hover: hover) and (pointer: fine)').matches;
var n=navigator,p=n.platform||'';
var ipad=(p==='MacIntel'&&(n.maxTouchPoints||0)>1)||/iPad/.test(n.userAgent||'');
var m,s=null;
if(w<${PHONE_MAX_WIDTH}||Math.min(w,h)<${PHONE_MAX_SHORT_SIDE}){m='phone';}
else if(w>=${DESKTOP_MIN_WIDTH}&&hv&&!ipad){m='desktop';}
else{m='tablet';s=w>=${DESKTOP_MIN_WIDTH}?'regular':'compact';}
${override}
var r=document.documentElement;
r.setAttribute(${JSON.stringify(LAYOUT_MODE_ATTR)},m);
if(s){r.setAttribute(${JSON.stringify(TABLET_SIZE_ATTR)},s);}else{r.removeAttribute(${JSON.stringify(TABLET_SIZE_ATTR)});}
try{if(localStorage.getItem(${JSON.stringify(TABLET_SIDEBAR_STORAGE_KEY)})===${JSON.stringify(TABLET_SIDEBAR_COLLAPSED)}){r.setAttribute(${JSON.stringify(TABLET_SIDEBAR_ATTR)},${JSON.stringify(TABLET_SIDEBAR_COLLAPSED)});}}catch(e){}
}catch(e){}})();`;
}
