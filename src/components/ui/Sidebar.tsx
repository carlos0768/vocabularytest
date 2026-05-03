'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: string;
  label: string;
  matchPaths?: string[];
  badge?: string;
  count?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: '学習',
    items: [
      { href: '/', icon: 'home', label: 'Home & 単語帳', matchPaths: ['/'], count: '4' },
      { href: '/projects', icon: 'folder', label: '単語帳', matchPaths: ['/projects', '/project', '/word'] },
      { href: '/favorites', icon: 'star', label: 'コレクション', matchPaths: ['/favorites', '/collections'], count: '4' },
      { href: '/stats', icon: 'bar_chart', label: '進歩', matchPaths: ['/stats'] },
    ],
  },
  {
    label: '新機能',
    items: [
      { href: '/correction', icon: 'edit_note', label: '添削', matchPaths: ['/correction'], badge: 'NEW' },
      { href: '/parser', icon: 'account_tree', label: '構造解析', matchPaths: ['/parser'], badge: 'NEW' },
    ],
  },
  {
    label: 'その他',
    items: [
      { href: '/shared', icon: 'group', label: '共有', matchPaths: ['/shared', '/share'], count: '3' },
      { href: '/search', icon: 'search', label: '検索', matchPaths: ['/search'] },
      { href: '/settings', icon: 'settings', label: 'アカウント', matchPaths: ['/settings', '/subscription'] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) => pathname === path || pathname.startsWith(path + '/')
      );
    }
    return pathname === item.href;
  };

  return (
    <aside className="hidden lg:flex flex-col w-[280px] h-screen fixed left-0 top-0 bg-[var(--color-surface)] border-r-[1.5px] border-[var(--solid-ink)] z-40">
      <div className="px-6 py-7">
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-black text-[var(--color-foreground)] font-display tracking-[0.08em] leading-none">MERKEN</span>
          <span className="w-1.5 h-1.5 bg-[var(--color-accent)] inline-block" />
        </div>
        <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Redesign · 2026
        </div>
      </div>

      <nav className="flex-1 px-5 py-2 space-y-8 overflow-y-auto overscroll-contain">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <div className="px-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-muted)]">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors',
                      active
                        ? 'bg-[var(--solid-ink)] text-[var(--color-surface)]'
                        : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-secondary)]'
                    )}
                  >
                    <Icon
                      name={item.icon}
                      filled={active}
                      size={19}
                      className={active ? 'text-[var(--color-surface)]' : 'text-[var(--color-muted)]'}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-[3px] bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[9px] font-black tracking-[0.04em] text-white">
                        {item.badge}
                      </span>
                    ) : item.count ? (
                      <span className={cn('font-mono text-[10px]', active ? 'text-white/60' : 'text-[var(--color-muted)]')}>
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-5 py-5 border-t border-dashed border-[var(--color-border)]">
        <Link
          href="/scan"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-sm border-[1.5px] border-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] transition-all hover:opacity-90 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-ink)]"
        >
          <Icon name="add" size={18} />
          新規スキャン
        </Link>
      </div>
    </aside>
  );
}
