'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { buildLineShareUrl, buildXIntentUrl } from '@/lib/shared-projects/group-share';
import { EIKEN_LEVEL_LABELS } from '@/lib/level-test/engine';
import type { LevelTestResultPayload } from '@/lib/level-test/result-code';
import { buildLevelTestShareMessages, buildLevelTestShareUrl } from '@/lib/level-test/share';

// 診断結果のシェアシート。groups/[groupId] の GroupInviteShareSheet と同じ
// 操作感(ネイティブ共有が主CTA + X/LINE/Instagram/リンクコピー)。

export function LevelTestShareSheet({
  open,
  code,
  payload,
  onClose,
}: {
  open: boolean;
  code: string;
  payload: LevelTestResultPayload;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.merken.jp';
    return buildLevelTestShareUrl(origin, code);
  }, [code]);

  const messages = useMemo(
    () => buildLevelTestShareMessages(payload, shareUrl),
    [payload, shareUrl],
  );

  if (!open) return null;

  const grade = EIKEN_LEVEL_LABELS[payload.finalLevel] ?? EIKEN_LEVEL_LABELS[0];

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ message, type: 'success' });
    } catch {
      showToast({ message: 'コピーに失敗しました', type: 'error' });
    }
  };

  const openIntent = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = async () => {
    triggerHaptic();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `語彙レベル診断: ${grade}`, text: messages.native, url: shareUrl });
        return;
      } catch (error) {
        const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
        if (name === 'AbortError') return;
      }
    }
    await copy(`${messages.native}\n${shareUrl}`, 'シェア文をコピーしました');
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 520,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(82vh, 680px)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">SHARE RESULT</div>
              <div className="mt-0.5 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
                {grade}レベルを自慢しよう
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <p className="mb-3 text-[12px] font-bold leading-relaxed text-[var(--color-muted)]">
            リンクをシェアすると、判定レベルと推定語彙数入りの結果カードが表示されます。
          </p>

          {/* ネイティブ共有 — 主CTA。Instagramを含む全アプリに届く */}
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 font-display text-[14px] font-extrabold text-white shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            <Icon name="ios_share" size={18} />
            結果をシェアする
          </button>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <ShareChannelButton
              label="X"
              bg="#000000"
              onClick={() => { triggerHaptic(); openIntent(buildXIntentUrl(shareUrl, messages.x)); }}
              icon={<XBrandIcon />}
            />
            <ShareChannelButton
              label="LINE"
              bg="#06C755"
              onClick={() => { triggerHaptic(); openIntent(buildLineShareUrl(shareUrl, messages.line)); }}
              icon={<LineBrandIcon />}
            />
            <ShareChannelButton
              label="Instagram"
              bg="linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)"
              onClick={() => { triggerHaptic(); void copy(messages.instagram, 'キャプションをコピーしました。Instagramに貼り付けてね'); }}
              icon={<InstagramBrandIcon />}
            />
          </div>

          {/* リンクコピー */}
          <button
            type="button"
            onClick={() => { triggerHaptic(); void copy(shareUrl, '結果リンクをコピーしました'); }}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-bold text-[var(--color-muted)]">{shareUrl}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-[var(--solid-ink)] px-2.5 py-1.5 text-[11px] font-extrabold text-white">
              <Icon name="content_copy" size={13} />リンク
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareChannelButton({
  label,
  bg,
  icon,
  onClick,
}: {
  label: string;
  bg: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-1 py-2.5 transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] text-white"
        style={{ background: bg }}
      >
        {icon}
      </span>
      <span className="truncate text-[10px] font-extrabold text-[var(--solid-ink)]">{label}</span>
    </button>
  );
}

function XBrandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function LineBrandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 5.69 2 10.243c0 4.08 3.548 7.496 8.34 8.143.325.07.767.214.879.492.1.252.066.647.032.902l-.142.853c-.043.252-.2.987.864.538 1.064-.449 5.74-3.38 7.832-5.788C21.36 13.715 22 12.06 22 10.243 22 5.69 17.523 2 12 2ZM8.07 12.79H6.083a.526.526 0 0 1-.526-.525V8.287a.526.526 0 0 1 1.052 0v3.452H8.07a.526.526 0 0 1 0 1.051Zm2.06-.525a.526.526 0 0 1-1.052 0V8.287a.526.526 0 0 1 1.052 0v3.978Zm4.793 0a.526.526 0 0 1-.36.498.53.53 0 0 1-.166.027.524.524 0 0 1-.425-.21l-2.037-2.773v2.458a.526.526 0 0 1-1.052 0V8.287a.525.525 0 0 1 .948-.31l2.037 2.774V8.287a.526.526 0 0 1 1.052 0v3.978Zm3.218-2.515a.526.526 0 0 1 0 1.052h-1.46v.937h1.46a.526.526 0 0 1 0 1.051h-1.986a.527.527 0 0 1-.526-.525V8.287a.526.526 0 0 1 .526-.525h1.986a.526.526 0 0 1 0 1.051h-1.46v.937h1.46Z" />
    </svg>
  );
}

function InstagramBrandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.94c-3.15 0-3.52.01-4.76.07-1.15.05-1.77.24-2.19.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.42-.35 1.04-.4 2.19-.06 1.24-.07 1.61-.07 4.76s.01 3.52.07 4.76c.05 1.15.24 1.77.4 2.19.22.55.47.94.88 1.35.41.41.8.66 1.35.88.42.16 1.04.35 2.19.4 1.24.06 1.61.07 4.76.07s3.52-.01 4.76-.07c1.15-.05 1.77-.24 2.19-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.42.35-1.04.4-2.19.06-1.24.07-1.61.07-4.76s-.01-3.52-.07-4.76c-.05-1.15-.24-1.77-.4-2.19a3.64 3.64 0 0 0-.88-1.35 3.64 3.64 0 0 0-1.35-.88c-.42-.16-1.04-.35-2.19-.4-1.24-.06-1.61-.07-4.76-.07Zm0 3.3a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Zm0 7.59a2.99 2.99 0 1 0 0-5.98 2.99 2.99 0 0 0 0 5.98Zm5.86-7.81a1.08 1.08 0 1 1-2.15 0 1.08 1.08 0 0 1 2.15 0Z" />
    </svg>
  );
}
