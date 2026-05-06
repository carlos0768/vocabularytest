'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

interface WelcomeOverlayProps {
  open: boolean;
  /** Called whenever overlay closes (skip or proceed). Parent decides whether to remount. */
  onClose?: () => void;
  /** Called when the user explicitly skips onboarding. */
  onSkip: () => void;
  /**
   * Optional callback for the primary CTA. When provided, the overlay calls
   * this instead of navigating to `/scan` — lets the parent open its own
   * ScanCaptureModal so the user lands directly on the camera/library picker.
   */
  onStartScan?: () => void;
}

const STEP_CARDS = [
  {
    icon: 'photo_camera',
    label: '撮る',
    desc: 'ノートや本をパシャッと撮影',
    accent: '#15803d',
    accentSub: '#dcfce7',
    rotate: -1.2,
  },
  {
    icon: 'edit_note',
    label: '確認',
    desc: 'AIが英単語と訳をスッと抽出',
    accent: '#b45309',
    accentSub: '#fef3c7',
    rotate: 0.8,
  },
  {
    icon: 'psychology',
    label: '覚える',
    desc: '４択クイズで記憶にしっかり定着',
    accent: '#6d28d9',
    accentSub: '#ede9fe',
    rotate: -0.6,
  },
] as const;

const CONFETTI = [
  { x: '6%',  y: '10%', size: 10, color: '#15803d', delay: 0.05, rotate: -8 },
  { x: '92%', y: '8%',  size: 8,  color: '#b45309', delay: 0.12, rotate: 12 },
  { x: '14%', y: '88%', size: 7,  color: '#6d28d9', delay: 0.18, rotate: 22 },
  { x: '88%', y: '85%', size: 12, color: '#dc2626', delay: 0.10, rotate: -14 },
  { x: '50%', y: '4%',  size: 6,  color: '#15803d', delay: 0.20, rotate: 4 },
  { x: '4%',  y: '52%', size: 6,  color: '#1e3a8a', delay: 0.16, rotate: -22 },
  { x: '95%', y: '48%', size: 9,  color: '#9f1239', delay: 0.22, rotate: 8 },
] as const;

export function WelcomeOverlay({ open, onClose, onSkip, onStartScan }: WelcomeOverlayProps) {
  const router = useRouter();

  // Body scroll lock while open.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleSkip = () => {
    onSkip();
    onClose?.();
  };

  const handleStartScan = () => {
    onClose?.();
    if (onStartScan) {
      onStartScan();
      return;
    }
    router.push('/scan');
  };

  const decorations = useMemo(() => CONFETTI, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="welcome-overlay"
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-modal="true"
          role="dialog"
          aria-label="ようこそ"
        >
          {/* Backdrop — non-dismissive (no click handler) */}
          <div className="absolute inset-0 bg-[rgba(26,26,26,0.55)] backdrop-blur-[2px]" />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-[420px]"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            {/* Hard-shadow plate */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-[24px] bg-[var(--solid-ink)]"
              style={{ transform: 'translate(4.5px, 5px)' }}
            />

            {/* Card */}
            <div
              className="relative overflow-hidden rounded-[24px] border-[1.5px] border-[var(--solid-ink)]"
              style={{
                background:
                  'linear-gradient(168deg, oklch(0.985 0.018 110) 0%, oklch(0.97 0.04 130) 55%, oklch(0.94 0.06 96) 100%)',
              }}
            >
              {/* Decorative confetti dots */}
              {decorations.map((c, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute rounded-[2px]"
                  style={{
                    left: c.x,
                    top: c.y,
                    width: c.size,
                    height: c.size,
                    background: c.color,
                    border: '1px solid var(--solid-ink)',
                  }}
                  initial={{ opacity: 0, scale: 0, rotate: 0 }}
                  animate={{ opacity: 1, scale: 1, rotate: c.rotate }}
                  transition={{ delay: 0.18 + c.delay, type: 'spring', stiffness: 260, damping: 18 }}
                />
              ))}

              {/* Floating accent blobs */}
              <div
                aria-hidden
                className="pointer-events-none absolute -left-12 -top-10 h-32 w-32 rounded-full"
                style={{ background: 'var(--color-accent)', opacity: 0.08 }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 top-32 h-40 w-40 rounded-full"
                style={{ background: '#f59e0b', opacity: 0.10 }}
              />

              {/* Close (skip) */}
              <button
                type="button"
                onClick={handleSkip}
                aria-label="スキップ"
                className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none"
              >
                <Icon name="close" size={16} />
              </button>

              <div className="relative px-6 pb-6 pt-7">
                {/* Logo + greeting */}
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-display text-[15px] font-black tracking-[0.14em] text-[var(--solid-ink)]">
                    MERKEN
                  </span>
                  <span className="inline-block h-[5px] w-[5px] -translate-y-[2px] bg-[var(--color-accent)]" />
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-2 py-[2px] font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--solid-ink)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                    HELLO
                  </span>
                </div>

                <motion.h1
                  className="mt-3 font-display text-[28px] font-black leading-[1.1] tracking-[-0.01em] text-[var(--solid-ink)]"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.25 }}
                >
                  ようこそ。
                </motion.h1>
                <motion.p
                  className="mt-1 font-display text-[18px] font-extrabold leading-[1.3] text-[var(--solid-ink)]"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14, duration: 0.25 }}
                >
                  3 ステップではじめよう。
                </motion.p>

                {/* Step cards */}
                <div className="mt-5 flex flex-col gap-2.5">
                  {STEP_CARDS.map((card, i) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 12, rotate: 0 }}
                      animate={{ opacity: 1, y: 0, rotate: card.rotate }}
                      transition={{ delay: 0.22 + i * 0.08, type: 'spring', stiffness: 220, damping: 20 }}
                      className="relative"
                    >
                      <div
                        aria-hidden
                        className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
                        style={{ transform: 'translate(2.5px, 3px)' }}
                      />
                      <div className="relative flex items-center gap-3 rounded-[14px] border-[1.5px] border-[var(--solid-ink)] bg-white px-3 py-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-[1.5px] border-[var(--solid-ink)] shadow-[1.5px_1.5px_0_var(--solid-ink)]"
                          style={{ background: card.accentSub, color: card.accent }}
                        >
                          <Icon name={card.icon} size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] font-mono text-[10px] font-bold leading-none text-white">
                              {i + 1}
                            </span>
                            <span className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
                              {card.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] font-medium leading-[1.45] text-[var(--color-ink-muted)]">
                            {card.desc}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Primary CTA */}
                <motion.button
                  type="button"
                  onClick={handleStartScan}
                  className="relative mt-6 block w-full"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.22 }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
                    style={{ transform: 'translate(3px, 3.5px)' }}
                  />
                  <span className="relative flex items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-[14px] text-[15px] font-bold text-white">
                    <Icon name="photo_camera" size={18} />
                    最初の1枚を撮影
                    <Icon name="arrow_forward" size={16} />
                  </span>
                </motion.button>

                <motion.button
                  type="button"
                  onClick={handleSkip}
                  className="mx-auto mt-3 block text-[12px] font-semibold text-[var(--color-muted)] underline-offset-2 hover:underline"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.58 }}
                >
                  あとで
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
