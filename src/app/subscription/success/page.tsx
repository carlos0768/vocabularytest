'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

function SuccessContent() {
  const { refresh } = useAuth();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    // Refresh auth state to get updated subscription
    const verifyAndRefresh = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for webhook
      await refresh();
      setVerifying(false);
    };

    verifyAndRefresh();
  }, [refresh]);

  if (verifying) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin mb-4" />
        <p className="text-[var(--color-muted)] text-sm">決済を確認中...</p>
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
