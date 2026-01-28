'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  {
    href: '/',
    icon: Home,
    label: 'ホーム',
    matchPaths: ['/', '/project'],
  },
  {
    href: '/search',
    icon: Search,
    label: '検索',
    matchPaths: ['/search'],
  },
  {
    href: '/stats',
    icon: BarChart3,
    label: '統計',
    matchPaths: ['/stats'],
  },
  {
    href: '/settings',
    icon: Settings,
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

  return (
    <nav className="bottom-nav">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'bottom-nav-item flex-1 py-2',
                active && 'active'
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    'w-6 h-6 transition-colors',
                    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
                {active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[var(--color-primary)] rounded-full" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
