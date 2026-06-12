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
  value,
  onChange,
  normalizeInput,
  onSubmit,
  disabled,
  result,
  variant = 'plain',
}: TypeInQuizFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const target = [...answer];
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
      ? 'border-[var(--color-success)] bg-[var(--color-success-light)]'
      : result === 'wrong'
        ? 'border-[var(--color-error)] bg-[var(--color-error-light)]'
        : 'border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-foreground)]';

  const typedColorClass = isSolid
    ? result
      ? 'text-white'
      : 'text-[var(--solid-ink)]'
    : result === 'correct'
      ? 'text-[var(--color-success)]'
      : result === 'wrong'
        ? 'text-[var(--color-error)]'
        : 'text-[var(--color-foreground)]';

  const underscoreClass = `${
    isSolid && result ? 'text-white/60' : 'text-[var(--color-muted)]/50'
  } font-medium text-xl min-w-[0.55em] text-center`;
  const hintClass = 'text-[var(--color-muted)]/70 font-medium text-xl';
  const caretClass = isSolid ? 'bg-[var(--color-accent)]' : 'bg-blue-600';

  const renderUnderscores = (count: number, keyPrefix: string) =>
    Array.from({ length: count }, (_, i) => (
      <span key={`${keyPrefix}-${i}`} className={underscoreClass}>
        _
      </span>
    ));

  const content = (
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
              className={`inline-block w-[2px] h-[1.2em] shrink-0 self-center rounded-sm ${caretClass}`}
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

      {isSolid && result && (
        <Icon
          name={result === 'correct' ? 'check' : 'close'}
          size={20}
          className="ml-1.5 shrink-0 text-white"
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
    faceBg = 'var(--color-accent)';
    borderColor = 'var(--color-accent-ink)';
    shadowColor = 'var(--color-accent-ink)';
  } else if (result === 'wrong') {
    faceBg = 'var(--color-error)';
    borderColor = '#b91c1c';
    shadowColor = '#b91c1c';
  }

  return (
    <div className="relative" onPointerDown={handlePointerDown}>
      {/* shadow plate */}
      <div
        className="absolute inset-0 rounded-xl transition-colors"
        style={{ transform: 'translate(2.5px, 3.5px)', background: shadowColor }}
      />
      <div
        className="relative rounded-xl border-[1.5px] transition-colors"
        style={{ background: faceBg, borderColor }}
      >
        {content}
      </div>
      {input}
    </div>
  );
}
