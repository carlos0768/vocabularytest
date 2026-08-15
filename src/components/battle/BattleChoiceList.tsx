'use client';

/**
 * 早押し4択の選択肢。
 *
 * 表示状態は5つ:
 *   idle     … まだ押せる
 *   picked   … 自分が押した直後（判定待ち）
 *   correct  … 決着後、正解だった選択肢
 *   missed   … 決着後、自分が選んで外した選択肢
 *   locked   … 回答権を失った / 決着済みで無関係な選択肢
 *
 * 「押せない理由」は色ではなく主に不透明度で表し、正誤の色（緑・赤）は
 * 決着後だけに使う。回答前に色が出ると答えが透けるため。
 */

import { Icon } from '@/components/ui/Icon';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

type ChoiceState = 'idle' | 'picked' | 'correct' | 'missed' | 'locked';

function resolveState(options: {
  index: number;
  selectedIndex: number | null;
  correctIndex: number | null;
  resolved: boolean;
  canAnswer: boolean;
}): ChoiceState {
  const { index, selectedIndex, correctIndex, resolved, canAnswer } = options;

  if (resolved && correctIndex === index) return 'correct';
  if (resolved && selectedIndex === index) return 'missed';
  if (resolved) return 'locked';
  if (selectedIndex === index) return 'picked';
  return canAnswer ? 'idle' : 'locked';
}

const STATE_CLASSES: Record<ChoiceState, string> = {
  idle: 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]',
  picked:
    'border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)] shadow-none translate-x-px translate-y-px',
  correct:
    'border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-[2px_3px_0_var(--solid-ink)]',
  missed:
    'border-[var(--color-error)] bg-[var(--color-error-light)] text-[var(--color-error)] shadow-none',
  locked:
    'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] opacity-45 shadow-none',
};

const BADGE_CLASSES: Record<ChoiceState, string> = {
  idle: 'border-[var(--solid-ink)] text-[var(--color-muted)]',
  picked: 'border-[var(--solid-ink)] text-[var(--solid-ink)]',
  correct: 'border-white/70 text-white',
  missed: 'border-[var(--color-error)] text-[var(--color-error)]',
  locked: 'border-[var(--solid-ink)] text-[var(--color-muted)]',
};

export function BattleChoiceList({
  choices,
  selectedIndex,
  correctIndex,
  resolved,
  canAnswer,
  onSelect,
}: {
  choices: string[];
  selectedIndex: number | null;
  correctIndex: number | null;
  resolved: boolean;
  canAnswer: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <ul className="grid gap-2.5">
      {choices.map((choice, index) => {
        const state = resolveState({ index, selectedIndex, correctIndex, resolved, canAnswer });

        return (
          <li key={`${index}-${choice}`}>
            <button
              type="button"
              disabled={!canAnswer}
              onClick={() => onSelect(index)}
              aria-label={`選択肢${CHOICE_LABELS[index] ?? index + 1}: ${choice}`}
              className={`flex w-full items-center gap-3 rounded-[14px] border-2 px-3.5 py-3.5 text-left transition-all duration-100 disabled:cursor-default ${STATE_CLASSES[state]}`}
            >
              <span
                className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold ${BADGE_CLASSES[state]}`}
              >
                {CHOICE_LABELS[index] ?? index + 1}
              </span>

              <span className="min-w-0 flex-1 font-display text-[15px] font-bold leading-snug break-words">
                {choice}
              </span>

              {state === 'correct' && <Icon name="check_circle" size={20} className="shrink-0" />}
              {state === 'missed' && <Icon name="cancel" size={20} className="shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
