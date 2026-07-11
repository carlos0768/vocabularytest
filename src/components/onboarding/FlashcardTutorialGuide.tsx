'use client';

import { Icon } from '@/components/ui/Icon';

interface FlashcardTutorialGuideProps {
  /** Number of cards the user has seen so far (1-based). */
  seen: number;
  /** Target number of cards to view before prompting a return. */
  target: number;
  /** Called when the user taps "単語帳に戻る" on the completion modal. */
  onReturn: () => void;
}

/**
 * Onboarding overlay for the flashcard page. Shows a live progress hint while
 * the user flips through cards, then a deliberately non-dismissible modal once
 * the target is reached, forcing them back to the wordbook to take the quiz.
 */
export function FlashcardTutorialGuide({ seen, target, onReturn }: FlashcardTutorialGuideProps) {
  const reached = seen >= target;

  if (!reached) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 z-[9998] flex justify-center px-4"
        style={{ top: 'max(64px, calc(env(safe-area-inset-top) + 60px))' }}
      >
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-[var(--solid-ink)]"
            style={{ transform: 'translate(2px, 2.5px)' }}
          />
          <div className="relative flex items-center gap-2 rounded-full border-2 border-[var(--solid-ink)] bg-white px-3.5 py-2">
            <Icon name="style" size={15} className="text-[var(--color-accent)]" />
            <span className="text-[12px] font-bold text-[var(--solid-ink)]">
              カードを{target}枚見てみましょう
            </span>
            <span className="font-mono text-[12px] font-bold tabular-nums text-[var(--color-muted)]">
              {Math.min(seen, target)}/{target}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label="フラッシュカード完了"
    >
      {/* Non-dismissive backdrop (no click handler). */}
      <div className="absolute inset-0 bg-[rgba(26,26,26,0.55)] backdrop-blur-[2px]" />

      <div className="relative w-full max-w-[340px]">
        <div
          aria-hidden
          className="absolute inset-0 rounded-[18px] bg-[var(--solid-ink)]"
          style={{ transform: 'translate(4px, 4.5px)' }}
        />
        <div className="relative overflow-hidden rounded-[18px] border-2 border-[var(--solid-ink)] bg-white px-5 pb-5 pt-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white">
            <Icon name="check" size={24} />
          </div>
          <h2 className="mt-3 font-display text-[19px] font-black leading-tight text-[var(--solid-ink)]">
            {target}枚見ました！
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.6] text-[var(--color-ink-muted)]">
            単語帳に戻って、今度はクイズで覚えているか試してみましょう。
          </p>

          <button
            type="button"
            onClick={onReturn}
            className="relative mt-5 block w-full"
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-[12px] bg-[var(--solid-ink)]"
              style={{ transform: 'translate(3px, 3.5px)' }}
            />
            <span className="relative flex items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 text-[14px] font-bold text-white">
              <Icon name="arrow_back" size={16} />
              単語帳に戻る
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
