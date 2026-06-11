'use client';

import { useRef, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/Icon';

export type TypeInQuizFieldResult = 'correct' | 'wrong' | null;

export interface TypeInQuizFieldProps {
  /** Expected answer (length drives slots / underscores). */
  answer: string;
  value: string;
  onChange: (value: string) => void;
  normalizeInput?: (value: string) => string;
  onSubmit: () => void;
  disabled: boolean;
  result: TypeInQuizFieldResult;
}

/**
 * Typing quiz field: bold characters for input, gray first-letter hint, underscores for remaining slots.
 * Styled like DSQuizOption: solid ink border + colored offset shadow plate + tinted face on reveal.
 */
export function TypeInQuizField({
  answer,
  value,
  onChange,
  normalizeInput,
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

  let faceBg = 'var(--color-surface)';
  let shadowColor = 'var(--solid-ink)';

  if (result === 'correct') {
    faceBg = 'rgba(61,122,78,0.08)';
    shadowColor = 'var(--color-success)';
  } else if (result === 'wrong') {
    faceBg = 'rgba(184,72,72,0.08)';
    shadowColor = 'var(--color-error)';
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let v = normalizeInput ? normalizeInput(e.target.value) : e.target.value;
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
        : 'text-[var(--solid-ink)]';

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
      className="relative"
      onPointerDown={(e) => {
        if (disabled) return;
        const el = inputRef.current;
        if (!el) return;
        if (e.target === el) return;
        e.preventDefault();
        el.focus();
      }}
    >
      {/* shadow plate */}
      <div
        className="absolute inset-0 rounded-xl transition-colors"
        style={{ transform: 'translate(2.5px, 3.5px)', background: shadowColor }}
      />
      <div
        className="relative rounded-xl border-[1.5px] border-[var(--solid-ink)] transition-colors"
        style={{ background: faceBg }}
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
                  className="inline-block w-[2px] h-[1.2em] shrink-0 self-center rounded-sm bg-[var(--color-accent)]"
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

          {result && (
            <Icon
              name={result === 'correct' ? 'check' : 'close'}
              size={20}
              className={`ml-1.5 shrink-0 ${result === 'correct' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}
            />
          )}
        </div>
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
