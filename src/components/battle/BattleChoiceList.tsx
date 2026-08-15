'use client';

/**
 * 早押し4択。1ラウンド1回しか押せないので、押した瞬間にロックされたことが
 * 見た目で分かるようにしている (自分の選択は決着前でも枠を強調)。
 */

import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

export function BattleChoiceList({
  choices,
  roundKey,
  canAnswer,
  resolved,
  selectedIndex,
  correctIndex,
  onSelect,
}: {
  choices: string[];
  /** ラウンドが変わったら React に別要素として扱わせるためのキー */
  roundKey: number;
  canAnswer: boolean;
  resolved: boolean;
  selectedIndex: number | null;
  correctIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {choices.map((choice, index) => {
        const isSelected = selectedIndex === index;
        const isCorrect = resolved && correctIndex === index;
        const isWrongPick = resolved && isSelected && correctIndex !== index;

        return (
          <button
            key={`${roundKey}-${index}`}
            type="button"
            disabled={!canAnswer}
            onClick={() => {
              triggerHaptic();
              onSelect(index);
            }}
            className={cn(
              'flex w-full items-center gap-3 rounded-[14px] border-2 p-3.5 text-left transition-all duration-100',
              canAnswer && 'active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]',
              isCorrect
                ? 'border-[var(--color-success)] bg-[var(--color-success-light)] shadow-[2px_3px_0_var(--color-success)]'
                : isWrongPick
                  ? 'border-[var(--color-error)] bg-[var(--color-error-light)] shadow-[2px_3px_0_var(--color-error)]'
                  : isSelected
                    ? 'border-[var(--color-accent)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--color-accent)]'
                    : 'border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)]',
              // 押せない理由が「回答済み」でも「決着済み」でも、押せないことは同じに見せる
              !canAnswer && !resolved && !isSelected && 'opacity-55',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-2 font-mono text-[12px] font-bold',
                isCorrect
                  ? 'border-[var(--color-success)] bg-[var(--color-success)] text-white'
                  : isWrongPick
                    ? 'border-[var(--color-error)] bg-[var(--color-error)] text-white'
                    : 'border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
              )}
            >
              {CHOICE_LABELS[index] ?? index + 1}
            </span>

            <span className="min-w-0 flex-1 break-words text-[15px] font-bold leading-snug text-[var(--solid-ink)]">
              {choice}
            </span>

            {(isCorrect || isWrongPick) && (
              <Icon
                name={isCorrect ? 'check' : 'close'}
                size={18}
                className={isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
