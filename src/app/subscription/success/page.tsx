'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20;

type VerificationState = 'verifying' | 'confirmed' | 'delayed' | 'failed';

function SuccessContent() {
  const { refresh } = useAuth();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState<VerificationState>('verifying');
  const [attempt, setAttempt] = useState(0);
  const [pollToken, setPollToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const isBillingConfirmed = (subscription: {
      isActivePro?: boolean;
      proSource?: string;
    } | undefined): boolean => {
      return Boolean(subscription?.isActivePro && subscription.proSource === 'billing');
    };

    const verifySubscription = async (): Promise<'confirmed' | 'pending' | 'failed'> => {
      const meResponse = await fetch('/api/subscription/me', { cache: 'no-store' });
      if (meResponse.ok) {
        const meResult = await meResponse.json();
        if (isBillingConfirmed(meResult?.subscription)) {
          return 'confirmed';
        }
      }

      if (!sessionId) {
        return 'pending';
      }

      const reconcileResponse = await fetch(
        `/api/subscription/reconcile?session_id=${encodeURIComponent(sessionId)}`,
        { cache: 'no-store' }
      );

      if (!reconcileResponse.ok) {
        if (reconcileResponse.status >= 400 && reconcileResponse.status < 500) {
          return 'failed';
        }
        return 'pending';
      }

      const reconcileResult = await reconcileResponse.json();
      if (reconcileResult?.state === 'confirmed') {
        return 'confirmed';
      }
      if (reconcileResult?.state === 'failed') {
        return 'failed';
      }
      return 'pending';
    };

    const verifyWithPolling = async () => {
      for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
        if (cancelled) {
          return;
        }

        setAttempt(i);

        const result = await verifySubscription();
        if (result === 'confirmed') {
          await refresh();
          if (cancelled) {
            return;
          }
          setState('confirmed');
          return;
        }

        if (result === 'failed') {
          setState('failed');
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (!cancelled) {
        setState('delayed');
      }
    };

    verifyWithPolling().catch(async () => {
      if (!cancelled) {
        try {
          await refresh();
        } catch {
          // Ignore refresh failure in fallback path.
        }
        setState('failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pollToken, refresh, sessionId]);

  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
        <p className="text-[var(--color-muted)] text-sm">決済を確認中... ({attempt}/{MAX_ATTEMPTS})</p>
      </div>
    );
  }

  if (state === 'delayed' || state === 'failed') {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-[var(--color-warning-light)] rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon name="hourglass_top" size={32} className="text-[var(--color-warning)]" />
        </div>

        <h1 className="text-xl font-semibold text-[var(--color-foreground)] mb-2">
          決済反映を待っています
        </h1>

        <p className="text-[var(--color-muted)] text-sm mb-8">
          Webhookの反映に時間がかかっている可能性があります。
          <br />
          数秒後に再確認してください。
        </p>

        <div className="grid gap-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              setState('verifying');
              setAttempt(0);
              setPollToken((current) => current + 1);
            }}
          >
            再確認する
          </Button>

          <Link href="/">
            <Button className="w-full" size="lg" variant="secondary">
              ダッシュボードへ
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm text-center">
      <div className="w-16 h-16 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
        <Icon name="check_circle" size={32} className="text-[var(--color-success)]" />
      </div>

      <h1 className="text-xl font-semibold text-[var(--color-foreground)] mb-2">
        ようこそProプランへ！
      </h1>

      <div className="flex items-center justify-center gap-2 text-[var(--color-primary)] mb-4">
        <Icon name="auto_awesome" size={16} />
        <span className="text-sm font-medium">すべての機能が解放されました</span>
      </div>

      <p className="text-[var(--color-muted)] text-sm mb-8">
        スキャン無制限、クラウド同期など
        <br />
        すべての機能をお楽しみください
      </p>

      <Link href="/">
        <Button className="w-full" size="lg">
          ダッシュボードへ
        </Button>
      </Link>
    </div>
  );
}

function SuccessFallback() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
      <p className="text-[var(--color-muted)] text-sm">読み込み中...</p>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-6">
      <Suspense fallback={<SuccessFallback />}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
