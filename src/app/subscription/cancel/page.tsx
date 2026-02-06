'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';

export default function SubscriptionCancelPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-[var(--color-border-light)] rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon name="cancel" size={32} className="text-[var(--color-muted)]" />
        </div>

        <h1 className="text-xl font-semibold text-[var(--color-foreground)] mb-2">
          決済がキャンセルされました
        </h1>

        <p className="text-[var(--color-muted)] text-sm mb-8">
          決済は完了していません。
          <br />
          いつでも再度お試しいただけます。
        </p>

        <div className="space-y-3">
          <Link href="/subscription">
            <Button className="w-full" size="lg">
              プラン選択に戻る
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="w-full">
              ダッシュボードへ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
