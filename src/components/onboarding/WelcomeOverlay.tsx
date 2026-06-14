'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

interface WelcomeOverlayProps {
  open: boolean;
  onClose?: () => void;
  onSkip: () => void;
  onStartScan?: () => void;
}

const PAGES = [
  {
    image: '/images/onboarding/step1.png',
    badge: 'STEP 1',
    title: '単語帳を作成する',
    description:
      '「写真でスキャン」を選ぶと、AIがノートや教材から英単語と意味を自動で抽出します。共有ライブラリや手動入力でも作成できます。',
    accent: '#15803d',
  },
  {
    image: '/images/onboarding/step2.png',
    badge: 'STEP 2',
    title: 'スキャンオプションを選ぶ',
    description:
      '丸囲み・英検・熟語・すべての単語から抽出モードを選択。目的に合わせて効率よく単語を取り込めます。',
    accent: '#b45309',
  },
  {
    image: '/images/onboarding/step3.png',
    badge: 'STEP 3',
    title: '複数ページをまとめて撮影',
    description:
      'カメラで連続撮影、またはライブラリから複数枚選択。教材のページをまとめてスキャンし、一冊分の単語帳を一度に作れます。',
    accent: '#6d28d9',
  },
] as const;

const SWIPE_THRESHOLD = 50;

export function WelcomeOverlay({ open, onClose, onSkip, onStartScan }: WelcomeOverlayProps) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPage(0);
  }, [open]);

  const goTo = useCallback((next: number) => {
    setDirection(next > page ? 1 : -1);
    setPage(next);
  }, [page]);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD && page < PAGES.length - 1) {
      goTo(page + 1);
    } else if (info.offset.x > SWIPE_THRESHOLD && page > 0) {
      goTo(page - 1);
    }
  }, [page, goTo]);

  const handleSkip = () => {
    onSkip();
    onClose?.();
  };

  const handleStart = () => {
    onClose?.();
    if (onStartScan) {
      onStartScan();
      return;
    }
    router.push('/scan');
  };

  const isLast = page === PAGES.length - 1;
  const current = PAGES[page];

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="welcome-overlay"
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-modal="true"
          role="dialog"
          aria-label="使い方ガイド"
        >
          <div className="absolute inset-0 bg-[rgba(26,26,26,0.55)] backdrop-blur-[2px]" />

          <motion.div
            className="relative flex w-full max-w-[420px] flex-col sm:mx-4"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            {/* Hard-shadow plate */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-t-[24px] bg-[var(--solid-ink)] sm:rounded-[24px]"
              style={{ transform: 'translate(4px, 4.5px)' }}
            />

            {/* Card */}
            <div
              ref={containerRef}
              className="relative overflow-hidden rounded-t-[24px] border-[1.5px] border-[var(--solid-ink)] bg-white sm:rounded-[24px]"
            >
              {/* Skip button */}
              <button
                type="button"
                onClick={handleSkip}
                aria-label="スキップ"
                className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none"
              >
                <Icon name="close" size={16} />
              </button>

              {/* Swipeable content area */}
              <div className="relative overflow-hidden">
                <AnimatePresence initial={false} custom={direction} mode="popLayout">
                  <motion.div
                    key={page}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.15}
                    onDragEnd={handleDragEnd}
                    className="flex w-full flex-col"
                  >
                    {/* Screenshot image */}
                    <div className="relative mx-auto mt-5 w-[85%] overflow-hidden rounded-[16px] border-[1.5px] border-[var(--solid-ink)] bg-[#f5f3ee] shadow-[3px_3px_0_var(--solid-ink)]">
                      <div className="relative aspect-[9/16] w-full">
                        <Image
                          src={current.image}
                          alt={current.title}
                          fill
                          className="object-cover"
                          sizes="340px"
                          priority={page === 0}
                        />
                      </div>
                    </div>

                    {/* Text content */}
                    <div className="px-6 pb-2 pt-4">
                      <span
                        className="mb-1.5 inline-flex items-center gap-1 rounded-full border-[1.25px] border-[var(--solid-ink)] px-2.5 py-[3px] font-mono text-[10px] font-bold tracking-[0.08em]"
                        style={{ background: current.accent, color: '#fff' }}
                      >
                        {current.badge}
                      </span>
                      <h2 className="mt-2 font-display text-[22px] font-black leading-[1.2] text-[var(--solid-ink)]">
                        {current.title}
                      </h2>
                      <p className="mt-1.5 text-[13px] font-medium leading-[1.6] text-[var(--color-ink-muted)]">
                        {current.description}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation area */}
              <div className="relative px-6 pb-6 pt-3">
                {/* Dot indicators */}
                <div className="mb-4 flex items-center justify-center gap-2">
                  {PAGES.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`ページ ${i + 1}`}
                      className="relative h-2.5 rounded-full border-[1.25px] border-[var(--solid-ink)] transition-all duration-200"
                      style={{
                        width: i === page ? 24 : 10,
                        background: i === page ? current.accent : '#e5e5e5',
                      }}
                    />
                  ))}
                </div>

                {/* CTA button */}
                {isLast ? (
                  <button
                    type="button"
                    onClick={handleStart}
                    className="relative block w-full"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
                      style={{ transform: 'translate(3px, 3.5px)' }}
                    />
                    <span className="relative flex items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-[14px] text-[15px] font-bold text-white">
                      <Icon name="photo_camera" size={18} />
                      さっそく始める
                      <Icon name="arrow_forward" size={16} />
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(page + 1)}
                    className="relative block w-full"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
                      style={{ transform: 'translate(3px, 3.5px)' }}
                    />
                    <span
                      className="relative flex items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[var(--solid-ink)] px-5 py-[14px] text-[15px] font-bold text-white"
                      style={{ background: current.accent }}
                    >
                      次へ
                      <Icon name="arrow_forward" size={16} />
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSkip}
                  className="mx-auto mt-3 block text-[12px] font-semibold text-[var(--color-muted)] underline-offset-2 hover:underline"
                >
                  スキップ
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
