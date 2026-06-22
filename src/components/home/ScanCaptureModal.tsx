'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ScanCapturePanel } from '@/components/home/ScanCapturePanel';
import { useAuth } from '@/hooks/use-auth';
import type { HomeGeneratingWordbookPayload } from '@/lib/home/home-session-storage';

interface ScanCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: TopMode;
  /**
   * If set, the scan results will be appended to this existing project
   * instead of creating a new one.
   */
  targetProjectId?: string;
  targetProjectTitle?: string;
  /**
   * Title for the project created from this scan (used when scanning into a
   * new word book, e.g. when the name was entered in the create sheet).
   */
  newProjectTitle?: string;
  onBackgroundScanStarted?: (payload: HomeGeneratingWordbookPayload) => void;
}

type TopMode = 'vocab';

const MODES: { k: TopMode; label: string; pro?: boolean; icon: React.ReactNode }[] = [
  {
    k: 'vocab',
    label: '単語帳',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z"/>
        <path d="M4 4v12a4 4 0 014-4h10"/>
      </svg>
    ),
  },
];

export function ScanCaptureModal({
  isOpen,
  onClose,
  defaultMode,
  targetProjectId,
  targetProjectTitle,
  newProjectTitle,
  onBackgroundScanStarted,
}: ScanCaptureModalProps) {
  const { isPro } = useAuth();
  const [activeMode, setActiveMode] = useState<TopMode>(targetProjectId ? 'vocab' : (defaultMode ?? 'vocab'));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      {/* Bottom sheet — centered, max 480px */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 480,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
          }}
        >
          {/* Drag handle */}
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>

          {/* Title row */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                NEW SCAN
              </div>
              <div className="mt-0.5 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
                何をスキャンする？
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {/* Top-level modes (hidden when scanning into an existing word book) */}
          {!targetProjectId && <div className="mb-3 flex flex-col gap-[7px]">
            {MODES.map(m => {
              const active = m.k === activeMode;
              return (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setActiveMode(m.k)}
                  className="flex items-center gap-[11px] rounded-[10px] border-2 bg-white px-3 py-[11px] text-left text-[var(--solid-ink)] transition-all"
                  style={{
                    borderColor: active ? 'var(--solid-ink)' : 'var(--color-border)',
                    boxShadow: active ? '2px 3px 0 var(--solid-ink)' : 'none',
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                    style={{
                      background: 'var(--color-accent-light)',
                      color: 'var(--color-accent-ink)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold">{m.label}</span>
                      {m.pro && !isPro && (
                        <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-[2px] font-mono text-[8px] font-bold tracking-[0.04em] text-white">
                          PRO
                        </span>
                      )}
                    </div>
                  </div>
                  {/* radio */}
                  <div
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: active ? 'var(--color-accent)' : '#fff',
                    }}
                  >
                    {active && <Icon name="check" size={12} className="text-white" />}
                  </div>
                </button>
              );
            })}
          </div>}

          {/* Scan options + capture flow */}
          {activeMode === 'vocab' && (
            <ScanCapturePanel
              targetProjectId={targetProjectId}
              targetProjectTitle={targetProjectTitle}
              newProjectTitle={newProjectTitle}
              onBackgroundScanStarted={onBackgroundScanStarted}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
