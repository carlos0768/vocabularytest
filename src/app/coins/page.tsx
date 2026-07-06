'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useCoins } from '@/hooks/use-coins';

const MODE_LABELS: Record<string, string> = {
  circled: '丸囲みスキャン',
  all: '単語帳取込スキャン',
  eiken: '英検スキャン',
  idiom: '熟語・イディオムスキャン',
};

export default function CoinsPage() {
  const router = useRouter();
  const { isPro, loading: authLoading } = useAuth();
  const { enabled, loading, balance, monthlyAllowance, rates, packs, refresh } = useCoins();
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // コイン制がオフなら何も見せない
  useEffect(() => {
    if (enabled === false) {
      router.replace('/');
    }
  }, [enabled, router]);

  // フラグ状態が未取得の間は購入UIを出さない
  if (enabled === null) {
    return (
      <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </div>
    );
  }

  const handlePurchase = async (packId: string) => {
    setPurchasingPackId(packId);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/coins/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result.checkoutUrl) {
        throw new Error(result?.error ?? '決済ページへの遷移に失敗しました');
      }
      window.location.href = result.checkoutUrl as string;
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : '決済ページへの遷移に失敗しました');
      setPurchasingPackId(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)]">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="戻る"
          className="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="chevron_left" size={20} />
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">COINS</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">コイン</div>
      </div>

      <div className="space-y-4 px-[18px]">
        {/* 残高カード */}
        <div className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white p-4" style={{ boxShadow: '2.5px 2.5px 0 var(--solid-ink)' }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--solid-ink)]">
              <Icon name="toll" size={18} className="text-[var(--color-accent)]" />
              残りコイン
            </span>
            <span className="font-mono text-2xl font-black text-[var(--solid-ink)]">
              {loading && enabled === null ? '…' : balance.totalRemaining}
              <span className="ml-1 text-xs font-bold text-[var(--color-muted)]">枚</span>
            </span>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[var(--color-muted)]">
            <span>今月分 {balance.monthlyRemaining}枚 / 購入分 {balance.purchasedRemaining}枚</span>
          </div>
          <p className="mt-2 text-[10px] leading-[1.6] text-[var(--color-muted)]">
            Proプランには毎月{monthlyAllowance}枚が自動付与されます（毎月1日リセット・繰り越しなし）。購入したコインに有効期限はありません。
          </p>
        </div>

        {/* 消費レート表 */}
        <div className="rounded-[12px] border-2 border-[var(--color-border)] bg-white p-4">
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">消費コイン</div>
          <ul className="space-y-1.5">
            {Object.entries(rates.modes).map(([mode, cost]) => (
              <li key={mode} className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--solid-ink)]">{MODE_LABELS[mode] ?? mode}</span>
                <span className="font-mono font-bold text-[var(--solid-ink)]">{cost}枚</span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] pt-1.5 text-[12px]">
              <span className="text-[var(--solid-ink)]">2枚目以降の画像（1枚ごと）</span>
              <span className="font-mono font-bold text-[var(--solid-ink)]">+{rates.extraImageCost}枚</span>
            </li>
          </ul>
          <p className="mt-2 text-[10px] text-[var(--color-muted)]">複数モードを同時に選んだ場合は各モードの合計を消費します。</p>
        </div>

        {/* パック購入 */}
        <div className="rounded-[12px] border-2 border-[var(--color-border)] bg-white p-4">
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">コインを購入</div>
          {!authLoading && !isPro && (
            <p className="mb-2 text-[11px] text-[var(--color-error)]">コインの購入はProプラン限定です。</p>
          )}
          <div className="space-y-2.5">
            {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={!isPro || purchasingPackId !== null}
                onClick={() => void handlePurchase(pack.id)}
                className="flex w-full items-center justify-between rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-4 py-3 text-left transition-all active:translate-x-px active:translate-y-px disabled:opacity-40"
                style={{ boxShadow: '2px 2px 0 var(--solid-ink)' }}
              >
                <span className="flex items-center gap-2">
                  <Icon name="toll" size={18} className="text-[var(--color-accent)]" />
                  <span className="text-[13px] font-bold text-[var(--solid-ink)]">{pack.name}</span>
                </span>
                <span className="font-mono text-[13px] font-bold text-[var(--solid-ink)]">
                  {purchasingPackId === pack.id ? '処理中...' : `¥${pack.price.toLocaleString()}`}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-[1.6] text-[var(--color-muted)]">
            クレジットカード・PayPayで支払えます。決済は安全なStripeの決済ページで行われます。
          </p>
          {errorMsg && (
            <p className="mt-2 text-center text-[11px] text-[var(--color-error)]">{errorMsg}</p>
          )}
        </div>

        {!isPro && !authLoading && (
          <Button variant="secondary" className="w-full" onClick={() => router.push('/subscription')}>
            Proプランを見る
          </Button>
        )}
      </div>
    </div>
  );
}
