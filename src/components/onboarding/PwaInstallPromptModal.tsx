'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

const LAST_PROMPT_KEY = 'merken_pwa_prompt_last_at';
const INSTALLED_KEY = 'merken_pwa_installed';
const MIN_GAP_MS = 24 * 60 * 60 * 1000; // 24h

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    cachedDeferredPrompt = event as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    try {
      localStorage.setItem(INSTALLED_KEY, '1');
    } catch {
      /* ignore */
    }
    cachedDeferredPrompt = null;
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari fallback
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

function recordPrompted() {
  try {
    localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function wasRecentlyPrompted(): boolean {
  try {
    const raw = localStorage.getItem(LAST_PROMPT_KEY);
    if (!raw) return false;
    const ts = Number.parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < MIN_GAP_MS;
  } catch {
    return false;
  }
}

interface PwaInstallPromptModalProps {
  open: boolean;
  onClose: () => void;
}

export function PwaInstallPromptModal({ open, onClose }: PwaInstallPromptModalProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [variant, setVariant] = useState<'native' | 'ios' | 'unsupported'>('unsupported');

  useEffect(() => {
    if (!open) {
      setShouldRender(false);
      return;
    }
    if (isStandalone()) {
      onClose();
      return;
    }
    if (wasRecentlyPrompted()) {
      onClose();
      return;
    }
    if (cachedDeferredPrompt) {
      setVariant('native');
      setShouldRender(true);
      recordPrompted();
      return;
    }
    if (isIos()) {
      setVariant('ios');
      setShouldRender(true);
      recordPrompted();
      return;
    }
    // No installable signal — close silently
    onClose();
  }, [open, onClose]);

  const handleInstall = async () => {
    if (!cachedDeferredPrompt) {
      onClose();
      return;
    }
    try {
      await cachedDeferredPrompt.prompt();
      const choice = await cachedDeferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        try {
          localStorage.setItem(INSTALLED_KEY, '1');
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    } finally {
      cachedDeferredPrompt = null;
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          key="pwa-prompt"
          className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-6 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(26,26,26,0.5)]"
          />
          <motion.div
            className="relative w-full max-w-[400px]"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            <div
              aria-hidden
              className="absolute inset-0 rounded-[20px] bg-[var(--solid-ink)]"
              style={{ transform: 'translate(3.5px, 4px)' }}
            />
            <div
              className="relative overflow-hidden rounded-[20px] border-[1.5px] border-[var(--solid-ink)] px-5 pb-5 pt-6"
              style={{
                background:
                  'linear-gradient(160deg, oklch(0.985 0.018 110) 0%, oklch(0.96 0.04 130) 100%)',
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full"
                style={{ background: 'var(--color-accent)', opacity: 0.10 }}
              />

              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
              >
                <Icon name="close" size={14} />
              </button>

              <div className="inline-flex items-center gap-1.5 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-2.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--solid-ink)] shadow-[1.5px_1.5px_0_var(--solid-ink)]">
                <Icon name="celebration" size={11} filled />
                クイズ完了！
              </div>

              <h2 className="mt-3 font-display text-[20px] font-black leading-[1.15] text-[var(--solid-ink)]">
                ホーム画面に追加して<br />
                いつでもサッと学習。
              </h2>
              <p className="mt-2 text-[12px] leading-[1.55] text-[var(--color-ink-muted)]">
                MERKEN をアプリとしてインストールすると、ブラウザを開かずに 1 タップで起動できます。
              </p>

              {variant === 'ios' ? (
                <div className="mt-4 rounded-[12px] border-[1.25px] border-dashed border-[var(--solid-ink)] bg-white/70 p-3.5 text-[12px] leading-[1.6] text-[var(--solid-ink)]">
                  <div className="flex items-start gap-2">
                    <Icon name="ios_share" size={16} className="mt-0.5 text-[var(--color-accent)]" />
                    <div>
                      Safari の <span className="font-bold">共有</span> ボタンをタップ →
                      <span className="font-bold"> 「ホーム画面に追加」</span> を選択してください。
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-3 text-[12px] font-bold text-[var(--solid-ink)]"
                >
                  あとで
                </button>
                {variant === 'native' && (
                  <button type="button" onClick={handleInstall} className="relative flex-[1.4]">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]"
                      style={{ transform: 'translate(2.5px, 3px)' }}
                    />
                    <span className="relative flex items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-3 text-[13px] font-bold text-white">
                      <Icon name="download" size={15} />
                      インストール
                    </span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const pwaPromptUtils = {
  isStandalone,
  hasDeferredPrompt: () => cachedDeferredPrompt !== null,
};
