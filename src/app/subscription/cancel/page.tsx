'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function SubscriptionCancelPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] p-6 font-[var(--font-body)]">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[rgba(26,26,26,0.05)]">
          <Icon name="cancel" size={28} className="text-[var(--color-muted)]" />
        </div>

        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-[var(--solid-ink)]">
          決済がキャンセルされました
        </h1>

        <p className="mt-2 text-sm leading-[1.7] text-[var(--color-muted)]">
          決済は完了していません。<br />
          いつでも再度お試しいただけます。
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <div>
            <Link
              href="/subscription"
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-sm font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              プラン選択に戻る
            </Link>
          </div>

          <div>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-white py-3.5 text-sm font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              ダッシュボードへ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
