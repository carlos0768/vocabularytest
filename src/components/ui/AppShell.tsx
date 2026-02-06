'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './bottom-nav';

interface AppShellProps {
  children: ReactNode;
  hideBottomNav?: boolean;
}

export function AppShell({ children, hideBottomNav = false }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <Sidebar />
      <div className="lg:ml-[280px]">
        {children}
      </div>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
