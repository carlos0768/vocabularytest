'use client';

/**
 * 招待コード (6文字) の入力欄。マス目は見た目だけで、実体は透明な1つの input。
 * 6個の input でフォーカスを回すやり方より IME・オートフィル・貼り付けの
 * 事故が少なく、コードが英数字混在 (2-9 / A-Z) でも素直に扱える。
 */

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const CODE_LENGTH = 6;
/** 紛らわしい 0/O/1/I を除いた、サーバー側と同じ文字集合。 */
const ALLOWED_CHARS = /[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g;

export function BattleCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 6文字揃った瞬間に呼ぶ (そのまま参加させたいとき用) */
  onComplete?: (value: string) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const cells = Array.from({ length: CODE_LENGTH }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        招待コード
      </label>
      <input
        id={inputId}
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value.toUpperCase().replace(ALLOWED_CHARS, '').slice(0, CODE_LENGTH);
          onChange(next);
          if (next.length === CODE_LENGTH) onComplete?.(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={CODE_LENGTH}
        aria-label="招待コード"
        className="absolute inset-0 h-full w-full cursor-pointer bg-transparent text-transparent caret-transparent outline-none"
      />

      <div aria-hidden className="pointer-events-none flex gap-1.5">
        {cells.map((char, index) => (
          <span
            key={index}
            className={cn(
              'flex h-[52px] flex-1 items-center justify-center rounded-[10px] border-2 bg-[var(--color-surface)] font-mono text-[20px] font-bold text-[var(--solid-ink)] transition-colors duration-100',
              focused && index === activeIndex && !disabled
                ? 'border-[var(--color-accent)]'
                : 'border-[var(--solid-ink)]',
              char ? '' : 'text-[var(--color-muted)]',
            )}
          >
            {char || '·'}
          </span>
        ))}
      </div>
    </div>
  );
}
