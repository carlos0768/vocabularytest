/**
 * レイアウトモードのクライアント側ストア。`useLayoutMode()` の裏側。
 *
 * 初回描画前の判定は `<head>` のブートストラップ (layout-mode-script.tsx) が
 * `<html>` に書いている。ここは同じ `resolveLayoutMode` で値を持ち直し、
 * リサイズ・回転・入力装置の変化で再計算して属性を更新する。
 * 購読者が 1 人以上いる間だけイベントを聞く。
 */

import {
  LAYOUT_MODE_ATTR,
  LAYOUT_OVERRIDE_STORAGE_KEY,
  TABLET_SIZE_ATTR,
  parseLayoutOverride,
  resolveLayoutMode,
  type LayoutSnapshot,
} from './layout-mode';

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
const SERVER_SNAPSHOT: LayoutSnapshot = { mode: 'phone', tabletSize: null };

const listeners = new Set<() => void>();
let current: LayoutSnapshot | null = null;
let detach: (() => void) | null = null;

function isIPadOS(): boolean {
  const n = navigator;
  const platform = n.platform || '';
  return (platform === 'MacIntel' && (n.maxTouchPoints || 0) > 1) || /iPad/.test(n.userAgent || '');
}

function readOverride(): LayoutSnapshot | null {
  if (process.env.NODE_ENV === 'production') return null;
  try {
    return parseLayoutOverride(localStorage.getItem(LAYOUT_OVERRIDE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function compute(): LayoutSnapshot {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  const override = readOverride();
  if (override) return override;
  return resolveLayoutMode({
    width: window.innerWidth,
    height: window.innerHeight,
    hoverCapable: typeof window.matchMedia === 'function' ? window.matchMedia(HOVER_QUERY).matches : false,
    isIPadOS: isIPadOS(),
  });
}

function applyToDocument(snapshot: LayoutSnapshot) {
  const root = document.documentElement;
  root.setAttribute(LAYOUT_MODE_ATTR, snapshot.mode);
  if (snapshot.tabletSize) root.setAttribute(TABLET_SIZE_ATTR, snapshot.tabletSize);
  else root.removeAttribute(TABLET_SIZE_ATTR);
}

function update() {
  const next = compute();
  if (current && current.mode === next.mode && current.tabletSize === next.tabletSize) return;
  current = next;
  applyToDocument(next);
  listeners.forEach((cb) => cb());
}

function attach() {
  if (typeof window === 'undefined') return;
  const onChange = () => update();
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia(HOVER_QUERY) : null;
  mql?.addEventListener('change', onChange);
  detach = () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    mql?.removeEventListener('change', onChange);
    detach = null;
  };
  update();
}

export function subscribeLayoutMode(callback: () => void): () => void {
  listeners.add(callback);
  if (listeners.size === 1) attach();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) detach?.();
  };
}

export function getLayoutModeSnapshot(): LayoutSnapshot {
  if (!current) {
    current = compute();
    if (typeof document !== 'undefined') applyToDocument(current);
  }
  return current;
}

export function getServerLayoutModeSnapshot(): LayoutSnapshot {
  return SERVER_SNAPSHOT;
}
