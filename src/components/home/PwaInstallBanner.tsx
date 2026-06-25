'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import {
  pwaPromptUtils,
  triggerNativeInstall,
} from '@/components/onboarding/PwaInstallPromptModal';

const DISMISSED_KEY = 'merken_pwa_home_banner_dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function getInitialBannerState(): {
  visible: boolean;
  variant: 'native' | 'ios' | null;
} {
  if (pwaPromptUtils.isStandalone() || pwaPromptUtils.isInstalled() || isDismissed()) {
    return { visible: false, variant: null };
  }

  if (pwaPromptUtils.hasDeferredPrompt()) {
    return { visible: true, variant: 'native' };
  }

  if (pwaPromptUtils.isIos()) {
    return { visible: true, variant: 'ios' };
  }

  return { visible: false, variant: null };
}

export function PwaInstallBanner() {
  const [{ visible, variant }, setBannerState] = useState(getInitialBannerState);

  const dismiss = useCallback(() => {
    setBannerState((state) => ({ ...state, visible: false }));
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch { /* ignore */ }
  }, []);

  const handleInstall = useCallback(async () => {
    await triggerNativeInstall();
    setBannerState((state) => ({ ...state, visible: false }));
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch { /* ignore */ }
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="overflow-hidden px-[18px] pb-3"
        >
          <div
            className="relative overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] px-4 pb-4 pt-4"
            style={{
              background:
                'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 50%, #fefce8 100%)',
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[var(--color-accent)] opacity-[0.07]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-[#10b981] opacity-[0.07]"
            />

            <button
              type="button"
              onClick={dismiss}
              aria-label="閉じる"
              className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--solid-ink)]/30 bg-white/80 text-[var(--solid-ink)] backdrop-blur-sm"
            >
              <Icon name="close" size={13} />
            </button>

            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-white shadow-[2px_2px_0_rgba(0,0,0,0.08)]">
                <Icon name="install_mobile" size={22} className="text-[var(--color-accent)]" />
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <h3 className="font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
                  ホーム画面に追加
                </h3>
                <p className="mt-1 text-[12px] leading-[1.5] text-[var(--solid-ink)]/70">
                  ブラウザを開かずに1タップで起動できます。
                </p>
              </div>
            </div>

            {variant === 'ios' && (
              <div className="mt-3 rounded-[10px] border border-dashed border-[var(--solid-ink)]/20 bg-white/60 px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--solid-ink)]">
                <div className="flex items-start gap-2">
                  <Icon
                    name="ios_share"
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--color-accent)]"
                  />
                  <div>
                    Safari の<span className="font-bold"> 共有 </span>ボタン →
                    <span className="font-bold"> 「ホーム画面に追加」</span>を選択
                  </div>
                </div>
              </div>
            )}

            {variant === 'native' && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[12px] font-bold text-[var(--solid-ink)]"
                >
                  あとで
                </button>
                <button
                  type="button"
                  onClick={handleInstall}
                  className="flex-[1.4] rounded-[10px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] px-3 py-2.5 text-[12px] font-bold text-white shadow-[2px_2px_0_var(--color-accent-ink)]"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Icon name="download" size={14} />
                    インストール
                  </span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
