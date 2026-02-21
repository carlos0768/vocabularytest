'use client';

import { Icon } from '@/components/ui/Icon';

export type ProjectTab = 'study' | 'vocabulary';

interface ProjectTabsProps {
  selectedTab: ProjectTab;
  onTabChange: (tab: ProjectTab) => void;
  isPro: boolean;
}

export function ProjectTabs({ selectedTab, onTabChange, isPro }: ProjectTabsProps) {
  return (
    <div className="flex border-b border-[var(--color-border-light)]">
      <button
        onClick={() => onTabChange('study')}
        className={`flex-1 py-3 text-sm font-bold text-center transition-colors relative ${
          selectedTab === 'study'
            ? 'text-[var(--color-primary)]'
            : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
        }`}
      >
        学習
        {selectedTab === 'study' && (
          <div className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[var(--color-primary)] rounded-full" />
        )}
      </button>
      <button
        onClick={() => onTabChange('vocabulary')}
        className={`flex-1 py-3 text-sm font-bold text-center transition-colors relative flex items-center justify-center gap-1.5 ${
          selectedTab === 'vocabulary'
            ? 'text-[var(--color-primary)]'
            : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
        }`}
      >
        単語帳
        {!isPro && (
          <span className="chip chip-pro px-1.5 py-0.5 text-[10px]">
            <Icon name="auto_awesome" size={10} />
            Pro
          </span>
        )}
        {selectedTab === 'vocabulary' && (
          <div className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[var(--color-primary)] rounded-full" />
        )}
      </button>
    </div>
  );
}
