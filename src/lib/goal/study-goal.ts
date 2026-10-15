/**
 * 目標ページ (/goal) の状態と純粋な計算。
 *
 * 目標は「どの単語帳 (のどのセクション) を・いつまでに」の組で、単語帳の選択で指定する。
 * 端末の localStorage に持つ (1日の復習上限などと同じ扱い)。
 * サーバーには無いので、SSR では常に null を返す。
 */

import {
  getSectionKeyLabel,
  normalizeSectionScope,
  type SectionScope,
} from '@/lib/project/word-sections';

const STORAGE_KEY = 'merken-study-goal';

/** 今日の N 問で出す問題数 */
export const GOAL_DAILY_QUESTION_COUNT = 10;

export interface StudyGoal {
  /** 目標にした単語帳 (複数選択可) */
  projectIds: string[];
  /** 単語帳ごとに目標にしたセクション。載っていない単語帳は全セクションが対象 */
  sectionsByProject?: SectionScope;
  /** 目標日 (YYYY-MM-DD、端末のローカル日付) */
  targetDate: string;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 旧形式 (単語帳1冊だけ、`projectId` 単数) から新形式への移行 */
interface LegacyStudyGoal {
  projectId: string;
  targetDate: string;
}

function isLegacyStudyGoal(value: unknown): value is LegacyStudyGoal {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LegacyStudyGoal>;
  return (
    typeof candidate.projectId === 'string'
    && candidate.projectId.length > 0
    && typeof candidate.targetDate === 'string'
    && DATE_KEY_PATTERN.test(candidate.targetDate)
  );
}

function isStudyGoal(value: unknown): value is StudyGoal {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StudyGoal>;
  return (
    Array.isArray(candidate.projectIds)
    && candidate.projectIds.length > 0
    && candidate.projectIds.every((id) => typeof id === 'string' && id.length > 0)
    && typeof candidate.targetDate === 'string'
    && DATE_KEY_PATTERN.test(candidate.targetDate)
  );
}

export function getStudyGoal(): StudyGoal | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isStudyGoal(parsed)) {
      const sectionsByProject = normalizeSectionScope(parsed.sectionsByProject);
      return {
        projectIds: parsed.projectIds,
        targetDate: parsed.targetDate,
        ...(sectionsByProject ? { sectionsByProject } : {}),
      };
    }
    if (isLegacyStudyGoal(parsed)) {
      return { projectIds: [parsed.projectId], targetDate: parsed.targetDate };
    }
    return null;
  } catch {
    return null;
  }
}

export function setStudyGoal(goal: StudyGoal): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goal));
  } catch {
    // ignore
  }
}

export function clearStudyGoal(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 端末のローカル日付で YYYY-MM-DD を作る。
 * `toISOString()` は UTC なので、日本の深夜 (0〜9時) に前日扱いになってしまう。
 * 目標日やカレンダーの「今日」はローカル日付で扱う。
 */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD をローカル時刻の 0:00 として解釈する。不正なら null */
export function parseLocalDateKey(key: string): Date | null {
  if (!DATE_KEY_PATTERN.test(key)) return null;
  const [y, m, d] = key.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * 目標日までの残り日数。今日なら 0、過ぎていれば負の値。
 * 日付の差だけを見るので、時刻や夏時間の影響を受けない。
 */
export function daysUntil(targetDate: string, today: Date = new Date()): number | null {
  const target = parseLocalDateKey(targetDate);
  if (!target) return null;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - todayStart.getTime()) / 86_400_000);
}

/** 目標バナーに出す単語帳名 (1冊ならそのまま、複数なら「〇〇ほかN冊」) */
export function describeGoalProjectTitles(projectTitles: string[]): string {
  if (projectTitles.length === 0) return '';
  if (projectTitles.length === 1) return projectTitles[0];
  return `${projectTitles[0]}ほか${projectTitles.length - 1}冊`;
}

/**
 * 目標の単語帳1冊ぶんの呼び名。セクションを絞っていれば
 * 1つなら「単語帳 セクション名」、複数なら「単語帳 (Nセクション)」。
 */
export function describeGoalProjectTarget(title: string, sectionKeys: readonly string[] | undefined): string {
  if (!sectionKeys || sectionKeys.length === 0) return title;
  if (sectionKeys.length === 1) return `${title} ${getSectionKeyLabel(sectionKeys[0]!)}`;
  return `${title} (${sectionKeys.length}セクション)`;
}

/** 目標バナーの文言 (「〇〇まであと7日」) */
export function describeGoalCountdown(projectTitle: string, remainingDays: number): string {
  if (remainingDays > 0) return `${projectTitle}まであと${remainingDays}日`;
  if (remainingDays === 0) return `${projectTitle}は今日が目標日！`;
  return `${projectTitle}の目標日から${-remainingDays}日経過`;
}

export interface CalendarCell {
  /** 月内の日付。前後の月の余白セルは null */
  day: number | null;
  /** YYYY-MM-DD (余白セルは null) */
  key: string | null;
}

/**
 * 月間カレンダーの升目 (月曜はじまり、6週ぶん = 42セル固定)。
 * 42 固定にするのは月ごとに行数が変わってレイアウトが跳ねないようにするため。
 */
export function buildCalendarMonth(year: number, monthIndex: number): CalendarCell[] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // getDay(): 日=0 … 土=6 → 月曜はじまりの並びに直す (月=0 … 日=6)
  const leadingBlanks = (first.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, key: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, key: toLocalDateKey(new Date(year, monthIndex, day)) });
  }
  while (cells.length < 42) cells.push({ day: null, key: null });
  return cells;
}

export const CALENDAR_WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

/**
 * 「今日の10問」へのリンク。目標の単語帳が複数あり得るので `/quiz/[projectId]` ではなく
 * `/quiz/all` を使い、絞り込みは `writeReviewProjectFilter` で別途渡す。
 * `from` はクイズを閉じたときの戻り先。
 */
export function buildGoalDailyQuizHref(from: string): string {
  return `/quiz/all?learn=1&count=${GOAL_DAILY_QUESTION_COUNT}&from=${encodeURIComponent(from)}`;
}

/** 「今日復習しておきたい単語」(SM-2 の復習期限が来た語、全単語帳横断) へのリンク */
export function buildGoalReviewQuizHref(from: string): string {
  return `/quiz/all?review=1&from=${encodeURIComponent(from)}`;
}

/** 目標の判定に要る単語帳の情報だけ。 */
export interface GoalCandidateProject {
  id: string;
  title: string;
  totalWords: number;
  /** セクション (未分類は空文字) ごとの語数。目標をセクションで絞ったときの問題数に使う */
  sectionWordCounts?: Record<string, number>;
}

/** 目標の範囲に入る語数。セクションで絞っていれば、そのセクションの語数の合計 */
export function countGoalProjectWords(
  project: GoalCandidateProject,
  sectionKeys: readonly string[] | undefined,
): number {
  if (!sectionKeys || !project.sectionWordCounts) return project.totalWords;
  const counts = project.sectionWordCounts;
  return sectionKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

/**
 * ホームの一番上に出す「今日やること」。
 *
 * 目標 (単語帳 + 期日) が決まっていればその目標の「今日の10問」、
 * 決まっていない (または目標の単語帳が全部消えた) ときは
 * 全単語帳の「今日復習しておきたい単語」に倒す。
 */
export type TodayStudy =
  | {
    kind: 'goal';
    projectIds: string[];
    /** 単語帳ごとに絞ったセクション (クイズの絞り込みにそのまま渡す) */
    sectionsByProject: SectionScope | null;
    title: string;
    remainingDays: number | null;
    /** 実際に出せる問題数 (目標の単語帳の語数が10未満ならその数。0 = 出せない) */
    questionCount: number;
  }
  | { kind: 'review'; dueCount: number };

export function resolveTodayStudy({
  goal,
  projects,
  dueCount,
  today,
}: {
  goal: StudyGoal | null;
  projects: GoalCandidateProject[];
  dueCount: number;
  today: Date | null;
}): TodayStudy {
  const goalIds = new Set(goal?.projectIds ?? []);
  const goalProjects = projects.filter((project) => goalIds.has(project.id));
  if (!goal || goalProjects.length === 0) return { kind: 'review', dueCount };
  const scope = goal.sectionsByProject;
  const totalWords = goalProjects.reduce(
    (sum, project) => sum + countGoalProjectWords(project, scope?.[project.id]),
    0,
  );
  return {
    kind: 'goal',
    projectIds: goalProjects.map((project) => project.id),
    sectionsByProject: scope && Object.keys(scope).length > 0 ? scope : null,
    title: describeGoalProjectTitles(
      goalProjects.map((project) => describeGoalProjectTarget(project.title, scope?.[project.id])),
    ),
    remainingDays: today ? daysUntil(goal.targetDate, today) : null,
    questionCount: Math.min(GOAL_DAILY_QUESTION_COUNT, totalWords),
  };
}
