'use client';

/**
 * 目標ページ (/goal)。下部バーの「目標」から開く。
 *
 * 目標は「どの単語帳を・いつまでに」で、単語帳の選択で指定する (端末に保存)。
 * ここに載せるのは
 *   1. 目標日までの残り日数
 *   2. 月間カレンダー (今日・目標日・学習した日)
 *   3. 今日の10問 — 目標の単語帳から優先度順に10問
 *   4. 今日復習しておきたい単語 — SM-2 で復習期限が来た語 (単語帳をまたぐ)
 * の4つ。3 と 4 は別物: 3 は目標の単語帳だけ、4 は全単語帳の復習期限。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { GoalSetupSheet, type GoalSheetProject } from '@/components/goal/GoalSetupSheet';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import {
  CALENDAR_WEEKDAY_LABELS,
  GOAL_DAILY_QUESTION_COUNT,
  GOAL_REVIEW_QUIZ_HREF,
  buildCalendarMonth,
  clearStudyGoal,
  daysUntil,
  describeGoalCountdown,
  getStudyGoal,
  goalDailyQuizHref,
  setStudyGoal,
  toLocalDateKey,
  type StudyGoal,
} from '@/lib/goal/study-goal';
import { getDailyReviewLimit } from '@/lib/preferences/review-limit';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import { getActivityHistory, getDailyStats, getGuestUserId } from '@/lib/utils';
import { summarizeWordMemory } from '@/lib/words/memory';
import type { Project, SubscriptionStatus, Word } from '@/types';

type BulkCapableRepository = {
  getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
  getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
};

/** カレンダーに学習した日の印を付けるために遡る週数 (保存されている履歴は180日) */
const ACTIVITY_HISTORY_WEEKS = 26;

export default function GoalPage() {
  const { user, subscription, loading: authLoading } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(
    () => getRepository(subscriptionStatus, wasPro),
    [subscriptionStatus, wasPro],
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [wordsByProject, setWordsByProject] = useState<Record<string, Word[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // localStorage はサーバーに無いのでマウント後に読む (hydration ずれ防止)
  const [goal, setGoal] = useState<StudyGoal | null>(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // カレンダーの日付をタップして開いたときの目標日の初期値。ヘッダーの
  // ボタンやバナーから開いたときは null (今の目標日 or 既定値)
  const [sheetInitialDate, setSheetInitialDate] = useState<string | null>(null);
  const openSheet = (initialDate: string | null = null) => {
    setSheetInitialDate(initialDate);
    setSheetOpen(true);
  };
  useEffect(() => {
    setGoal(getStudyGoal());
    setGoalLoaded(true);
  }, []);

  // 今日 / 学習履歴 / 今日の解答数 もブラウザ側の値なのでマウント後に確定させる
  const [today, setToday] = useState<Date | null>(null);
  const [studiedDays, setStudiedDays] = useState<Set<string>>(() => new Set());
  const [todayAnswered, setTodayAnswered] = useState(0);
  useEffect(() => {
    const now = new Date();
    setToday(now);
    setStudiedDays(
      new Set(
        getActivityHistory(ACTIVITY_HISTORY_WEEKS)
          .filter((entry) => entry.quizCount > 0)
          .map((entry) => entry.date),
      ),
    );
    setTodayAnswered(getDailyStats().todayCount);
  }, []);

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);
    try {
      const userId = user ? user.id : getGuestUserId();
      const loadedProjects = excludeReelSavedProjects(await repository.getProjects(userId));
      const projectIds = loadedProjects.map((project) => project.id);
      const bulkRepository = repository as typeof repository & BulkCapableRepository;
      let loaded: Record<string, Word[]> = {};
      if (projectIds.length === 0) {
        loaded = {};
      } else if (bulkRepository.getAllWordsByProjectIds) {
        loaded = await bulkRepository.getAllWordsByProjectIds(projectIds);
      } else if (bulkRepository.getAllWordsByProject) {
        loaded = await bulkRepository.getAllWordsByProject(projectIds);
      } else {
        const lists = await Promise.all(projectIds.map((id) => repository.getWords(id)));
        loaded = Object.fromEntries(projectIds.map((id, index) => [id, lists[index] ?? []]));
      }
      setProjects(loadedProjects);
      setWordsByProject(loaded);
    } catch (loadError) {
      console.error('Failed to load goal page data:', loadError);
      setError('単語帳の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [authLoading, repository, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const sheetProjects = useMemo<GoalSheetProject[]>(
    () => projects.map((project) => ({
      id: project.id,
      title: project.title,
      totalWords: (wordsByProject[project.id] ?? []).length,
    })),
    [projects, wordsByProject],
  );

  // 目標の単語帳が消されていたら目標も無いものとして扱う (表示だけ、保存は触らない)
  const goalProject = useMemo(
    () => (goal ? projects.find((project) => project.id === goal.projectId) ?? null : null),
    [goal, projects],
  );
  const goalWords = useMemo(
    () => (goalProject ? wordsByProject[goalProject.id] ?? [] : []),
    [goalProject, wordsByProject],
  );
  const goalMemory = useMemo(() => summarizeWordMemory(goalWords), [goalWords]);
  const remainingDays = goal && today ? daysUntil(goal.targetDate, today) : null;

  // SM-2 で復習期限が来た語 (全単語帳)。設定の1日上限を超えては見せない
  const dueCount = useMemo(() => {
    const due = getWordsDueForReview(Object.values(wordsByProject).flat()).length;
    const limit = getDailyReviewLimit();
    return limit > 0 ? Math.min(due, limit) : due;
  }, [wordsByProject]);

  const handleSaveGoal = (next: StudyGoal) => {
    setStudyGoal(next);
    setGoal(next);
    setSheetOpen(false);
  };
  const handleClearGoal = () => {
    clearStudyGoal();
    setGoal(null);
    setSheetOpen(false);
  };

  const dailyQuizReady = !!goalProject && goalWords.length > 0;
  const dailyQuizCount = Math.min(GOAL_DAILY_QUESTION_COUNT, goalWords.length);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)]">
      <div className="mx-auto w-full max-w-[520px]">
        <div className="flex items-center justify-between px-[18px] pb-3 pt-2">
          <div>
            <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">
              GOAL
            </div>
            <h1 className="font-display text-[22px] font-black leading-none text-[var(--solid-ink)]">目標</h1>
          </div>
          <button
            type="button"
            onClick={() => openSheet()}
            disabled={loading && projects.length === 0}
            aria-label="目標を設定"
            className="flex h-[34px] items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
          >
            <Icon name="edit" size={14} />
            {goal ? '変更' : '設定'}
          </button>
        </div>

        {error && (
          <div className="px-[18px] pb-3">
            <div className="rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-xs font-bold text-[var(--color-error)]">
              {error}
            </div>
          </div>
        )}

        {/* 目標バナー: 「〇〇まであと N日」 */}
        <div className="px-[18px] pb-4">
          {!goalLoaded || (loading && !goalProject) ? (
            <div className="h-[56px] animate-pulse rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]" />
          ) : goalProject && remainingDays !== null ? (
            <button
              type="button"
              onClick={() => openSheet()}
              className="w-full rounded-[14px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] px-4 py-3.5 text-center transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <div className="font-display text-[19px] font-black leading-tight text-[var(--color-on-accent)]">
                {describeGoalCountdown(goalProject.title, remainingDays)}
              </div>
              <div className="mt-1 text-[11px] font-bold text-[var(--color-on-accent)]/85">
                目標日 {goal?.targetDate.replaceAll('-', '/')} · 習得 {goalMemory.mastered}/{goalMemory.total}語
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openSheet()}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-4 text-[14px] font-black text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="flag" size={18} className="text-[var(--color-accent)]" />
              {goal && !goalProject && !loading ? '目標の単語帳が見つかりません。設定し直す' : '単語帳を選んで目標を設定する'}
            </button>
          )}
        </div>

        {/* 月間カレンダー */}
        <div className="px-[18px] pb-5">
          <GoalCalendar
            today={today}
            goalDate={goalProject ? goal?.targetDate ?? null : null}
            studiedDays={studiedDays}
            onSelectDate={(dateKey) => openSheet(dateKey)}
          />
        </div>

        {/* 今日の10問 (目標の単語帳から) */}
        <div className="px-[18px] pb-3">
          <BigPillLink
            href={dailyQuizReady && goalProject ? goalDailyQuizHref(goalProject.id) : null}
            icon="quiz"
            badge={String(dailyQuizCount || GOAL_DAILY_QUESTION_COUNT)}
            title={`今日の${dailyQuizCount || GOAL_DAILY_QUESTION_COUNT}問`}
            sub={
              !goalProject
                ? '目標を設定すると解けます'
                : goalWords.length === 0
                  ? '目標の単語帳に単語がありません'
                  : todayAnswered > 0
                    ? `今日 ${todayAnswered}問 解答済み`
                    : goalProject.title
            }
            tone="accent"
          />
        </div>

        {/* 今日復習しておきたい単語 (SM-2 の復習期限) */}
        <div className="px-[18px] pb-3">
          <BigPillLink
            href={dueCount > 0 ? GOAL_REVIEW_QUIZ_HREF : null}
            icon="replay"
            badge={dueCount > 0 ? String(dueCount) : '0'}
            title="今日復習しておきたい単語"
            sub={
              loading
                ? '読み込み中...'
                : dueCount > 0
                  ? `復習期限の語 ${dueCount}語 (全単語帳)`
                  : '今日の復習はありません'
            }
            tone="ink"
          />
        </div>
      </div>

      <GoalSetupSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projects={sheetProjects}
        current={goal}
        initialTargetDate={sheetInitialDate}
        onSave={handleSaveGoal}
        onClear={handleClearGoal}
      />
    </div>
  );
}

function GoalCalendar({
  today,
  goalDate,
  studiedDays,
  onSelectDate,
}: {
  today: Date | null;
  goalDate: string | null;
  studiedDays: Set<string>;
  /** 今日以降の日付をタップしたとき (過去の日は目標日にできないので反応しない) */
  onSelectDate: (dateKey: string) => void;
}) {
  // null = まだ月送りしていない → 今月 (今日が確定するまでは仮の月を出す)
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const year = cursor?.year ?? today?.getFullYear() ?? 2026;
  const month = cursor?.month ?? today?.getMonth() ?? 0;
  const cells = useMemo(() => buildCalendarMonth(year, month), [year, month]);
  const todayKey = today ? toLocalDateKey(today) : null;

  const moveMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <section className="overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-2 py-2">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label="前の月"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
        >
          <Icon name="chevron_left" size={20} />
        </button>
        <div className="font-display text-[16px] font-black text-[var(--solid-ink)]">
          {year}年 {month + 1}月
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          aria-label="次の月"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
        >
          <Icon name="chevron_right" size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 bg-[var(--solid-ink)] text-center text-[11px] font-black text-[var(--color-on-ink)]">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1.5">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, index) => {
          const isToday = !!cell.key && cell.key === todayKey;
          const isGoal = !!cell.key && cell.key === goalDate;
          const studied = !!cell.key && studiedDays.has(cell.key);
          // 今日が確定するまではどの日も選べない (SSR/初回描画中)。過去の日も選べない
          const selectable = !!cell.key && !!todayKey && cell.key >= todayKey;
          const cellStyle = { borderRightWidth: index % 7 === 6 ? 0 : undefined, borderBottomWidth: index >= 35 ? 0 : undefined };
          const cellClass = 'relative flex h-[46px] w-full flex-col items-center border-b border-r border-[var(--color-border)] pt-1.5 text-[13px] font-bold';
          if (cell.day === null) {
            return <div key={`blank-${index}`} className={cellClass} style={cellStyle} aria-hidden />;
          }
          const label = `${cell.key}${isToday ? ' 今日' : ''}${isGoal ? ' 目標日' : ''}${studied ? ' 学習済み' : ''}`;
          return (
            <button
              key={cell.key}
              type="button"
              disabled={!selectable}
              onClick={() => cell.key && onSelectDate(cell.key)}
              aria-label={selectable ? `${label} を目標日にする` : label}
              className={`${cellClass} ${selectable ? 'active:bg-[var(--color-surface-secondary)]' : 'cursor-default'}`}
              style={cellStyle}
            >
              {cell.day !== null && (
                <>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full leading-none ${
                      isToday
                        ? 'bg-[var(--color-error)] text-white'
                        : selectable
                          ? 'text-[var(--solid-ink)]'
                          : 'text-[var(--color-muted)]'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {studied && !isToday && (
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
                  )}
                  {isGoal && (
                    <Icon
                      name="flag"
                      size={14}
                      filled
                      className="absolute right-1 top-1 text-[var(--color-error)]"
                    />
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-[10px] font-bold text-[var(--color-muted)]">
        <span>日付をタップして目標日を設定</span>
        <span className="inline-flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />学習した日</span>
        <span className="inline-flex items-center gap-1"><Icon name="flag" size={12} filled className="text-[var(--color-error)]" />目標日</span>
        </span>
      </div>
    </section>
  );
}

function BigPillLink({
  href,
  icon,
  badge,
  title,
  sub,
  tone,
}: {
  href: string | null;
  icon: string;
  badge: string;
  title: string;
  sub: string;
  tone: 'accent' | 'ink';
}) {
  const enabled = href !== null;
  const className = `flex w-full items-center gap-3 rounded-full border-2 px-3 py-2.5 text-left transition-all duration-100 ${
    !enabled
      ? 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-muted)]'
      : tone === 'accent'
        ? 'border-[var(--color-accent-ink)] bg-[var(--color-accent)] text-[var(--color-on-accent)] active:translate-x-px active:translate-y-px'
        : 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] active:translate-x-px active:translate-y-px'
  }`;
  const inner = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-black ${
          !enabled
            ? 'bg-[var(--color-surface)] text-[var(--color-muted)]'
            : tone === 'accent'
              ? 'bg-[var(--color-on-accent)] text-[var(--color-accent)]'
              : 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
        }`}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] font-black leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] font-bold opacity-85">{sub}</span>
      </span>
      <Icon name={enabled ? 'arrow_forward' : icon} size={20} className="shrink-0" />
    </>
  );
  if (!enabled) {
    return <div className={className} aria-disabled>{inner}</div>;
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
