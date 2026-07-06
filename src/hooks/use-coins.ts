'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { ExtractMode } from '@/lib/scan/mode-provider';

export interface CoinBalanceState {
  monthlyRemaining: number;
  purchasedRemaining: number;
  totalRemaining: number;
}

export interface CoinPackSummary {
  id: string;
  name: string;
  coins: number;
  price: number;
}

export interface CoinsState {
  // null = 未取得。enabled:false はサーバー側でコイン制がオフ
  enabled: boolean | null;
  loading: boolean;
  isPro: boolean;
  balance: CoinBalanceState;
  monthlyAllowance: number;
  monthKey: string | null;
  rates: {
    modes: Partial<Record<ExtractMode, number>>;
    extraImageCost: number;
  };
  packs: CoinPackSummary[];
}

const EMPTY_BALANCE: CoinBalanceState = {
  monthlyRemaining: 0,
  purchasedRemaining: 0,
  totalRemaining: 0,
};

// use-auth と同じグローバルシングルトン+リスナーパターン（SWR不使用）
let globalCoinsState: CoinsState = {
  enabled: null,
  loading: false,
  isPro: false,
  balance: EMPTY_BALANCE,
  monthlyAllowance: 300,
  monthKey: null,
  rates: { modes: {}, extraImageCost: 1 },
  packs: [],
};

const listeners = new Set<(state: CoinsState) => void>();
let inflight: Promise<void> | null = null;

function notifyListeners() {
  listeners.forEach((listener) => listener(globalCoinsState));
}

function setState(patch: Partial<CoinsState>) {
  globalCoinsState = { ...globalCoinsState, ...patch };
  notifyListeners();
}

async function fetchCoins(): Promise<void> {
  setState({ loading: true });
  try {
    const response = await fetch('/api/coins/me', { cache: 'no-store' });
    if (!response.ok) {
      // 未ログイン等。enabled 判定は保留のまま
      setState({ loading: false });
      return;
    }
    const data = await response.json();
    if (data?.enabled === false) {
      setState({ enabled: false, loading: false });
      return;
    }
    setState({
      enabled: true,
      loading: false,
      isPro: Boolean(data.isPro),
      balance: {
        monthlyRemaining: data.balance?.monthlyRemaining ?? 0,
        purchasedRemaining: data.balance?.purchasedRemaining ?? 0,
        totalRemaining: data.balance?.totalRemaining ?? 0,
      },
      monthlyAllowance: data.monthlyAllowance ?? 300,
      monthKey: data.monthKey ?? null,
      rates: {
        modes: data.rates?.modes ?? {},
        extraImageCost: data.rates?.extraImageCost ?? 1,
      },
      packs: Array.isArray(data.packs) ? data.packs : [],
    });
  } catch (error) {
    console.warn('[coins] failed to fetch balance:', error);
    setState({ loading: false });
  }
}

// フック外（スキャン完了後・購入成功ページ等）からも呼べる再取得関数
export async function refreshCoins(): Promise<void> {
  if (!inflight) {
    inflight = fetchCoins().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function useCoins() {
  const { isAuthenticated } = useAuth();
  const [state, setLocalState] = useState<CoinsState>(globalCoinsState);

  useEffect(() => {
    const listener = (next: CoinsState) => setLocalState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && globalCoinsState.enabled === null && !globalCoinsState.loading) {
      void refreshCoins();
    }
  }, [isAuthenticated]);

  return {
    ...state,
    refresh: refreshCoins,
  };
}
