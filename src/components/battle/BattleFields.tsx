'use client';

/**
 * ロビーを構成するパーツ。
 *
 * 縦積みの塊を並べるのではなく、
 *  - モードは 2択のタブ（同時に1つだけ見せる）
 *  - 対戦設定は「1枚のカードに行を積む」設定リスト（ラベル左・操作右の横並び）
 *  - ルールは3列のストリップ
 * という構成にして、1画面に収まるようにしている。
 */

import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

export type BattleLobbyMode = 'random' | 'friend';

const MODE_TABS: { key: BattleLobbyMode; icon: string; label: string }[] = [
  { key: 'random', icon: 'bolt', label: 'ランダム' },
  { key: 'friend', icon: 'group', label: 'フレンド' },
];

/** ランダム / フレンドの切り替えタブ。 */
export function BattleModeTabs({
  value,
  onChange,
}: {
  value: BattleLobbyMode;
  onChange: (mode: BattleLobbyMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="対戦モード"
      className="grid grid-cols-2 gap-1 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] p-1"
    >
      {MODE_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex h-[42px] items-center justify-center gap-1.5 rounded-[10px] font-display text-[14px] font-extrabold transition-colors duration-100',
              active
                ? 'bg-[var(--solid-ink)] text-[var(--color-surface)]'
                : 'text-[var(--color-muted)]',
            )}
          >
            <Icon name={tab.icon} size={17} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** 設定リストの1行（ラベル左・操作右）。 */
function SettingRow({
  icon,
  label,
  children,
  last,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2.5',
        !last && 'border-b-2 border-[var(--color-border)]',
      )}
    >
      <Icon name={icon} size={16} className="shrink-0 text-[var(--color-muted)]" />
      <span className="min-w-0 flex-1 truncate font-display text-[13px] font-extrabold text-[var(--solid-ink)]">
        {label}
      </span>
      {children}
    </div>
  );
}

/** 行の右側に置く小さめのセグメント（1本のトラックに収める）。 */
function InlineSegment<T extends number>({
  ariaLabel,
  options,
  value,
  onChange,
  disabled,
}: {
  ariaLabel: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex shrink-0 gap-0.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] p-[3px]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-[28px] min-w-[46px] rounded-[7px] px-2 font-mono text-[12px] font-bold tabular-nums transition-colors duration-100 disabled:opacity-50',
              active
                ? 'bg-[var(--solid-ink)] text-[var(--color-surface)]'
                : 'text-[var(--color-muted)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 対戦設定（単語帳・問題数・制限時間）を1枚にまとめたカード。
 * 単語帳の行はネイティブ <select> を重ねて、モバイルの選択UIをそのまま使う。
 */
export function BattleSetupCard({
  projects,
  projectId,
  projectsLoading,
  onProjectChange,
  questionCount,
  questionCountOptions,
  onQuestionCountChange,
  roundDurationMs,
  roundDurationOptions,
  onRoundDurationChange,
  disabled,
}: {
  projects: Project[];
  projectId: string;
  projectsLoading: boolean;
  onProjectChange: (projectId: string) => void;
  questionCount: number;
  questionCountOptions: { label: string; value: number }[];
  onQuestionCountChange: (value: number) => void;
  roundDurationMs: number;
  roundDurationOptions: { label: string; value: number }[];
  onRoundDurationChange: (value: number) => void;
  disabled?: boolean;
}) {
  const selectId = useId();
  const selected = projects.find((project) => project.id === projectId) ?? null;

  return (
    <section className="overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)]">
      {/* 単語帳 */}
      <div className="relative flex items-center gap-2.5 border-b-2 border-[var(--color-border)] p-3">
        {projects.length > 0 && (
          <>
            <label htmlFor={selectId} className="sr-only">
              出題に使う単語帳
            </label>
            <select
              id={selectId}
              value={projectId}
              onChange={(event) => onProjectChange(event.target.value)}
              disabled={disabled}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </>
        )}
        <div
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] bg-cover bg-center font-display text-[15px] font-extrabold text-[var(--solid-ink)]"
          style={selected?.iconImage ? { backgroundImage: `url(${selected.iconImage})` } : undefined}
        >
          {!selected?.iconImage && (selected?.title.charAt(0) ?? '?')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
            出題に使う単語帳
          </div>
          <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
            {projectsLoading
              ? '読み込み中...'
              : selected?.title ?? '単語帳がありません'}
          </div>
        </div>
        {projects.length > 0 && (
          <Icon name="unfold_more" size={17} className="shrink-0 text-[var(--color-muted)]" />
        )}
      </div>

      <SettingRow icon="format_list_numbered" label="問題数">
        <InlineSegment
          ariaLabel="問題数"
          options={questionCountOptions}
          value={questionCount}
          onChange={onQuestionCountChange}
          disabled={disabled}
        />
      </SettingRow>

      <SettingRow icon="timer" label="1問の制限時間" last>
        <InlineSegment
          ariaLabel="1問の制限時間"
          options={roundDurationOptions}
          value={roundDurationMs}
          onChange={onRoundDurationChange}
          disabled={disabled}
        />
      </SettingRow>
    </section>
  );
}

const RULES: { icon: string; title: string; detail: string }[] = [
  { icon: 'shuffle', title: '両者の単語帳', detail: '交互に出題' },
  { icon: 'bolt', title: '先に正解', detail: '+1点' },
  { icon: 'toll', title: 'コイン', detail: '消費なし' },
];

/** ルールを3列で横に並べたストリップ。 */
export function BattleRuleStrip() {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-[14px] border-2 border-[var(--color-border)] bg-[var(--color-surface)]">
      {RULES.map((rule, index) => (
        <div
          key={rule.title}
          className={cn(
            'px-2 py-2.5 text-center',
            index < RULES.length - 1 && 'border-r-2 border-[var(--color-border)]',
          )}
        >
          <Icon name={rule.icon} size={16} className="text-[var(--color-accent)]" />
          <div className="mt-0.5 truncate font-display text-[11px] font-extrabold text-[var(--solid-ink)]">
            {rule.title}
          </div>
          <div className="truncate font-mono text-[9.5px] font-bold text-[var(--color-muted)]">
            {rule.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 招待コードの表示（1文字ずつコマに分ける）。 */
export function BattleInviteCode({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`招待コード ${code.split('').join(' ')}`}>
      {code.split('').map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="flex h-[52px] w-[38px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[24px] font-black text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)]"
        >
          {char}
        </span>
      ))}
    </div>
  );
}
