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
    label: 'プロジェクト',
    matchPaths: ['/projects', '/project'],
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

export function BottomNav() {
  const pathname = usePathname();
  const projectIdFromPath = pathname?.startsWith('/project/')
    ? pathname.split('/')[2]
    : null;
  const scanHref = projectIdFromPath
    ? `/scan?projectId=${encodeURIComponent(projectIdFromPath)}`
    : '/scan';

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) => pathname === path || pathname.startsWith(path + '/')
      );
    }
    return pathname === item.href;
  };

  return (
    <nav className="bottom-nav lg:hidden">
      <div className="bottom-nav-inner">
        {navItems.slice(0, 2).map((item) => {
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
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <Link href={scanHref} className="flex items-center justify-center" aria-label="スキャン">
          <span className="bottom-nav-cta">
            <Icon name="center_focus_weak" size={22} />
          </span>
        </Link>

        {navItems.slice(2).map((item) => {
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
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
