'use client';

/**
 * ロビーの設定フォーム（使う単語帳・問題数・制限時間）。
 * 出題は両者の単語帳をマージするので、ここで選ぶのは「自分が持ち込む1冊」。
 */

import { Icon } from '@/components/ui/Icon';
import type { Project } from '@/types';

function FieldLabel({ icon, children }: { icon: string; children: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Icon name={icon} size={14} className="text-[var(--color-muted)]" />
      <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {children}
      </h2>
    </div>
  );
}

export function BattleChipGroup<T extends number>({
  options,
  value,
  onChange,
  formatLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  formatLabel: (option: T) => string;
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`flex-1 rounded-[12px] border-2 border-[var(--solid-ink)] py-2.5 font-display text-[13px] font-bold transition-all duration-100 ${
              active
                ? 'bg-[var(--solid-ink)] text-[var(--color-background)] shadow-none translate-x-px translate-y-px'
                : 'bg-[var(--color-surface)] text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]'
            }`}
          >
            {formatLabel(option)}
          </button>
        );
      })}
    </div>
  );
}

export function BattleWordbookField({
  projects,
  loading,
  value,
  onChange,
}: {
  projects: Project[];
  loading: boolean;
  value: string;
  onChange: (projectId: string) => void;
}) {
  return (
    <section>
      <FieldLabel icon="menu_book">持ち込む単語帳</FieldLabel>

      {loading ? (
        <div className="h-[50px] animate-pulse rounded-[12px] border-2 border-[var(--color-border)] bg-[var(--color-surface-secondary)]" />
      ) : projects.length === 0 ? (
        <p className="rounded-[12px] border-2 border-dashed border-[var(--solid-ink)] px-4 py-3.5 text-[13px] text-[var(--color-muted)]">
          単語帳がありません。先に単語帳を作成してください。
        </p>
      ) : (
        <div className="relative">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label="持ち込む単語帳"
            className="w-full appearance-none rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-3.5 pr-11 font-display text-[14px] font-bold text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)]"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          <Icon
            name="keyboard_arrow_down"
            size={20}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--solid-ink)]"
          />
        </div>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
        出題は自分と相手の単語帳を混ぜて作られます。
      </p>
    </section>
  );
}

export function BattleSettingsFields({
  questionCount,
  onQuestionCountChange,
  questionCountOptions,
  roundDurationMs,
  onRoundDurationChange,
  roundDurationOptions,
}: {
  questionCount: number;
  onQuestionCountChange: (next: number) => void;
  questionCountOptions: readonly number[];
  roundDurationMs: number;
  onRoundDurationChange: (next: number) => void;
  roundDurationOptions: readonly number[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3.5">
      <section>
        <FieldLabel icon="format_list_bulleted">問題数</FieldLabel>
        <BattleChipGroup
          options={questionCountOptions}
          value={questionCount}
          onChange={onQuestionCountChange}
          formatLabel={(option) => `${option}`}
        />
      </section>

      <section>
        <FieldLabel icon="timer">制限時間</FieldLabel>
        <BattleChipGroup
          options={roundDurationOptions}
          value={roundDurationMs}
          onChange={onRoundDurationChange}
          formatLabel={(option) => `${option / 1000}s`}
        />
      </section>
    </div>
  );
}
