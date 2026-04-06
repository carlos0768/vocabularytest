'use client';

import { useRef, type ChangeEvent } from 'react';

export type TypeInQuizFieldResult = 'correct' | 'wrong' | null;

export interface TypeInQuizFieldProps {
  /** Expected answer (length drives slots / underscores). */
  answer: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  result: TypeInQuizFieldResult;
}

/**
 * Typing quiz field: bold characters for input, gray first-letter hint, underscores for remaining slots, blue caret.
 */
export function TypeInQuizField({
  answer,
  value,
  onChange,
  onSubmit,
  disabled,
  result,
}: TypeInQuizFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const target = [...answer];
  const typed = [...value];
  const n = target.length;
  const visibleTyped = typed.slice(0, n);
  const t = visibleTyped.length;

  const borderClass =
    result === 'correct'
      ? 'border-[var(--color-success)] bg-[var(--color-success-light)]'
      : result === 'wrong'
        ? 'border-[var(--color-error)] bg-[var(--color-error-light)]'
        : 'border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-foreground)]';

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (n > 0 && v.length > n) {
      v = v.slice(0, n);
    }
    onChange(v);
  };

  const typedColorClass =
    result === 'correct'
      ? 'text-[var(--color-success)]'
      : result === 'wrong'
        ? 'text-[var(--color-error)]'
        : 'text-[var(--color-foreground)]';

  const underscoreClass = 'text-[var(--color-muted)]/50 font-medium text-xl min-w-[0.55em] text-center';
  const hintClass = 'text-[var(--color-muted)]/70 font-medium text-xl';

  const renderUnderscores = (count: number, keyPrefix: string) =>
    Array.from({ length: count }, (_, i) => (
      <span key={`${keyPrefix}-${i}`} className={underscoreClass}>
        _
      </span>
    ));

  return (
    <div
      className={`relative rounded-xl border-2 transition-colors ${borderClass}`}
      onPointerDown={(e) => {
        if (disabled) return;
        const el = inputRef.current;
        if (!el) return;
        if (e.target === el) return;
        e.preventDefault();
        el.focus();
      }}
    >
      <div className="flex items-center justify-center min-h-[3.5rem] px-5 py-4 gap-x-1 flex-wrap text-xl select-none">
        {visibleTyped.map((ch, i) => (
          <span key={`typed-${i}`} className={`font-black text-xl ${typedColorClass}`}>
            {ch}
          </span>
        ))}

        {n > 0 && t < n && (
          <>
            {!disabled && (
              <span
                className="inline-block w-[2px] h-[1.2em] shrink-0 self-center rounded-sm bg-blue-600"
                aria-hidden
              />
            )}

            {!disabled && t === 0 && target[0] != null && target[0] !== '' && (
              <span className={hintClass} aria-hidden>
                {target[0].toLowerCase()}
              </span>
            )}

            {disabled
              ? renderUnderscores(n - t, 'u-dis')
              : t === 0
                ? renderUnderscores(Math.max(0, n - 1), 'u-act')
                : renderUnderscores(Math.max(0, n - t), 'u-act')}
          </>
        )}
      </div>

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
        className="absolute inset-0 w-full h-full cursor-text disabled:cursor-default"
        style={{ color: 'transparent', caretColor: 'transparent', background: 'transparent' }}
        aria-label="回答を入力"
      />
    </div>
  );
}
