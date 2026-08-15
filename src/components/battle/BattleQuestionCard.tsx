'use client';

/**
 * 出題カード。英単語を大きく見せ、ラウンドが決着したら結果バナーを重ねる。
 * 正解テキストはサーバーが開示 (revealed_answer) してから初めて入るので、
 * ここでは受け取ったものを出すだけ。
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export type BattleRoundOutcome = 'won' | 'lost' | 'timeout' | null;

export function BattleQuestionCard({
  prompt,
  outcome,
  answer,
}: {
  prompt: string;
  /** 決着していないラウンドでは null */
  outcome: BattleRoundOutcome;
  answer: string | null;
}) {
  return (
    <section className="relative flex flex-col items-center justify-center rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-8 text-center shadow-[2px_3px_0_var(--solid-ink)]">
      <p className="font-mono text-[10px] font-bold tracking-[0.1em] text-[var(--color-muted)]">
        WHAT DOES IT MEAN?
      </p>
      <h1 className="mt-2 break-words font-display text-[clamp(28px,9vw,40px)] font-black leading-[1.15] text-[var(--solid-ink)]">
        {prompt}
      </h1>

      {outcome && <BattleRoundBanner outcome={outcome} answer={answer} />}
    </section>
  );
}

function BattleRoundBanner({ outcome, answer }: { outcome: BattleRoundOutcome; answer: string | null }) {
  const config = {
    won: { icon: 'check_circle', label: '正解！ +1', tone: 'success' as const },
    lost: { icon: 'bolt', label: '相手が先に正解', tone: 'error' as const },
    timeout: { icon: 'timer_off', label: '時間切れ', tone: 'muted' as const },
  }[outcome ?? 'timeout'];

  return (
    <div
      className={cn(
        'mt-5 flex w-full flex-col items-center gap-1 rounded-[12px] border-2 px-3 py-2.5',
        config.tone === 'success' && 'border-[var(--color-success)] bg-[var(--color-success-light)] text-[var(--color-success)]',
        config.tone === 'error' && 'border-[var(--color-error)] bg-[var(--color-error-light)] text-[var(--color-error)]',
        config.tone === 'muted' && 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-muted)]',
      )}
      role="status"
    >
      <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
        <Icon name={config.icon} size={17} />
        {config.label}
      </span>
      {outcome !== 'won' && answer && (
        <span className="text-[12px] font-bold text-[var(--solid-ink)]">正解: {answer}</span>
      )}
    </div>
  );
}
