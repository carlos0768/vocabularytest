'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';

export function NotebookLoadingState({ label = '読み込み中...' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-muted)]">
      <Icon name="progress_activity" size={20} className="animate-spin" />
      <span className="ml-2 text-sm">{label}</span>
    </div>
  );
}

export function NotebookErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-error-light)]">
        <Icon name="warning" size={22} className="text-[var(--color-error)]" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-[var(--color-foreground)]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function NotebookAuthRequiredState() {
  return (
    <NotebookErrorState
      title="ログインが必要です"
      message="notebook 機能はサーバー保存された学習データを前提にしています。ログインしてから開いてください。"
      action={
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-xl bg-[var(--color-foreground)] px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
        >
          ログインへ
        </Link>
      }
    />
  );
}
