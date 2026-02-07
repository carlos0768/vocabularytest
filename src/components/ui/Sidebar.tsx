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
    href: '/scan',
    icon: 'center_focus_weak',
    label: 'スキャン',
    matchPaths: ['/scan'],
  },
  {
    href: '/stats',
    icon: 'bar_chart',
    label: '統計',
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
      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <Icon name="school" size={22} className="text-white" />
        </div>
        <span className="text-xl font-bold text-[var(--color-foreground)] font-display">MERKEN</span>
      </div>

      {/* Navigation */}
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
                  ? 'bg-primary/10 text-primary'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-border-light)] hover:text-[var(--color-foreground)]'
              )}
            >
              <Icon
                name={item.icon}
                filled={active}
                size={22}
                className={active ? 'text-primary' : ''}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-muted)] px-3">手入力ゼロで単語帳を作成</p>
      </div>
    </aside>
  );
}
