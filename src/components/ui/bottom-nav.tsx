'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from './Icon';
import { cn, getGuestUserId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { getRepository } from '@/lib/db';
import { BlankProjectModal } from '@/components/home/BlankProjectModal';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) => pathname === path || pathname.startsWith(path + '/')
      );
    }
    return pathname === item.href;
  };

  const handleConfirmCreate = async (name: string, description?: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const subscriptionStatus = subscription?.status || 'free';
      const repository = getRepository(subscriptionStatus, wasPro);
      const userId = user?.id || getGuestUserId();
      const created = await repository.createProject({
        userId,
        title: name,
        description,
        sourceLabels: [],
      });
      setModalOpen(false);
      router.push(`/project/${created.id}`);
    } catch (error) {
      console.error('Failed to create blank project:', error);
      showToast({ message: '単語帳の作成に失敗しました', type: 'error' });
    } finally {
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
      {/* FAB — opens a name + description dialog before creating the project. */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fab lg:hidden active:scale-95 transition-transform"
        aria-label="新規単語帳を作成"
      >
        <Icon name="add" size={28} />
      </button>
      <BlankProjectModal
        isOpen={modalOpen}
        onClose={() => {
          if (!creating) setModalOpen(false);
        }}
        onConfirm={handleConfirmCreate}
        isSubmitting={creating}
      />
    </>
  );
}
