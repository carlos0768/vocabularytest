'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface ScanCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TopMode = 'vocab' | 'correction' | 'parser';
type SubOption = 'circle' | 'eiken' | 'idiom' | 'all';

const MODES: { k: TopMode; label: string; desc: string; pro?: boolean; icon: React.ReactNode }[] = [
  {
    k: 'vocab',
    label: '単語帳',
    desc: '教科書・問題集から単語を抽出',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z"/>
        <path d="M4 4v12a4 4 0 014-4h10"/>
      </svg>
    ),
  },
  {
    k: 'correction',
    label: '添削',
    desc: '書いた英文を赤ペンで直す',
    pro: true,
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 4l5 5L9 20H4v-5L15 4z"/>
      </svg>
    ),
  },
  {
    k: 'parser',
    label: '構造解析',
    desc: '長文を SVO と節で分解',
    pro: true,
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18M5 8l7-5 7 5M5 8v8l7 5 7-5V8"/>
      </svg>
    ),
  },
];

const SUB_OPTIONS: { k: SubOption; label: string; hint: string; pro?: boolean }[] = [
  { k: 'circle', label: '丸囲み',           hint: '手動マークを優先' },
  { k: 'eiken',  label: '英検',             hint: '級別頻出語を優先', pro: true },
  { k: 'idiom',  label: '熟語・イディオム', hint: '複合語・熟語を抽出' },
  { k: 'all',    label: 'すべての単語',     hint: '全単語を網羅' },
];

const MODE_SCAN_PATH: Record<TopMode, string> = {
  vocab: '/scan',
  correction: '/correction/scan',
  parser: '/parser/scan',
};

export function ScanCaptureModal({ isOpen, onClose }: ScanCaptureModalProps) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<TopMode>('vocab');
  const [activeSubs, setActiveSubs] = useState<SubOption[]>(['all']);

  if (!isOpen) return null;

  const toggleSub = (k: SubOption) => {
    setActiveSubs(prev =>
      prev.includes(k) ? prev.filter(s => s !== k) : [...prev, k]
    );
  };

  const handleCamera = () => {
    onClose();
    setTimeout(() => router.push(`${MODE_SCAN_PATH[activeMode]}?source=camera`), 50);
  };

  const handleLibrary = () => {
    onClose();
    setTimeout(() => router.push(`${MODE_SCAN_PATH[activeMode]}?source=library`), 50);
  };

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
            border: '1.5px solid var(--solid-ink)',
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {/* 3 top-level modes */}
          <div className="mb-3 flex flex-col gap-[7px]">
            {MODES.map(m => {
              const active = m.k === activeMode;
              return (
                <button
                  key={m.k}
                  type="button"
                  onClick={() => setActiveMode(m.k)}
                  className="flex items-center gap-[11px] rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 py-[11px] text-left transition-all"
                  style={{
                    background: active ? 'var(--solid-ink)' : '#fff',
                    color: active ? '#fff' : 'var(--solid-ink)',
                    boxShadow: active ? '2px 2px 0 var(--solid-ink)' : 'none',
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                    style={{
                      background: active ? 'rgba(255,255,255,0.12)' : 'var(--color-surface-secondary)',
                      border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)',
                    }}
                  >
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold">{m.label}</span>
                      {m.pro && (
                        <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-[2px] font-mono text-[8px] font-bold tracking-[0.04em] text-white">
                          PRO
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-0.5 text-[10.5px] leading-[1.4]"
                      style={{ color: active ? 'rgba(255,255,255,0.65)' : 'var(--color-muted)' }}
                    >
                      {m.desc}
                    </div>
                  </div>
                  {/* radio */}
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ border: active ? '1.5px solid #fff' : '1.5px solid var(--solid-ink)' }}
                  >
                    {active && <div className="h-[7px] w-[7px] rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sub-options (vocab only) */}
          {activeMode === 'vocab' && (
            <div
              className="mb-3 rounded-[10px] p-[11px]"
              style={{
                background: 'rgba(26,26,26,0.04)',
                border: '1px dashed var(--solid-ink)',
              }}
            >
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6"/>
                </svg>
                抽出オプション · 複数選択可
              </div>
              <div className="flex flex-wrap gap-[5px]">
                {SUB_OPTIONS.map(s => {
                  const on = activeSubs.includes(s.k);
                  return (
                    <button
                      key={s.k}
                      type="button"
                      onClick={() => toggleSub(s.k)}
                      className="inline-flex items-center gap-[5px] rounded-full border-[1.25px] border-[var(--solid-ink)] px-[10px] py-[6px] text-[11px] font-bold transition-colors"
                      style={{
                        background: on ? 'var(--solid-ink)' : '#fff',
                        color: on ? '#fff' : 'var(--solid-ink)',
                      }}
                    >
                      <span
                        className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[3px]"
                        style={{
                          border: on ? '1.25px solid #fff' : '1.25px solid var(--solid-ink)',
                          background: on ? '#fff' : 'transparent',
                        }}
                      >
                        {on && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--solid-ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 12l5 5L20 6"/>
                          </svg>
                        )}
                      </span>
                      {s.label}
                      {s.pro && (
                        <span
                          className="font-mono text-[8px] font-bold tracking-[0.04em]"
                          style={{ color: on ? 'rgba(255,255,255,0.7)' : 'var(--color-accent)' }}
                        >
                          PRO
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Camera / Library buttons */}
          <div className="mb-3 flex gap-2.5">
            <button type="button" onClick={handleCamera} className="relative flex-1">
              <div className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
              <div className="relative flex flex-col items-center gap-1.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-4 text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h3l2-2h6l2 2h3v12H4z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span className="text-[13px] font-bold">カメラで撮影</span>
              </div>
            </button>
            <button type="button" onClick={handleLibrary} className="relative flex-1">
              <div className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
              <div className="relative flex flex-col items-center gap-1.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white py-4 text-[var(--solid-ink)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M3 16l5-5 4 4 3-3 6 6"/>
                </svg>
                <span className="text-[13px] font-bold">写真から選ぶ</span>
              </div>
            </button>
          </div>

          {/* Tip */}
          <div
            className="flex items-center gap-2 rounded-[10px] px-[11px] py-[9px]"
            style={{
              background: 'rgba(19,127,236,0.06)',
              border: '1px dashed rgba(19,127,236,0.3)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#137fec" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span className="text-[11px] leading-[1.5] text-[var(--color-muted)]">
              見開きページも OK。AI が 20 秒で単語を抽出します。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
