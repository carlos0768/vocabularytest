'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { EikenLevelOption } from '@/lib/auth/signup-flow';

/**
 * Mobile UI pieces of the onboarding steps (プロフィール / 級 / アカウント / 認証).
 * Shared by /signup (before the account exists) and /onboarding (after an
 * OAuth signup that skipped those screens), so both flows look identical.
 */

export type SignupStepTheme = {
  icon: string;
  label: string;
  accent: string;
  accentSub: string;
};

export const EIKEN_LEVEL_OPTIONS: { value: EikenLevelOption; label: string }[] = [
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

const SHELL_CONFETTI = [
  { x: '8%', y: '13%', size: 9, color: '#15803d', rotate: -10 },
  { x: '91%', y: '9%', size: 7, color: '#b45309', rotate: 14 },
  { x: '94%', y: '30%', size: 10, color: '#dc2626', rotate: -12 },
  { x: '4%', y: '34%', size: 6, color: '#6d28d9', rotate: 20 },
] as const;

export function SignupStepShell({
  theme,
  stepIndex,
  totalSteps,
  barColors,
  title,
  description,
  backHref,
  onBack,
  children,
}: {
  theme: SignupStepTheme;
  /** 1-based position of the current step. */
  stepIndex: number;
  totalSteps: number;
  barColors: readonly string[];
  title: string;
  description: string;
  backHref?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const backClassName = 'flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px';

  return (
    <div className="relative min-h-screen w-full bg-[var(--color-paper-alt)] font-[var(--font-body)] [background-image:radial-gradient(color-mix(in_srgb,_var(--solid-ink)_4.5%,_transparent)_1px,transparent_1px)] [background-size:22px_22px]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col overflow-hidden pb-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        {/* Decorative accent blobs + confetti */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-14 -top-12 h-36 w-36 rounded-full"
          style={{ background: theme.accent, opacity: 0.09 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-40 h-44 w-44 rounded-full"
          style={{ background: '#f59e0b', opacity: 0.1 }}
        />
        {SHELL_CONFETTI.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-[2px] border border-[var(--solid-ink)]"
            style={{
              left: c.x,
              top: c.y,
              width: c.size,
              height: c.size,
              background: c.color,
              transform: `rotate(${c.rotate}deg)`,
              opacity: 0.85,
            }}
          />
        ))}

        <div className="relative flex items-center gap-2 px-[14px] pt-1">
          {backHref ? (
            <Link href={backHref} className={backClassName} aria-label="戻る">
              <Icon name="chevron_left" size={16} />
            </Link>
          ) : onBack ? (
            <button
              type="button"
              onClick={onBack}
              className={backClassName}
              aria-label="戻る"
            >
              <Icon name="chevron_left" size={16} />
            </button>
          ) : (
            <div className="h-[38px] w-[38px]" aria-hidden />
          )}
          <div className="flex-1" />
          <div className="mr-1.5 flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--color-ink-mute)]">
              {stepIndex}/{totalSteps}
            </span>
            <div className="flex gap-[3px]">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className="h-[6px] w-[20px] rounded-[3px] border border-[var(--solid-ink)]"
                  style={{
                    background:
                      stepIndex > i
                        ? barColors[i] ?? 'var(--solid-ink)'
                        : 'rgba(255,255,255,0.7)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="relative px-6 pb-2 pt-6 text-center">
          <div className="inline-block font-display text-[38px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
            MERKEN
            <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
          </div>
        </div>

        <div className="relative px-6 pb-4 pt-5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--solid-ink)]"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: theme.accent }}
            />
            STEP {stepIndex} · {theme.label}
          </span>
          <div className="mt-3 flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 -rotate-2 items-center justify-center rounded-[13px] border-2 border-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-shadow)]"
              style={{ background: theme.accentSub, color: theme.accent }}
            >
              <Icon name={theme.icon} size={24} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
                {title}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--color-ink-mute)]">{description}</div>
            </div>
          </div>
        </div>

        {children}

        <div className="flex-1" />
      </div>
    </div>
  );
}

export function HandleSuggestionRow({
  suggestions,
  loading,
  onPick,
  onRefresh,
}: {
  suggestions: string[];
  loading: boolean;
  onPick: (candidate: string) => void;
  onRefresh: () => void;
}) {
  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="mt-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-ink-mute)]">
          IDの候補
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-accent)] disabled:opacity-50"
        >
          <Icon name="refresh" size={12} />
          別の候補
        </button>
      </div>
      {suggestions.length === 0 ? (
        <div className="text-[10px] text-[var(--color-muted)]">候補を作成中...</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => onPick(candidate)}
              className="rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--solid-ink)] transition-all active:translate-x-px active:translate-y-px"
            >
              @{candidate}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SignupErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="rounded-[10px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2.5 text-xs font-bold text-[var(--color-error)]"
    >
      {children}
    </div>
  );
}

export function SignupPrimaryAction({
  type,
  disabled,
  onClick,
  children,
}: {
  type: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="group w-full disabled:pointer-events-none disabled:opacity-60"
    >
      <div className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] py-3.5 text-center text-sm font-bold text-[var(--color-on-accent)] shadow-[3px_4px_0_var(--solid-shadow)] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--solid-shadow)]">
        {children}
      </div>
    </button>
  );
}

export function LevelChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] border-2 px-3.5 py-2 text-[12px] font-bold transition-all ${
        active
          ? 'border-[var(--solid-ink)] bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[2px_3px_0_var(--solid-shadow)]'
          : 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]'
      }`}
    >
      {children}
    </button>
  );
}

export function SignupFormField({
  label,
  placeholder,
  type,
  trailing,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  placeholder: string;
  type?: string;
  trailing?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-[5px] pl-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-ink-mute)]">
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-[11px]">
        <input
          type={type || 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
          disabled={disabled}
          className="flex-1 border-none bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)] disabled:opacity-60"
        />
        {trailing}
      </div>
    </label>
  );
}

export function SignupLoadingScreen() {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-[var(--color-paper-alt)] font-[var(--font-body)] [background-image:radial-gradient(color-mix(in_srgb,_var(--solid-ink)_4.5%,_transparent)_1px,transparent_1px)] [background-size:22px_22px]">
      <Icon name="progress_activity" size={28} className="animate-spin text-[var(--solid-ink)]" />
    </div>
  );
}
