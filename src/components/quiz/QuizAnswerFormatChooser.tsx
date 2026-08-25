'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { QuizAnswerFormat } from '@/lib/quiz/quiz-answer-format';

const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-ink)]';
const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-ink)]';
const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em]';

const FORMATS: ReadonlyArray<{
  key: QuizAnswerFormat;
  icon: string;
  title: string;
  description: string;
}> = [
  {
    key: 'choice',
    icon: 'list',
    title: '四択で答える',
    description: '4つの選択肢から選びます。さっと解きたいときに。',
  },
  {
    key: 'typing',
    icon: 'keyboard',
    title: '文字を入力して答える',
    description: '日本語を見て、英単語をつづりまで入力します。',
  },
];

/**
 * 回答形式 (四択 / 入力) の選択。
 *
 * クイズを始めるたびに出す。`last` を渡すと前回選んだ側に印が付くが、
 * それはあくまで目印で、押さないと始まらない ——毎回選べることが要件なので、
 * 前回の選択で自動的に始めてはいけない。
 */
export function QuizAnswerFormatChooser({
  last,
  onSelect,
  onCancel,
  title = '回答の形式を選んでください',
  description = 'この回だけの設定です。次にクイズを始めるときも選べます。',
}: {
  last?: QuizAnswerFormat | null;
  onSelect: (format: QuizAnswerFormat) => void;
  /** クイズ開始前の選択では省略する (戻り先が無いため)。 */
  onCancel?: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-6 animate-fade-in-up')}>
      <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Answer Format</p>
      <h2 className="mt-1 font-display text-xl font-black leading-snug text-[var(--solid-ink)]">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>

      <div className="mt-5 space-y-3">
        {FORMATS.map((format) => {
          const isLast = last === format.key;
          return (
            <button
              key={format.key}
              type="button"
              onClick={() => onSelect(format.key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] p-4 text-left transition-all duration-100 active:translate-x-px active:translate-y-px',
                HARD_SHADOW_SM,
                isLast ? 'bg-[var(--color-accent-light)]' : 'bg-[var(--color-surface)]',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)]',
                  isLast
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
                )}
              >
                <Icon name={format.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-display text-base font-black text-[var(--solid-ink)]">
                    {format.title}
                  </span>
                  {isLast && (
                    <span className={cn(EYEBROW, 'text-[var(--color-accent)]')}>前回</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--color-muted)]">
                  {format.description}
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
