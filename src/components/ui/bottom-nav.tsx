'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FolderOpen, BarChart3, Settings, Camera } from 'lucide-react';
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
    matchPaths: ['/'],
  },
  {
    href: '/projects',
    icon: FolderOpen,
    label: 'プロジェクト',
    matchPaths: ['/projects', '/project'],
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
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('bottom-nav-item', active && 'active')}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-colors',
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <Link href={scanHref} className="flex items-center justify-center" aria-label="スキャン">
          <span className="bottom-nav-cta">
            <Camera className="w-5 h-5" />
          </span>
        </Link>

        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('bottom-nav-item', active && 'active')}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-colors',
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
