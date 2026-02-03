'use client';

import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/settings" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--color-foreground)]" />
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">お問い合わせ</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8 space-y-6">
        <div className="card p-6 space-y-4">
          <p className="text-[var(--color-foreground)] leading-relaxed">
            MERKENに関するご質問、不具合のご報告、ご要望などがございましたら、以下のメールアドレスまでお気軽にご連絡ください。
          </p>

          <a
            href="mailto:support@scanvocab.app"
            className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--color-peach-light)] hover:bg-[var(--color-peach)]/20 transition-colors"
          >
            <div className="w-10 h-10 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center">
              <Mail className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <span className="font-semibold text-[var(--color-foreground)]">support@scanvocab.app</span>
          </a>

          <p className="text-sm text-[var(--color-muted)]">
            通常2営業日以内にご返信いたします。
          </p>
        </div>
      </main>
    </div>
  );
}
