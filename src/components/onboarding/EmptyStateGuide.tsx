'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

const STEPS = [
  {
    icon: 'photo_camera',
    label: '撮る',
    desc: 'ノートや本を撮影',
    accent: '#15803d',
    accentSub: '#dcfce7',
  },
  {
    icon: 'edit_note',
    label: '確認',
    desc: 'AIが単語と訳を抽出',
    accent: '#b45309',
    accentSub: '#fef3c7',
  },
  {
    icon: 'psychology',
    label: '覚える',
    desc: 'クイズで記憶に定着',
    accent: '#6d28d9',
    accentSub: '#ede9fe',
  },
] as const;

interface EmptyStateGuideProps {
  /** When provided, the primary CTA opens this scan modal instead of /scan. */
  onStartScan?: () => void;
}

export function EmptyStateGuide({ onStartScan }: EmptyStateGuideProps) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 rounded-[20px] bg-[var(--solid-ink)]"
        style={{ transform: 'translate(3px, 4px)' }}
      />
      <div
        className="relative overflow-hidden rounded-[20px] border-2 border-[var(--solid-ink)] px-5 pb-5 pt-6"
        style={{
          background:
            'linear-gradient(160deg, oklch(0.985 0.018 110) 0%, oklch(0.97 0.04 130) 60%, oklch(0.94 0.06 96) 100%)',
        }}
      >
        {/* Decorative shapes */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full"
          style={{ background: 'var(--color-accent)', opacity: 0.10 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full"
          style={{ background: '#f59e0b', opacity: 0.10 }}
        />

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--solid-ink)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            START HERE
          </div>
          <h3 className="mt-2.5 font-display text-[20px] font-black leading-[1.15] tracking-[-0.01em] text-[var(--solid-ink)]">
            最初の単語帳を <br />
            3 ステップで作ろう。
          </h3>
        </div>

        <div className="relative mt-4 flex flex-col gap-2">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.22 }}
              className="relative"
            >
              <div
                aria-hidden
                className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]"
                style={{ transform: 'translate(2px, 2.5px)' }}
              />
              <div className="relative flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)]"
                  style={{ background: s.accentSub, color: s.accent }}
                >
                  <Icon name={s.icon} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-mono text-[9px] font-bold leading-none text-white">
                      {i + 1}
                    </span>
                    <span className="font-display text-[13.5px] font-extrabold text-[var(--solid-ink)]">
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium leading-[1.4] text-[var(--color-ink-muted)]">
                    {s.desc}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="relative mt-5">
          {onStartScan ? (
            <button type="button" onClick={onStartScan} className="relative block w-full">
              <CtaInner />
            </button>
          ) : (
            <Link href="/scan" className="relative block w-full">
              <CtaInner />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function CtaInner() {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
        style={{ transform: 'translate(3px, 3.5px)' }}
      />
      <span className="relative flex items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-3.5 text-[14px] font-bold text-white">
        <Icon name="photo_camera" size={17} />
        最初の1枚を撮影
        <Icon name="arrow_forward" size={15} />
      </span>
    </>
  );
}
