'use client';

/**
 * ホームの一番上の「今日やること」。
 *
 * 目標 (/goal で決める単語帳 (セクション) + 期日) が無ければ全単語帳の「今日復習しておきたい単語」、
 * 目標を設定するとその目標の「今日の10問」に切り替わる (`resolveTodayStudy`)。
 * 目標は端末の localStorage にあるので、サーバー描画と初回の水和では「目標なし」で描き、
 * クライアントで読み直す (useSyncExternalStore の server snapshot)。
 */

import { useMemo, useSyncExternalStore } from 'react';
import { BigPillLink } from '@/components/goal/BigPillLink';
import {
  GOAL_DAILY_QUESTION_COUNT,
  buildGoalDailyQuizHref,
  buildGoalReviewQuizHref,
  describeGoalCountdown,
  getStudyGoal,
  parseLocalDateKey,
  resolveTodayStudy,
  toLocalDateKey,
  type GoalCandidateProject,
  type StudyGoal,
} from '@/lib/goal/study-goal';
import { writeReviewProjectFilter } from '@/lib/quiz/review-project-filter';

const HOME_DAILY_QUIZ_HREF = buildGoalDailyQuizHref('/');
const HOME_REVIEW_QUIZ_HREF = buildGoalReviewQuizHref('/');

// 別タブで目標を変えたときにも追いつく。同じタブでは /goal から戻るとホームが描き直される。
function subscribeStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
// snapshot は毎回同じ値を返す必要があるので、オブジェクトではなく文字列で持つ。
const readGoalSnapshot = () => JSON.stringify(getStudyGoal());
const readTodaySnapshot = () => toLocalDateKey(new Date());
const serverNull = () => 'null';
const serverToday = () => '';

export function HomeTodayStudy({
  projects,
  dueCount,
  loading,
  className,
}: {
  projects: GoalCandidateProject[];
  dueCount: number;
  loading: boolean;
  className?: string;
}) {
  const goalSnapshot = useSyncExternalStore(subscribeStorage, readGoalSnapshot, serverNull);
  const todayKey = useSyncExternalStore(subscribeStorage, readTodaySnapshot, serverToday);

  const study = useMemo(() => {
    const goal = JSON.parse(goalSnapshot) as StudyGoal | null;
    const today = todayKey ? parseLocalDateKey(todayKey) : null;
    return resolveTodayStudy({ goal, projects, dueCount, today });
  }, [goalSnapshot, todayKey, projects, dueCount]);

  if (study.kind === 'goal') {
    const count = study.questionCount || GOAL_DAILY_QUESTION_COUNT;
    return (
      <div className={className}>
        <BigPillLink
          href={study.questionCount > 0 ? HOME_DAILY_QUIZ_HREF : null}
          onNavigate={() => writeReviewProjectFilter(study.projectIds, study.sectionsByProject)}
          icon="quiz"
          badge={String(count)}
          title={`今日の${count}問`}
          sub={
            study.questionCount === 0
              ? '目標の単語帳に単語がありません'
              : study.remainingDays !== null
                ? describeGoalCountdown(study.title, study.remainingDays)
                : study.title
          }
          tone="accent"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <BigPillLink
        href={study.dueCount > 0 ? HOME_REVIEW_QUIZ_HREF : null}
        onNavigate={() => writeReviewProjectFilter(null)}
        icon="replay"
        badge={String(study.dueCount)}
        title="今日復習しておきたい単語"
        sub={
          loading
            ? '読み込み中...'
            : study.dueCount > 0
              ? undefined
              : '今日の復習はありません'
        }
        tone="accent"
      />
    </div>
  );
}
