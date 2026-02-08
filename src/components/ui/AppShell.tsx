'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './bottom-nav';

interface AppShellProps {
  children: ReactNode;
  hideBottomNav?: boolean;
}

function buildDotSvg(color: string, size: number, dotRadius: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${dotRadius}" fill="${color}" shape-rendering="crispEdges"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function AppShell({ children, hideBottomNav = false }: AppShellProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const bgImage = isDark
    ? buildDotSvg('#1e2228', 24, 0.75)
    : buildDotSvg('#d1d5db', 24, 0.75);

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--color-background)',
        backgroundImage: bgImage,
        backgroundRepeat: 'repeat',
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
