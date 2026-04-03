'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
    href: '/shared',
    icon: 'group',
    label: '共有',
    matchPaths: ['/shared'],
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

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) => pathname === path || pathname.startsWith(path + '/')
      );
    }
    return pathname === item.href;
  };

  return (
    <>
      <nav className="bottom-nav lg:hidden">
        <div className="bottom-nav-inner">
          {navItems.map((item) => {
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
          })}
        </div>
      </nav>
      {/* FAB - Floating Action Button */}
      <button
        onClick={() => router.push('/scan')}
        className="fab lg:hidden"
        aria-label="スキャン"
      >
        <Icon name="add" size={28} />
      </button>
    </>
  );
}
