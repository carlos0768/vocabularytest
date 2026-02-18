import Link from 'next/link';
import { ReactNode } from 'react';
import { DotGridBackground } from '@/components/ui/DotGridBackground';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { StatusAwareCta } from './StatusAwareCta';

interface MarketingShellProps {
  children: ReactNode;
  active: 'features' | 'pricing';
}

const navItems = [
  { href: '/features', label: '機能', key: 'features' as const },
  { href: '/pricing', label: '料金', key: 'pricing' as const },
];

export function MarketingShell({ children, active }: MarketingShellProps) {
  return (
    <div className="min-h-screen relative bg-[var(--color-background)]">
      <DotGridBackground />

      <header className="header-film sticky top-0 z-40 border-b border-[var(--color-border-light)]">
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/features" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white">
                <Icon name="school" size={18} />
              </div>
              <div>
                <p className="font-display text-lg font-extrabold text-[var(--color-foreground)] leading-none">MERKEN</p>
                <p className="text-[11px] text-[var(--color-muted)] leading-none mt-1">手入力ゼロで単語帳作成</p>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-semibold border transition-colors',
                    active === item.key
                      ? 'bg-[var(--color-primary-light)] border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="px-4 py-2 rounded-full text-sm font-semibold border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
              >
                ログイン
              </Link>
            </div>

            <StatusAwareCta
              guestLabel="無料で始める"
              authLabel="ダッシュボードへ"
              size="sm"
              className="hidden sm:inline-flex"
            />
          </div>

          <div className="mt-3 flex md:hidden items-center gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors',
                  active === item.key
                    ? 'bg-[var(--color-primary-light)] border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)]'
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] whitespace-nowrap"
            >
              ログイン
            </Link>
            <StatusAwareCta
              guestLabel="始める"
              authLabel="開く"
              size="sm"
              className="text-xs px-3 py-1.5 h-auto"
            />
          </div>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-[var(--color-border-light)] mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-4 text-sm">
          <p className="text-[var(--color-muted)]">© {new Date().getFullYear()} MERKEN</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]">プライバシー</Link>
            <Link href="/terms" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]">利用規約</Link>
            <Link href="/contact" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]">お問い合わせ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
