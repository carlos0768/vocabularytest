'use client';

import { useRef, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/Icon';

export type TypeInQuizFieldResult = 'correct' | 'wrong' | null;

const SPACE_RE = /[\s　]/;

type Slot = { kind: 'char'; index: number } | { kind: 'gap' };

export interface TypeInQuizFieldProps {
  /** Expected answer (length drives slots / underscores). */
  answer: string;
  /**
   * Treat spaces in `answer` as visual gaps in the underscore line instead of
   * typeable slots (idiom/active quizzes where input is space-stripped).
   */
  spaceAsGap?: boolean;
  value: string;
  onChange: (value: string) => void;
  normalizeInput?: (value: string) => string;
  onSubmit: () => void;
  disabled: boolean;
  result: TypeInQuizFieldResult;
  /**
   * 'plain' (default): original bordered field, used on desktop.
   * 'solid': Merken Solid style (ink border + offset shadow plate, solid
   * accent/error face with white text on reveal), used on mobile.
   */
  variant?: 'plain' | 'solid';
}

/**
 * Typing quiz field: bold characters for input, gray first-letter hint, underscores for remaining slots.
 */
export function TypeInQuizField({
  answer,
  spaceAsGap = false,
  value,
  onChange,
  normalizeInput,
  onSubmit,
  disabled,
  result,
  variant = 'plain',
}: TypeInQuizFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const target: string[] = [];
  const slots: Slot[] = [];
  for (const ch of answer) {
    if (spaceAsGap && SPACE_RE.test(ch)) {
      if (slots.length > 0 && slots[slots.length - 1].kind !== 'gap') {
        slots.push({ kind: 'gap' });
      }
    } else {
      slots.push({ kind: 'char', index: target.length });
      target.push(ch);
    }
  }
  const typed = [...value];
  const n = target.length;
  const visibleTyped = typed.slice(0, n);
  const t = visibleTyped.length;
  const isSolid = variant === 'solid';

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = normalizeInput ? normalizeInput(e.target.value) : e.target.value;
    if (n > 0 && v.length > n) {
      v = v.slice(0, n);
    }
    onChange(v);
  };

  const plainBorderClass =
    result === 'correct'
      ? 'border-[var(--color-accent-ink)] bg-[var(--color-accent)]'
      : result === 'wrong'
        ? 'border-[#b91c1c] bg-[var(--color-error)]'
        : 'border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-foreground)]';

  const typedColorClass = isSolid
    ? result === 'correct'
      ? 'text-[var(--color-success)]'
      : result === 'wrong'
        ? 'text-[var(--color-error)]'
        : 'text-[var(--solid-ink)]'
    : result
      ? 'text-white'
      : 'text-[var(--color-foreground)]';

  const underscoreClass = `${
    !isSolid && result ? 'text-white/60' : 'text-[var(--color-muted)]/50'
  } font-medium text-xl min-w-[0.55em] text-center`;
  const hintClass = 'text-[var(--color-muted)]/70 font-medium text-xl';
  const caretClass = isSolid ? 'bg-[var(--color-accent)]' : 'bg-blue-600';

  const content = (
    <div className="flex items-center justify-center min-h-[3.5rem] px-5 py-4 gap-x-1 flex-wrap text-xl select-none">
      {slots.map((slot, slotIndex) => {
        if (slot.kind === 'gap') {
          return <span key={`gap-${slotIndex}`} className="inline-block w-[0.5em] shrink-0" aria-hidden />;
        }
        const i = slot.index;
        if (i < t) {
          return (
            <span key={`typed-${i}`} className={`font-black text-xl ${typedColorClass}`}>
              {visibleTyped[i]}
            </span>
          );
        }
        const showCaret = !disabled && i === t;
        const showHint = !disabled && t === 0 && i === 0 && target[0] != null && target[0] !== '';
        return (
          <span key={`slot-${slotIndex}`} className="inline-flex items-center">
            {showCaret && (
              <span
                className={`inline-block w-[2px] h-[1.2em] shrink-0 self-center rounded-sm ${caretClass}`}
                aria-hidden
              />
            )}
            {showHint ? (
              <span className={hintClass} aria-hidden>
                {target[0].toLowerCase()}
              </span>
            ) : (
              <span className={underscoreClass}>_</span>
            )}
          </span>
        );
      })}

      {result && (
        <Icon
          name={result === 'correct' ? 'check' : 'close'}
          size={20}
          className={`ml-1.5 shrink-0 ${isSolid
            ? result === 'correct' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
            : 'text-white'
          }`}
        />
      )}
    </div>
  );

  const input = (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSubmit();
        }
      }}
      disabled={disabled}
      autoFocus
      maxLength={n > 0 ? n : undefined}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className="absolute inset-0 w-full h-full cursor-text outline-none focus:outline-none disabled:cursor-default"
      style={{ color: 'transparent', caretColor: 'transparent', background: 'transparent' }}
      aria-label="回答を入力"
    />
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    if (e.target === el) return;
    e.preventDefault();
    el.focus();
  };

  if (!isSolid) {
    return (
      <div
        className={`relative rounded-xl border-2 transition-colors ${plainBorderClass}`}
        onPointerDown={handlePointerDown}
      >
        {content}
        {input}
      </div>
    );
  }

  let faceBg = 'var(--color-surface)';
  let borderColor = 'var(--solid-ink)';
  let shadowColor = 'var(--solid-ink)';

  if (result === 'correct') {
    faceBg = 'rgba(61,122,78,0.08)';
    shadowColor = 'var(--color-success)';
  } else if (result === 'wrong') {
    faceBg = 'rgba(184,72,72,0.08)';
    shadowColor = 'var(--color-error)';
  }

  return (
    <div className="relative" onPointerDown={handlePointerDown}>
      {/* shadow plate */}
      <div
        className="absolute inset-0 rounded-xl transition-colors"
        style={{ transform: 'translate(2.5px, 3.5px)', background: shadowColor }}
      />
      <div
        className="relative rounded-xl border-2 transition-colors"
        style={{ background: faceBg, borderColor }}
      >
        {content}
      </div>
      {input}
    </div>
  );
}
