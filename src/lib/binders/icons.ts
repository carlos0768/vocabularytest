'use client';

/**
 * バインダー（フォルダ）アイコンのクライアント側アクセス。
 *
 * バインダーはホームとバインダー詳細の2箇所で描かれるので、取得結果はモジュール
 * キャッシュに載せて画面遷移のたびに引き直さない。設定変更時はキャッシュも同時に
 * 更新するため、戻った先のタイルがすぐ新しい画像になる。
 */

export type BinderIconMap = Record<string, string>;

let cache: BinderIconMap | null = null;
let inflight: Promise<BinderIconMap> | null = null;

export function getCachedBinderIcons(): BinderIconMap | null {
  return cache;
}

export async function loadBinderIcons(options: { force?: boolean } = {}): Promise<BinderIconMap> {
  if (!options.force && cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch('/api/binders/icons', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        icons?: Array<{ name: string; iconImage: string | null }>;
      } | null;

      if (!response.ok || !payload?.success) return cache ?? {};

      const map: BinderIconMap = {};
      for (const icon of payload.icons ?? []) {
        if (icon.name && icon.iconImage) map[icon.name] = icon.iconImage;
      }
      cache = map;
      return map;
    } catch {
      // アイコンは飾りなので、失敗しても既知の分だけで描き続ける。
      return cache ?? {};
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** アイコンを設定/削除する。成功したらキャッシュにも反映する。 */
export async function saveBinderIcon(name: string, iconImage: string | null): Promise<void> {
  const response = await fetch('/api/binders/icons', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, iconImage }),
  });
  const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'アイコンの保存に失敗しました');
  }

  const next: BinderIconMap = { ...(cache ?? {}) };
  if (iconImage) next[name] = iconImage;
  else delete next[name];
  cache = next;
}
