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
}

const navItems: NavItem[] = [
  {
    href: '/',
    icon: 'home',
    label: 'ホーム',
    matchPaths: ['/'],
  },
  {
    href: '/projects',
    icon: 'folder',
    label: '単語帳',
    matchPaths: ['/projects', '/project'],
  },
  {
    href: '/shared',
    icon: 'group',
    label: '共有',
    matchPaths: ['/shared'],
  },
  {
    href: '/search',
    icon: 'search',
    label: '検索',
    matchPaths: ['/search'],
  },
  {
    href: '/stats',
    icon: 'bar_chart',
    label: '進歩',
    matchPaths: ['/stats'],
  },
  {
    href: '/settings',
    icon: 'settings',
    label: '設定',
    matchPaths: ['/settings', '/subscription'],
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
    <aside className="hidden lg:flex flex-col w-[280px] h-screen fixed left-0 top-0 bg-[var(--color-surface)] border-r border-[var(--color-border)] z-40">
      <div className="px-6 py-6 flex items-center gap-3">
        <span className="text-2xl font-black text-[var(--color-foreground)] font-display tracking-tight">MERKEN</span>
      </div>

      <nav className="flex-1 px-4 py-2 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-border-light)] hover:text-[var(--color-foreground)]'
              )}
            >
              <Icon
                name={item.icon}
                filled={active}
                size={22}
                className={active ? 'text-[var(--color-foreground)]' : ''}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <Link
          href="/scan"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm transition-opacity hover:opacity-90"
        >
          <Icon name="add" size={18} />
          新規スキャン
        </Link>
      </div>
    </aside>
  );
}
