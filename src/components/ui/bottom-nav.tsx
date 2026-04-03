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

const leftNavItems: NavItem[] = [
  {
    href: '/',
    icon: 'home',
    label: 'ホーム',
    matchPaths: ['/'],
  },
  {
    href: '/shared',
    icon: 'group',
    label: '共有',
    matchPaths: ['/shared'],
  },
];

const rightNavItems: NavItem[] = [
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

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) => pathname === path || pathname.startsWith(path + '/')
      );
    }
    return pathname === item.href;
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn('bottom-nav-item', active && 'active')}
      >
        <Icon
          name={item.icon}
          filled={active}
          size={20}
          className={cn(
            'transition-colors',
            active ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'
          )}
        />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav className="bottom-nav lg:hidden">
      <div className="bottom-nav-inner">
        {leftNavItems.map(renderNavItem)}

        {/* Center scan button */}
        <div className="flex items-center justify-center" style={{ marginTop: '-1.25rem' }}>
          <Link
            href="/scan"
            aria-label="スキャン"
            className="w-14 h-14 rounded-full bg-[var(--color-foreground)] text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}
          >
            <Icon name="add" size={28} />
          </Link>
        </div>

        {rightNavItems.map(renderNavItem)}
      </div>
    </nav>
  );
}
