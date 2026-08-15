'use client';

/**
 * ラウンド決着の一行フィードバック。
 * 高さを固定して、表示/非表示で選択肢の位置がずれないようにする。
 */

import { Icon } from '@/components/ui/Icon';

export type BattleRoundOutcome =
  | 'won'        // 自分が先に正解した
  | 'lost'       // 相手が先に正解した
  | 'missed'     // 自分が外して決着した
  | 'timeout'    // 誰も正解できずに時間切れ
  | 'waiting'    // 自分は回答済み、相手待ち
  | 'live';      // まだ回答できる

const OUTCOME_STYLES: Record<
  Exclude<BattleRoundOutcome, 'live'>,
  { icon: string; label: string; className: string }
> = {
  won: {
    icon: 'bolt',
    label: '正解！ +1',
    className: 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white',
  },
  lost: {
    icon: 'close',
    label: '相手が先に正解',
    className: 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--color-muted)]',
  },
  missed: {
    icon: 'cancel',
    label: '不正解',
    className: 'border-[var(--color-error)] bg-[var(--color-error-light)] text-[var(--color-error)]',
  },
  timeout: {
    icon: 'hourglass_bottom',
    label: '時間切れ',
    className: 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--color-muted)]',
  },
  waiting: {
    icon: 'hourglass_top',
    label: '相手の回答を待っています',
    className: 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--color-muted)]',
  },
};

export function BattleRoundFeedback({
  outcome,
  answer,
}: {
  outcome: BattleRoundOutcome;
  /** 決着後に開示された正解。自分が正解した場合は出さない。 */
  answer?: string | null;
}) {
  if (outcome === 'live') {
    return <div className="h-[42px]" aria-hidden="true" />;
  }

  const style = OUTCOME_STYLES[outcome];
  const showAnswer = Boolean(answer) && outcome !== 'won' && outcome !== 'waiting';

  return (
    <div
      role="status"
      className={`flex h-[42px] items-center justify-center gap-2 rounded-[12px] border-2 px-4 ${style.className}`}
    >
      <Icon name={style.icon} size={16} className="shrink-0" />
      <span className="truncate font-display text-[13px] font-bold">
        {showAnswer ? `${style.label} · 正解は「${answer}」` : style.label}
      </span>
    </div>
  );
}
