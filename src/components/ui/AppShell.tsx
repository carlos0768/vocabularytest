'use client';

import { ReactNode } from 'react';
import { DesktopSidebar } from '@/components/desktop/DesktopChrome';
import { BottomNav } from './bottom-nav';

export function AppShell({ children, hideBottomNav = false }: AppShellProps) {
  return (
    <div className="ds-live-shell relative">
      <DesktopSidebar />
      <div className="ds-live-main relative">
        {children}
      </div>
      {!hideBottomNav && <div className="lg:hidden"><BottomNav /></div>}
    </div>
  );
}

interface AppShellProps {
  children: ReactNode;
  hideBottomNav?: boolean;
}
