'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from './Icon';
import { cn, getGuestUserId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { getRepository } from '@/lib/db';

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
  const { user, subscription, wasPro } = useAuth();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) => pathname === path || pathname.startsWith(path + '/')
      );
    }
    return pathname === item.href;
  };

  const handleCreateBlankProject = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const subscriptionStatus = subscription?.status || 'free';
      const repository = getRepository(subscriptionStatus, wasPro);
      const userId = user?.id || getGuestUserId();
      const created = await repository.createProject({
        userId,
        title: '無題の単語帳',
        sourceLabels: [],
      });
      router.push(`/project/${created.id}`);
    } catch (error) {
      console.error('Failed to create blank project:', error);
      showToast({ message: '単語帳の作成に失敗しました', type: 'error' });
      setCreating(false);
    }
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
                  size={26}
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
      {/* FAB - creates a blank Notion-style flashcard instantly */}
      <button
        type="button"
        onClick={handleCreateBlankProject}
        disabled={creating}
        className="fab lg:hidden active:scale-95 transition-transform disabled:opacity-60"
        aria-label="新規単語帳を作成"
      >
        <Icon name={creating ? 'progress_activity' : 'add'} size={28} className={creating ? 'animate-spin' : ''} />
      </button>
    </>
  );
}
