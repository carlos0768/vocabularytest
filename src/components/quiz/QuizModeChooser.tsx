'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { QuizMode } from '@/lib/quiz/quiz-mode-preference';

const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-shadow)]';
const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-shadow)]';
const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em]';

const MODES: ReadonlyArray<{
  key: QuizMode;
  icon: string;
  title: string;
  description: string;
}> = [
  {
    key: 'normal',
    icon: 'list',
    title: '四択で解く',
    description: '選択肢から答えを選びます。入力も声も要りません。',
  },
  {
    key: 'typing',
    icon: 'keyboard',
    title: '記述で解く',
    description: '日本語の意味を見て、英単語のつづりを入力します。',
  },
  {
    key: 'voice',
    icon: 'mic',
    title: '声で答える',
    description: '読み上げられた問題に、声で答えます。マイクを使います。',
  },
];

/**
 * クイズの解き方の選択。
 *
 * クイズを始めるたびに出す選択画面と、あとから右上のボタンで開く切り替えの
 * 両方に使う。`current` を渡すと、その形式に印が付く (始める前は前回この端末で
 * 選んだ形式、解いている最中はいま解いている形式)。
 */
export function QuizModeChooser({
  current,
  onSelect,
  onCancel,
  title = 'クイズの解き方を選んでください',
  description = '毎回ここで選べます。前回選んだ形式を最初から選んだ状態にしています。',
  warning,
  hiddenModes,
  currentLabel = 'いま',
}: {
  current?: QuizMode;
  onSelect: (mode: QuizMode) => void;
  /** 戻り先が無いときは省略する。 */
  onCancel?: () => void;
  title?: string;
  description?: string;
  /** 進行中のクイズが失われるときの注意書き。 */
  warning?: string;
  /**
   * この出題では選べない形式。
   * 復習や「今日の学習」のような単語帳をまたぐ出題は音読チャレンジに送れないので、
   * 選べない札を並べて空振りさせるより、はじめから出さない。
   */
  hiddenModes?: readonly QuizMode[];
  /** `current` に付ける印の文言。始める前は前回の選択なので「いま」ではない。 */
  currentLabel?: string;
}) {
  const modes = hiddenModes?.length
    ? MODES.filter((mode) => !hiddenModes.includes(mode.key))
    : MODES;

  return (
    <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-6 animate-fade-in-up')}>
      <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Quiz Mode</p>
      <h2 className="mt-1 font-display text-xl font-black leading-snug text-[var(--solid-ink)]">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>

      {warning && (
        <p className="mt-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--color-warning)] bg-[var(--color-warning-light)] px-3 py-2 text-xs font-bold leading-5 text-[var(--color-warning)]">
          {warning}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {modes.map((mode) => {
          const isCurrent = current === mode.key;
          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => onSelect(mode.key)}
              aria-current={isCurrent || undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] p-4 text-left transition-all duration-100 active:translate-x-px active:translate-y-px',
                HARD_SHADOW_SM,
                isCurrent
                  ? 'bg-[var(--color-accent-light)]'
                  : 'bg-[var(--color-surface)]',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)]',
                  isCurrent ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
                )}
              >
                <Icon name={mode.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-display text-base font-black text-[var(--solid-ink)]">
                    {mode.title}
                  </span>
                  {isCurrent && (
                    <span className={cn(EYEBROW, 'text-[var(--color-accent)]')}>{currentLabel}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--color-muted)]">
                  {mode.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full py-2 text-sm font-bold text-[var(--color-muted)] underline underline-offset-4"
        >
          このまま続ける
        </button>
      )}
    </div>
  );
}
