'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui';

export type HomeMode = 'vocabulary' | 'grammar';

interface ModeSwitcherProps {
  mode: HomeMode;
  onModeChange: (mode: HomeMode) => void;
}

const modes: { id: HomeMode; label: string; icon: string }[] = [
  { id: 'vocabulary', label: '単語', icon: 'menu_book' },
  { id: 'grammar', label: '文法', icon: 'school' },
];

export function ModeSwitcher({ mode, onModeChange }: ModeSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [isOpen]);

  const currentMode = modes.find((m) => m.id === mode) ?? modes[0];

  return (
    <div ref={dropdownRef} className="relative">
      {/* Pill button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-foreground)] active:scale-95 transition-transform"
      >
        <Icon name={currentMode.icon} size={16} />
        {currentMode.label}
        <Icon
          name="expand_more"
          size={16}
          className="text-[var(--color-muted)]"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Menu */}
          <div
            className="absolute right-0 top-full mt-2 z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-lg overflow-hidden animate-fade-in"
            style={{ minWidth: '180px' }}
          >
            {modes.map((m) => {
              const isActive = m.id === mode;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onModeChange(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-secondary)]'
                  }`}
                >
                  <Icon name={m.icon} size={20} filled={isActive} />
                  <span className="text-sm font-semibold">{m.label}</span>
                  {isActive && (
                    <Icon name="check" size={18} className="ml-auto text-[var(--color-primary)]" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
