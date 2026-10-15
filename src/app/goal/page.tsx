'use client';

/**
 * 目標ページ (/goal)。下部バーの「目標」から開く。
 *
 * 目標は「どの単語帳を(複数可、セクション単位でも可)・いつまでに」で、単語帳の選択で指定する (端末に保存)。
 * ここに載せるのは 目標日までの残り日数 と 月間カレンダー (今日・目標日・学習した日)。
 * 「今日の10問」「今日復習しておきたい単語」はホームの一番上 (`HomeTodayStudy`) に置き、
 * 目標があれば前者、無ければ後者に切り替える。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { GoalSetupSheet, type GoalSheetProject } from '@/components/goal/GoalSetupSheet';
import { useAuth } from '@/hooks/use-auth';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { getRepository } from '@/lib/db';
import {
  CALENDAR_WEEKDAY_LABELS,
  buildCalendarMonth,
  clearStudyGoal,
  daysUntil,
  describeGoalCountdown,
  describeGoalProjectTarget,
  describeGoalProjectTitles,
  getStudyGoal,
  setStudyGoal,
  toLocalDateKey,
  type StudyGoal,
} from '@/lib/goal/study-goal';
import {
  buildWordSectionGroups,
  filterWordsBySectionScope,
  getSectionKeyLabel,
  resolveProjectSectionNames,
  UNSECTIONED_SECTION_KEY,
} from '@/lib/project/word-sections';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { getActivityHistory, getGuestUserId } from '@/lib/utils';
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
  const layoutMode = useLayoutMode();
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

  // 今日 / 学習履歴 もブラウザ側の値なのでマウント後に確定させる
  const [today, setToday] = useState<Date | null>(null);
  const [studiedDays, setStudiedDays] = useState<Set<string>>(() => new Set());
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
    () => projects.map((project) => {
      const words = wordsByProject[project.id] ?? [];
      const groups = buildWordSectionGroups(
        resolveProjectSectionNames(project.sectionNames, words),
        words,
        words,
      );
      if (groups.length < 2) return { id: project.id, title: project.title };
      return {
        id: project.id,
        title: project.title,
        sections: groups.map((group) => {
          const key = group.name ?? UNSECTIONED_SECTION_KEY;
          return { key, label: getSectionKeyLabel(key) };
        }),
      };
    }),
    [projects, wordsByProject],
  );

  // 目標の単語帳のうち、消されていないものだけ (表示だけ、保存は触らない)
  const goalProjects = useMemo(() => {
    if (!goal) return [];
    const idSet = new Set(goal.projectIds);
    return projects.filter((project) => idSet.has(project.id));
  }, [goal, projects]);
  const goalWords = useMemo(
    () => filterWordsBySectionScope(
      goalProjects.flatMap((project) => wordsByProject[project.id] ?? []),
      goal?.sectionsByProject,
    ),
    [goal, goalProjects, wordsByProject],
  );
  const goalMemory = useMemo(() => summarizeWordMemory(goalWords), [goalWords]);
  // 1語でも未習得なら 100% と出さない (四捨五入で「達成」に見えるのを避ける)
  const goalProgressPercent = goalMemory.total > 0
    ? Math.min(goalMemory.mastered === goalMemory.total ? 100 : 99, Math.round((goalMemory.mastered / goalMemory.total) * 100))
    : 0;
  const remainingDays = goal && today ? daysUntil(goal.targetDate, today) : null;

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

  const hasGoal = goalProjects.length > 0;
  const goalTitle = describeGoalProjectTitles(
    goalProjects.map((project) => describeGoalProjectTarget(project.title, goal?.sectionsByProject?.[project.id])),
  );

  // モバイルではスクロールさせず1画面に収める (useLockPageScroll)。高さは body が
  // 確保しているノッチ分 (env(safe-area-inset-top)) を引いた残りで、下の余白は
  // 浮いている下部バー (セーフエリア込み) の高さぶん。以前 h-dvh で閉じていた頃は
  // iPhone SE で下のほうが下部バーの裏に隠れたので、入りきらないときは
  // カレンダーの行の高さを縮めて吸収する (GoalCalendar)。
  // tablet / desktop はシェルがスクロールを持つので従来どおり。
  useLockPageScroll(layoutMode === 'phone');
  return (
    <div className="relative flex h-[calc(100dvh-env(safe-area-inset-top,0px))] flex-col overflow-hidden bg-[var(--color-background)] pb-[calc(110px+env(safe-area-inset-bottom,0px))] pt-3 font-[var(--font-body)] short:pt-1 desktop:block desktop:h-auto desktop:min-h-dvh desktop:overflow-visible tablet:block tablet:h-auto tablet:min-h-full tablet:overflow-visible tablet:pb-12 tablet:pt-4">
      {/* タブレット横向き: 左にカレンダー、右に 残り日数 を並べる。
          2 行目は error 用に空けてある (gap-y を持たせないので無いときは高さ 0) */}
      <div className="mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col desktop:block tablet:block tablet:max-w-[640px] tablet-regular:grid tablet-regular:max-w-[1040px] tablet-regular:grid-cols-2 tablet-regular:items-start tablet-regular:gap-x-8">
        <div className="shrink-0 px-[18px] pb-3 pt-2 short:pb-2 short:pt-1 tablet-regular:col-span-2">
          <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)] short:hidden">
            GOAL
          </div>
          <h1 className="font-display text-[22px] font-black leading-none text-[var(--solid-ink)]">目標</h1>
        </div>

        {error && (
          <div className="shrink-0 px-[18px] pb-3 tablet-regular:col-span-2">
            <div className="rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-xs font-bold text-[var(--color-error)]">
              {error}
            </div>
          </div>
        )}

        {/* 目標バナー: 「〇〇まであと N日」 */}
        <div className="shrink-0 px-[18px] pb-4 short:pb-2.5 tablet-regular:col-start-2 tablet-regular:row-start-3">
          {!goalLoaded || (loading && !hasGoal) ? (
            <div className="h-[56px] animate-pulse short:h-[48px] rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]" />
          ) : hasGoal && remainingDays !== null ? (
            <button
              type="button"
              onClick={() => openSheet()}
              className="w-full rounded-[14px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] px-4 py-3.5 text-center short:py-2 transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <div className="font-display text-[19px] font-black leading-tight text-[var(--color-on-accent)] short:text-[17px]">
                {describeGoalCountdown(goalTitle, remainingDays)}
              </div>
              <div className="mt-1 text-[11px] font-bold text-[var(--color-on-accent)]/85">
                目標日 {goal?.targetDate.replaceAll('-', '/')} · 習得 {goalMemory.mastered}/{goalMemory.total}語
              </div>
              {/* 達成度 = 目標の単語帳のうち習得済みの割合 */}
              <div className="mt-2 flex items-center gap-2 short:mt-1.5">
                <div
                  role="progressbar"
                  aria-label="目標の達成度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={goalProgressPercent}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-black/20"
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-warning)] transition-[width] duration-500"
                    style={{ width: `${goalProgressPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] font-black text-[var(--color-on-accent)]">
                  {goalProgressPercent}%
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openSheet()}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-4 text-[14px] font-black short:py-3 text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="flag" size={18} className="text-[var(--color-accent)]" />
              {goal && !hasGoal && !loading ? '目標の単語帳が見つかりません' : '単語帳を選んで目標を設定する'}
            </button>
          )}
        </div>

        {/* 月間カレンダー */}
        <div className="flex min-h-0 shrink flex-col px-[18px] pb-5 short:pb-2.5 tablet-regular:col-start-1 tablet-regular:row-start-3">
          <GoalCalendar
            today={today}
            goalDate={hasGoal ? goal?.targetDate ?? null : null}
            studiedDays={studiedDays}
            onSelectDate={(dateKey) => openSheet(dateKey)}
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

/**
 * 表示中はスマホレイアウトでページのスクロールを止める。body は
 * min-height: 100dvh + padding-top: safe-area なので、止めないとノッチ分だけ
 * 常にスクロールできてしまう。tablet / desktop はシェル (.ds-live-main) が
 * スクロールを持つので触らない。
 */
function useLockPageScroll(lock: boolean) {
  useEffect(() => {
    if (!lock) return;
    const root = document.documentElement;
    const body = document.body;
    const prev = { root: root.style.overflow, body: body.style.overflow };
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prev.root;
      body.style.overflow = prev.body;
    };
  }, [lock]);
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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-2 py-2 short:py-1">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label="前の月"
          className="flex h-8 w-8 items-center justify-center rounded-[12px] text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)] short:h-7 short:w-7"
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
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)] short:h-7 short:w-7"
        >
          <Icon name="chevron_right" size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 bg-[var(--solid-ink)] text-center text-[11px] font-black text-[var(--color-on-ink)]">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1.5 short:py-1">{label}</div>
        ))}
      </div>
      {/* 行の高さは上限つきで縮められる。画面に入りきらないときはここが縮み、
          ページ自体はスクロールしない */}
      <div className="grid min-h-0 shrink grid-cols-7 grid-rows-[repeat(6,minmax(0,46px))] short:grid-rows-[repeat(6,minmax(0,36px))]">
        {cells.map((cell, index) => {
          const isToday = !!cell.key && cell.key === todayKey;
          const isGoal = !!cell.key && cell.key === goalDate;
          const studied = !!cell.key && studiedDays.has(cell.key);
          // 今日が確定するまではどの日も選べない (SSR/初回描画中)。過去の日も選べない
          const selectable = !!cell.key && !!todayKey && cell.key >= todayKey;
          const cellStyle = { borderRightWidth: index % 7 === 6 ? 0 : undefined, borderBottomWidth: index >= 35 ? 0 : undefined };
          const cellClass = 'relative flex h-full min-h-0 w-full flex-col items-center overflow-hidden border-b border-r border-[var(--color-border)] pt-1.5 text-[13px] font-bold short:pt-1';
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
      <div className="flex items-center justify-end gap-3 px-3 py-1.5 text-[10px] short:py-1 font-bold text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />学習した日</span>
        <span className="inline-flex items-center gap-1"><Icon name="flag" size={12} filled className="text-[var(--color-error)]" />目標日</span>
      </div>
    </section>
  );
}
