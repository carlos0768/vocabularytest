'use client';

import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';

const MODES = [
  { k: 'vocab', label: '単語帳', icon: 'auto_stories', active: true },
  { k: 'correction', label: '添削', icon: 'edit_note', pro: true },
  { k: 'parser', label: '構造解析', icon: 'account_tree', pro: true },
];

const SUB_OPTIONS = [
  { k: 'circle', label: '丸囲み', on: true },
  { k: 'eiken', label: '英検', pro: true },
  { k: 'idiom', label: '熟語・イディオム' },
  { k: 'all', label: 'すべての単語', on: true },
];

export default function ScanPage() {
  const { isPro } = useAuth();
  const activeMode = 'vocab';

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
      {/* Dimmed background content */}
      <div className="pointer-events-none opacity-40">
        <div className="flex items-center justify-between px-[18px] pb-3.5 pt-2">
          <div className="font-display text-[22px] font-black tracking-[0.1em]">
            MERKEN
            <span className="ml-1 inline-block h-[5px] w-[5px] -translate-y-[7px] bg-[var(--color-accent)]" />
          </div>
          <div className="rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-2.5 py-1.5">
            <span className="text-[11px] text-[var(--color-muted)]">12 日連続</span>
          </div>
        </div>
        <div className="px-[18px] pb-3.5">
          <div className="h-[100px] rounded-[14px] border-[1.25px] border-[var(--color-border)] bg-white" />
        </div>
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-[rgba(26,26,26,0.45)] backdrop-blur-[3px]" />

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border-[1.5px] border-b-0 border-[var(--solid-ink)] bg-[#faf7f1] px-[18px] pb-7 pt-3.5 shadow-[0_-8px_24px_rgba(26,26,26,0.18)]">
        <div className="mb-2.5 flex justify-center">
          <div className="h-1 w-10 rounded-sm bg-[rgba(26,26,26,0.2)]" />
        </div>

        {/* Title */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">NEW SCAN</div>
            <div className="mt-0.5 font-display text-lg font-extrabold text-[var(--solid-ink)]">何をスキャンする？</div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* 3 modes */}
        <div className="mb-3 flex flex-col gap-[7px]">
          {MODES.map((m) => {
            const isActive = m.k === activeMode;
            return (
              <div
                key={m.k}
                className="flex items-center gap-[11px] rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 py-[11px]"
                style={{
                  background: isActive ? 'var(--solid-ink)' : '#fff',
                  color: isActive ? '#fff' : 'var(--solid-ink)',
                  boxShadow: isActive ? '2px 2px 0 var(--solid-ink)' : 'none',
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.12)' : 'var(--color-surface)',
                    border: isActive ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)',
                  }}
                >
                  <Icon name={m.icon} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold">{m.label}</span>
                    {m.pro && !isPro && (
                      <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-0.5 font-mono text-[8px] font-bold tracking-[0.04em] text-white">
                        PRO
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ border: `1.5px solid ${isActive ? '#fff' : 'var(--solid-ink)'}` }}
                >
                  {isActive && <div className="h-[7px] w-[7px] rounded-full bg-white" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sub-options */}
        {activeMode === 'vocab' && (
          <div className="mb-3 rounded-[10px] border border-dashed border-[var(--solid-ink)] bg-[rgba(26,26,26,0.04)] p-[11px]">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
              <Icon name="chevron_right" size={11} />
              抽出オプション · 複数選択可
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {SUB_OPTIONS.map((s) => {
                const isOn = !!s.on;
                return (
                  <span
                    key={s.k}
                    className="inline-flex items-center gap-[5px] rounded-full px-2.5 py-1.5 text-[11px] font-bold"
                    style={{
                      background: isOn ? 'var(--solid-ink)' : '#fff',
                      color: isOn ? '#fff' : 'var(--solid-ink)',
                      border: '1.25px solid var(--solid-ink)',
                    }}
                  >
                    <span
                      className="inline-flex h-[13px] w-[13px] items-center justify-center rounded-[3px]"
                      style={{
                        border: `1.25px solid ${isOn ? '#fff' : 'var(--solid-ink)'}`,
                        background: isOn ? '#fff' : 'transparent',
                      }}
                    >
                      {isOn && <Icon name="check" size={9} />}
                    </span>
                    {s.label}
                    {s.pro && !isPro && (
                      <span className="font-mono text-[8px] font-bold tracking-[0.04em]" style={{ color: isOn ? 'rgba(255,255,255,0.7)' : 'var(--color-accent)' }}>
                        PRO
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Source buttons */}
        <div className="mb-3 flex gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
            <div className="relative flex flex-col items-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-4 text-white">
              <Icon name="photo_camera" size={24} />
              <span className="text-[13px] font-bold">カメラで撮影</span>
            </div>
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
            <div className="relative flex flex-col items-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-4 text-[var(--solid-ink)]">
              <Icon name="image" size={24} />
              <span className="text-[13px] font-bold">写真から選ぶ</span>
            </div>
          </div>
        </div>

        {/* Tip */}
        <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-[rgba(19,127,236,0.3)] bg-[rgba(19,127,236,0.06)] px-[11px] py-[9px]">
          <Icon name="info" size={14} className="text-[#137fec]" />
          <span className="text-[11px] leading-[1.5] text-[var(--color-muted)]">
            見開きページも OK。AI が 20 秒で単語を抽出します。
          </span>
        </div>
      </div>
    </div>
  );
}
