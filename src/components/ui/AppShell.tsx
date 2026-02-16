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

const LIGHT_DOT = buildDotSvg('#9ca3af', 24, 1);
const DARK_DOT = buildDotSvg('#2a2f38', 24, 1);

export function AppShell({ children, hideBottomNav = false }: AppShellProps) {
  const [bgImage, setBgImage] = useState(LIGHT_DOT);

  useEffect(() => {
    const update = () => {
      const dark = document.documentElement.classList.contains('dark');
      setBgImage(dark ? DARK_DOT : LIGHT_DOT);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Fixed dot background layer - immune to iOS bounce */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: bgImage,
          backgroundRepeat: 'repeat',
        }}
      />
      <Sidebar />
      <div className="lg:ml-[280px] relative">
        {children}
      </div>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
