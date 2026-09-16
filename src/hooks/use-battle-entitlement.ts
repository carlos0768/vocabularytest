'use client';

/**
 * 対戦の入場権（Pro は無制限 / Free は1日2回）をサーバーから読む。
 *
 * `useAuth().isPro` だけでは残数が分からないので、対戦の入り口はこのフックを
 * 見る。対戦から戻ったあとは残数が変わっているので `refresh()` で読み直す。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleAllowance } from '@/lib/battle/free-allowance';

export type UseBattleEntitlementResult = {
  allowance: BattleAllowance | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useBattleEntitlement(enabled = true): UseBattleEntitlementResult {
  const [allowance, setAllowance] = useState<BattleAllowance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch('/api/battle/entitlement', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!mountedRef.current) return;

      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? '対戦の利用状況を取得できませんでした。');
        return;
      }

      setAllowance(payload.allowance as BattleAllowance);
      setError(null);
    } catch {
      if (!mountedRef.current) return;
      setError('通信に失敗しました。');
    }
  }, [enabled]);

  useEffect(() => {
    // `refresh` は fetch を待ってから state に触るので、この effect は同期的に
    // state を変えない（lint はこの非同期の境目を見通せない）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // state ではなく導出にしている。`enabled` が後から true になる（認証の解決
  // 待ちなど）ケースで「読み込み済み扱い」のまま残数 null を見せてしまい、
  // 枠切れと区別がつかなくなるのを避けるため。
  const loading = enabled && allowance === null && error === null;

  return { allowance, loading, error, refresh };
}
