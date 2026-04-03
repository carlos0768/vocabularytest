'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './bottom-nav';

export function AppShell({ children, hideBottomNav = false }: AppShellProps) {
  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--color-background)' }}>
      <Sidebar />
      <div className="lg:ml-[280px] relative">
        {children}
      </div>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}

interface AppShellProps {
  children: ReactNode;
  hideBottomNav?: boolean;
}
