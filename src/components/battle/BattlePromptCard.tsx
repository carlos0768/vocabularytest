'use client';

/**
 * 出題中の英単語カード。
 * 長い単語や熟語でも折り返して読めるよう、文字サイズを語長で段階的に落とす。
 */

function promptSizeClass(prompt: string): string {
  if (prompt.length > 28) return 'text-[24px]';
  if (prompt.length > 18) return 'text-[30px]';
  if (prompt.length > 11) return 'text-[36px]';
  return 'text-[42px]';
}

export function BattlePromptCard({ prompt }: { prompt: string }) {
  return (
    <div className="flex min-h-[132px] flex-col items-center justify-center rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-6 shadow-[2px_3px_0_var(--solid-ink)]">
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        Meaning?
      </p>
      <h1
        className={`text-center font-display font-black leading-tight tracking-tight text-[var(--solid-ink)] break-words ${promptSizeClass(prompt)}`}
      >
        {prompt}
      </h1>
    </div>
  );
}
