'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { QuizMode } from '@/lib/quiz/quiz-mode-preference';

const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-ink)]';
const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-ink)]';
const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em] tablet:text-[12px]';

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
    description: '選択肢から意味を選びます。声を出せない場所でも解けます。',
  },
  {
    key: 'voice',
    icon: 'mic',
    title: '声で答える',
    description: '読み上げられた英単語の意味を、声で答えます。マイクを使います。',
  },
];

/**
 * クイズ形式の選択。
 *
 * 端末ごとに一度だけ出す初回の選択画面と、あとから右上のボタンで開く
 * 切り替えの両方に使う。`current` を渡すと、いま選ばれている側に印が付く。
 */
export function QuizModeChooser({
  current,
  onSelect,
  onCancel,
  title = 'クイズの解き方を選んでください',
  description = 'この端末での既定になります。あとからクイズの右上でいつでも変えられます。',
  warning,
}: {
  current?: QuizMode;
  onSelect: (mode: QuizMode) => void;
  /** 初回選択では省略する (戻り先が無いため)。 */
  onCancel?: () => void;
  title?: string;
  description?: string;
  /** 進行中のクイズが失われるときの注意書き。 */
  warning?: string;
}) {
  return (
    <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-6 animate-fade-in-up tablet:max-w-[560px] tablet:p-8')}>
      <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Quiz Mode</p>
      <h2 className="mt-1 font-display text-xl font-black leading-snug text-[var(--solid-ink)] tablet:text-2xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)] tablet:text-base tablet:leading-7">{description}</p>

      {warning && (
        <p className="mt-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--color-warning)] bg-[var(--color-warning-light)] px-3 py-2 text-xs font-bold leading-5 text-[var(--color-warning)]">
          {warning}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {MODES.map((mode) => {
          const isCurrent = current === mode.key;
          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => onSelect(mode.key)}
              aria-current={isCurrent || undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] p-4 text-left transition-all duration-100 active:translate-x-px active:translate-y-px tablet:gap-4 tablet:p-5',
                HARD_SHADOW_SM,
                isCurrent
                  ? 'bg-[var(--color-accent-light)]'
                  : 'bg-[var(--color-surface)]',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)] tablet:h-14 tablet:w-14',
                  isCurrent ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
                )}
              >
                <Icon name={mode.icon} size={22} className="tablet:text-[28px]!" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-display text-base font-black text-[var(--solid-ink)] tablet:text-lg">
                    {mode.title}
                  </span>
                  {isCurrent && (
                    <span className={cn(EYEBROW, 'text-[var(--color-accent)]')}>いま</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--color-muted)] tablet:text-sm tablet:leading-6">
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
          className="mt-4 w-full py-2 text-sm font-bold text-[var(--color-muted)] underline underline-offset-4 tablet:py-3 tablet:text-base"
        >
          このまま続ける
        </button>
      )}
    </div>
  );
}
