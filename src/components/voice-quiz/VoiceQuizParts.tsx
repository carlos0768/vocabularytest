'use client';

// 音読チャレンジ画面 (`/voice-quiz/[projectId]`) の表示部品とデザイントークン。
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { cn } from '@/lib/utils';

/* --- Merken Design System (Solid) のトークン --- */
/** 面を持つ要素の枠。ハードシャドウは大きさに応じて2種類使い分ける。 */
export const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
export const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-shadow)]';
export const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-shadow)]';
/** 見出しの上に置く小さなラベル。 */
export const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em]';

export function CloseButton({ onClick, label = '閉じる' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px',
        HARD_SHADOW_SM,
      )}
    >
      <Icon name="close" size={20} />
    </button>
  );
}

/** 開始画面の設定行。解答時間と試行回数で見た目を揃える。 */
export function SegmentedOptions({
  label,
  options,
  selected,
  onSelect,
  format,
  className,
  extra,
}: {
  label: string;
  options: readonly number[];
  selected: number;
  onSelect: (option: number) => void;
  format: (option: number) => string;
  className?: string;
  /** 定型の選択肢のあとに並べる自由入力など。 */
  extra?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className={cn(EYEBROW, 'mb-2 text-left text-[var(--color-muted)]')}>{label}</p>
      <div className="flex gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option)}
              className={cn(
                'flex-1 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] py-3 font-display text-base font-black transition-all duration-100 active:translate-x-px active:translate-y-px',
                isSelected
                  ? cn('bg-[var(--solid-ink)] text-[var(--color-surface)]', HARD_SHADOW_SM)
                  : 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
              )}
            >
              {format(option)}
            </button>
          );
        })}
        {extra}
      </div>
    </div>
  );
}

export function StatChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'default' | 'error';
}) {
  const errorTone = tone === 'error';
  return (
    <div className="rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-left">
      <div className="flex items-center gap-1.5">
        <Icon
          name={icon}
          size={14}
          className={errorTone ? 'text-[var(--color-error,#ef4444)]' : 'text-[var(--color-muted)]'}
        />
        <span className={cn(EYEBROW, 'text-[var(--color-muted)]')}>{label}</span>
      </div>
      <p
        className={cn(
          'mt-0.5 font-mono text-base font-black tabular-nums',
          errorTone ? 'text-[var(--color-error,#ef4444)]' : 'text-[var(--solid-ink)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** 各フェーズの中央に置く大きな円。 */
export function PhaseOrb({
  icon,
  className,
  iconClassName,
}: {
  icon: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-36 w-36 items-center justify-center rounded-full border-2 border-[var(--solid-ink)]',
        HARD_SHADOW,
        className,
      )}
    >
      <Icon name={icon} size={52} className={iconClassName} />
    </div>
  );
}

/** 残り時間を示すリング。中央のマイクを囲む。 */
export function CountdownRing({ progress, tone }: { progress: number; tone: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={tone}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
      <circle cx="60" cy="60" r={radius + 4} fill="none" stroke="var(--solid-ink)" strokeWidth="2" />
    </svg>
  );
}

/** 読み上げ中のイコライザ。 */
export function SoundWave() {
  return (
    <div className="flex h-6 items-end gap-1.5" aria-hidden="true">
      {[0, 140, 280, 420, 560].map((delay) => (
        <span
          key={delay}
          className="voice-quiz-wave block h-6 w-1.5 rounded-full bg-[var(--color-accent)]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

/** 何回目の試行かを示すピル。 */
export function AttemptPill({
  current,
  total,
  remaining,
}: {
  current: number;
  total: number;
  remaining?: boolean;
}) {
  return (
    <span className="inline-flex items-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[11px] font-black tabular-nums text-[var(--solid-ink)]">
      {remaining ? `残り${total - current}回` : `${current} / ${total}`}
    </span>
  );
}

/** 認識された(=間違えた)発話。 */
export function MisheardText({ text }: { text: string }) {
  return <p className="font-mono text-sm text-[var(--color-muted)] line-through">{text}</p>;
}

export function NoticeScreen({
  onBack,
  icon,
  title,
  message,
  action,
}: {
  onBack: () => void;
  icon: string;
  title: string;
  message: string;
  /** 戻る以外にできることがあるとき (途中まで解いた結果を見る、など)。 */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
        <CloseButton onClick={onBack} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
          <div
            className={cn(
              'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-warning-light)]',
              HARD_SHADOW_SM,
            )}
          >
            <Icon name={icon} size={30} className="text-[var(--color-warning)]" />
          </div>
          <p className="font-display text-lg font-black leading-snug text-[var(--solid-ink)]">{title}</p>
          <p className="mt-3 mb-6 text-sm leading-6 text-[var(--color-muted)]">{message}</p>
          {action && (
            <SolidButton
              variant="accent"
              size="lg"
              onClick={action.onClick}
              className={cn('mb-3 w-full', HARD_SHADOW)}
            >
              {action.label}
            </SolidButton>
          )}
          <SolidButton size="lg" onClick={onBack} className={cn('w-full', HARD_SHADOW_SM)}>
            戻る
          </SolidButton>
        </div>
      </main>
    </div>
  );
}
