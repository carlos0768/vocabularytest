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
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--color-background)',
        backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <Sidebar />
      <div className="lg:ml-[280px]">
        {children}
      </div>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
