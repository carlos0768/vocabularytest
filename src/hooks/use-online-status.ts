// Hook to track online/offline status
'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  // Node 21+ にも global の navigator はあるが onLine は無い (undefined)。
  // boolean のときだけ信じ、それ以外はオンライン扱いにする。
  return typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
}

// サーバーは常にオンラインとして描く。以前は useState の初期値に navigator.onLine を
// 使っていたが、Node 22 では navigator が存在して onLine が undefined (= falsy) なので
// サーバーだけオフラインバナーを描き、全ページでハイドレーション不一致になっていた。
// 不一致で React がツリーを作り直すと <html data-layout> (レイアウトモード) まで消える。
function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
