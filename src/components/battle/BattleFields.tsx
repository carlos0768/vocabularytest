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
import {
  BATTLE_BOT_LEVELS,
  BATTLE_BOT_PROFILES,
  type BattleBotLevel,
} from '@/lib/battle/bot';
import {
  FREE_DAILY_BATTLE_LIMIT,
  type BattleAllowance,
} from '@/lib/battle/free-allowance';
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
function InlineSegment<T extends string | number>({
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

const BOT_LEVEL_OPTIONS = BATTLE_BOT_LEVELS.map((level) => ({
  label: BATTLE_BOT_PROFILES[level].label,
  value: level,
}));

/**
 * ボットの強さ。相手が見つからなかったときにだけ使われる設定なので、
 * 行の下に小さく but 何のための設定かを書いておく。
 */
function BotLevelRow({
  botLevel,
  onBotLevelChange,
  disabled,
}: {
  botLevel: BattleBotLevel;
  onBotLevelChange: (level: BattleBotLevel) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow icon="smart_toy" label="ボットの強さ" last>
      <InlineSegment
        ariaLabel="ボットの強さ"
        options={BOT_LEVEL_OPTIONS}
        value={botLevel}
        onChange={onBotLevelChange}
        disabled={disabled}
      />
    </SettingRow>
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
  botLevel,
  onBotLevelChange,
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
  botLevel: BattleBotLevel;
  onBotLevelChange: (level: BattleBotLevel) => void;
  disabled?: boolean;
}) {
  const selectId = useId();
  const selected = projects.find((project) => project.id === projectId) ?? null;

  return (
    <section className="overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-shadow)]">
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
            自分が出題するときの単語帳
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

      <SettingRow icon="timer" label="1問の制限時間">
        <InlineSegment
          ariaLabel="1問の制限時間"
          options={roundDurationOptions}
          value={roundDurationMs}
          onChange={onRoundDurationChange}
          disabled={disabled}
        />
      </SettingRow>

      <BotLevelRow
        botLevel={botLevel}
        onBotLevelChange={onBotLevelChange}
        disabled={disabled}
      />
    </section>
  );
}

/**
 * グループ内対戦の設定カード。出題元はグループに追加された単語帳なので、
 * 通常の対戦と違って「自分の単語帳」を選ばせない（選んでも使われないため）。
 */
export function BattleGroupSetupCard({
  books,
  booksLoading,
  totalWordCount,
  questionCount,
  questionCountOptions,
  onQuestionCountChange,
  roundDurationMs,
  roundDurationOptions,
  onRoundDurationChange,
  botLevel,
  onBotLevelChange,
  disabled,
}: {
  books: { id: string; title: string }[];
  booksLoading: boolean;
  totalWordCount: number;
  questionCount: number;
  questionCountOptions: { label: string; value: number }[];
  onQuestionCountChange: (value: number) => void;
  roundDurationMs: number;
  roundDurationOptions: { label: string; value: number }[];
  onRoundDurationChange: (value: number) => void;
  botLevel: BattleBotLevel;
  onBotLevelChange: (level: BattleBotLevel) => void;
  disabled?: boolean;
}) {
  const titles = books.map((book) => book.title).join('・');

  return (
    <section className="overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-shadow)]">
      <div className="flex items-center gap-2.5 border-b-2 border-[var(--color-border)] p-3">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]">
          <Icon name="auto_stories" size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
            グループの単語帳から出題
          </div>
          <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
            {booksLoading
              ? '読み込み中...'
              : books.length === 0
                ? 'まだ単語帳がありません'
                : `${books.length}冊 · ${totalWordCount}語`}
          </div>
          {!booksLoading && books.length > 0 && (
            <div className="truncate text-[11px] font-bold text-[var(--color-muted)]">{titles}</div>
          )}
        </div>
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

      <SettingRow icon="timer" label="1問の制限時間">
        <InlineSegment
          ariaLabel="1問の制限時間"
          options={roundDurationOptions}
          value={roundDurationMs}
          onChange={onRoundDurationChange}
          disabled={disabled}
        />
      </SettingRow>

      <BotLevelRow
        botLevel={botLevel}
        onBotLevelChange={onBotLevelChange}
        disabled={disabled}
      />
    </section>
  );
}

const RULES: { icon: string; title: string; detail: string }[] = [
  { icon: 'menu_book', title: '出題者の単語帳', detail: 'から出題' },
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
          className="flex h-[52px] w-[38px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[24px] font-black text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-shadow)]"
        >
          {char}
        </span>
      ))}
    </div>
  );
}

/**
 * 相手が見つからないときに待機画面へ出す、ボット対戦への誘導。
 *
 * 待つのをやめる判断をユーザーに丸投げせず、`secondsUntilAuto` を過ぎたら
 * 呼び出し側が自動で始める。ここはその残り時間を見せるだけで、押せば即座に
 * 始められる。
 */
export function BattleBotOffer({
  botName,
  secondsUntilAuto,
  onStart,
  disabled,
}: {
  botName: string;
  /** 自動開始までの残り秒。null なら自動開始しない。 */
  secondsUntilAuto: number | null;
  onStart: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-3.5 text-left shadow-[2px_3px_0_var(--solid-shadow)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]">
          <Icon name="smart_toy" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
            NO OPPONENT YET
          </div>
          <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
            {botName}が代わりに相手をします
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="mt-3 flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[14px] font-bold text-[var(--color-on-accent)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
      >
        <Icon name="smart_toy" size={17} />
        今すぐボットと対戦する
      </button>

      <p className="mt-2 text-center text-[11px] leading-[1.6] text-[var(--color-muted)]">
        {secondsUntilAuto === null
          ? '人が見つかったら、そのまま人との対戦が始まります。'
          : `あと${secondsUntilAuto}秒で自動的に始まります。`}
      </p>
    </div>
  );
}

/**
 * 無料ユーザーの本日の残り回数。Pro は無制限なので何も出さない。
 *
 * 1回 = 実際に始まった対戦。相手が見つからずロビーを抜けたぶんは減らないので、
 * 「マッチング待ちで消えた」と誤解されないよう補足も添える。
 *
 * 使い切った状態も描ける。ロビーは0回になった時点で全画面の案内へ切り替えるので
 * 普段は通らないが、呼び出し側の分岐に依存せず単体で正しく出るようにしてある。
 */
export function BattleAllowanceStrip({ allowance }: { allowance: BattleAllowance | null }) {
  if (!allowance || allowance.isPro) return null;

  const limit = allowance.limit ?? FREE_DAILY_BATTLE_LIMIT;
  const remaining = Math.max(0, allowance.remaining ?? 0);
  const exhausted = remaining === 0;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-[14px] border-2 px-3 py-2.5',
        exhausted
          ? 'border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]',
      )}
    >
      <Icon
        name={exhausted ? 'hourglass_empty' : 'swords'}
        size={18}
        className="shrink-0 text-[var(--color-accent)]"
      />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">
          {exhausted ? '本日の無料対戦は終了しました' : `本日あと${remaining}回 対戦できます`}
        </div>
        <div className="mt-0.5 font-mono text-[9.5px] font-bold tracking-[0.04em] text-[var(--color-muted)]">
          {exhausted
            ? `明日0時に${limit}回ぶん回復します`
            : `無料プランは1日${limit}回まで / 実際に始まった対戦だけ数えます`}
        </div>
      </div>
      <div className="flex shrink-0 gap-1" aria-hidden>
        {Array.from({ length: limit }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-2.5 w-2.5 rounded-full border-2 border-[var(--solid-ink)]',
              index < remaining ? 'bg-[var(--color-accent)]' : 'bg-transparent',
            )}
          />
        ))}
      </div>
    </div>
  );
}
