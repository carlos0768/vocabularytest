'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { refreshCoins } from '@/hooks/use-coins';

type VerificationState = 'verifying' | 'confirmed' | 'delayed';

function CoinSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState<VerificationState>('verifying');

  useEffect(() => {
    let cancelled = false;

    const confirm = async () => {
      if (!sessionId) {
        setState('delayed');
        return;
      }

      try {
        const response = await fetch(
          `/api/coins/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store' }
        );
        const result = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.ok && result?.success && (result.credited || result.alreadyCredited)) {
          await refreshCoins();
          setState('confirmed');
          return;
        }
      } catch {
        // fall through to delayed
      }

      if (!cancelled) {
        // Webhook側での反映待ち。残高を再取得しつつ「反映中」を表示する
        await refreshCoins();
        setState('delayed');
      }
    };

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] border-b-4 p-8 text-center space-y-4">
        {state === 'verifying' && (
          <>
            <Icon name="hourglass_top" size={40} className="mx-auto text-[var(--color-muted)]" />
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">コインを反映しています...</h1>
          </>
        )}
        {state === 'confirmed' && (
          <>
            <Icon name="check_circle" size={40} className="mx-auto text-[var(--color-success)]" />
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">購入ありがとうございます</h1>
            <p className="text-sm text-[var(--color-muted)]">コインが残高に追加されました。</p>
          </>
        )}
        {state === 'delayed' && (
          <>
            <Icon name="schedule" size={40} className="mx-auto text-[var(--color-muted)]" />
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">購入を受け付けました</h1>
            <p className="text-sm text-[var(--color-muted)]">
              反映まで少し時間がかかる場合があります。残高に反映されない場合は、しばらくしてからコインページを確認してください。
            </p>
          </>
        )}
        <div className="flex flex-col gap-2 pt-2">
          <Link href="/coins">
            <Button className="w-full">コイン残高を見る</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="w-full">ホームへ戻る</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CoinSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CoinSuccessContent />
    </Suspense>
  );
}
