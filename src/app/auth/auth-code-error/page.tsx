'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-4">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-card p-8 w-full max-w-sm text-center border border-[var(--color-border)]">
        <div className="w-16 h-16 bg-[var(--color-error-light)] rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-[var(--color-error)]" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">
          認証エラー
        </h1>
        <p className="text-[var(--color-muted)] mb-6">
          認証に失敗しました。
          <br />
          認証コードの有効期限が切れているか、すでに使用されている可能性があります。
        </p>
        <div className="space-y-3">
          <Link href="/login">
            <Button className="w-full">
              ログインをやり直す
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="w-full">
              ホームに戻る
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
