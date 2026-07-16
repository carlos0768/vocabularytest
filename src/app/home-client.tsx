'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { GuestLanding } from '@/components/home/GuestLanding';
import { DesktopHomeView } from '@/components/desktop/DesktopHome';
import { SolidEmpty, SolidPanel } from '@/components/redesign/SolidPage';
import { ScanCaptureModal } from '@/components/home/ScanCaptureModal';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';
import { GeneratingProjectCard } from '@/components/project/GeneratingProjectCard';
import { PwaInstallBanner } from '@/components/home/PwaInstallBanner';
import { ProUpgradeBanner, useProUpgradeBannerDismissed } from '@/components/home/ProUpgradeBanner';
import { CoinBalancePill } from '@/components/coins/CoinBalancePill';
import { GuidedTour, type TourStep } from '@/components/onboarding/GuidedTour';
import { HomeAnnouncementSpotlight } from '@/components/announcements/HomeAnnouncementSpotlight';
import { JoinedGroupsSection } from '@/components/groups/JoinedGroupsSection';
import { useIsMobileViewport } from '@/hooks/use-is-mobile-viewport';
import { useMyGroups } from '@/hooks/use-my-groups';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useTutorialFlow } from '@/hooks/use-tutorial-flow';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase';
import { getDb, getRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import {
  buildProjectStats,
  getWordsByProjectMap,
  type ProjectWithStats,
  type WordReadRepository,
} from '@/lib/projects/load-helpers';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import {
  calculateHomeCompletionPercent,
  countHomeWordStatuses,
} from '@/lib/home/home-page-selectors';
import { summarizeWordMemory } from '@/lib/words/memory';
import {
  clearHomeGeneratingWordbook,
  consumeHomeGeneratingWordbook,
  type HomeGeneratingWordbookPayload,
} from '@/lib/home/home-session-storage';
import { getDailyStats, getStreakDays } from '@/lib/utils';
import { isBillingEnabled } from '@/lib/billing/feature';
import type { Project, SubscriptionStatus, Word } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];
const HOME_MY_BOOKS_VISIBLE_LIMIT = 5;

// Final tip of the guided flow: the play button as a quiz shortcut. Shown only
// once the flashcard→quiz flow is complete (tutorial stage 'done').
const PLAY_BUTTON_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="quiz-start"]',
    title: 'クイズはここからも',
    content: 'この再生ボタンから、単語帳を開かずに直接クイズを始められます。',
    placement: 'left',
  },
];

type HomeStats = {
  dueCount: number;
  completedToday: number;
  streakDays: number;
  totalWords: number;
  mastered: number;
  activeW: number;
  review: number;
  newW: number;
  favoriteCount: number;
  // False until at least one word has an actual review schedule (been quizzed).
  // Distinguishes a brand-new account (default wordbook imported, nothing studied
  // yet) from a user who has words waiting between review intervals.
  hasReviewSchedule: boolean;
};

type HomeProjectStats = ProjectWithStats & {
  reviewWords: number;
  newWords: number;
};

type HomePendingScan = {
  id: string;
  project_title: string;
  iconDataUrl?: string;
};

type RecentScanJob = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  project_title: string;
  error_message?: string | null;
};

// バックグラウンドスキャンが失敗したのに error_message が無い場合の予備文言。
// 「単語帳を撮影しなかった（＝単語が写っていない）」ケースを想定した、
// 理由が伝わる日本語メッセージを表示する。
const SCAN_JOB_FAILED_FALLBACK_MESSAGE =
  '画像から単語を読み取れませんでした。単語帳や英単語がはっきり写るように、もう一度撮影してください。';

function withHomeGeneratingFallbackId(
  payload: HomeGeneratingWordbookPayload,
): HomeGeneratingWordbookPayload {
  return {
    ...payload,
    id: payload.id ?? `generating-${Date.now()}`,
  };
}

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

async function getProjectsWithWords(
  projects: Project[],
  repo: WordReadRepository,
): Promise<{ projectsWithStats: HomeProjectStats[]; allWords: Word[] }> {
  const wordsByProject = await getWordsByProjectMap(
    repo,
    projects.map((project) => project.id),
  );
  return {
    projectsWithStats: buildProjectStats(projects, wordsByProject).map((project) => {
      const words = wordsByProject[project.id] ?? [];
      const memorySummary = summarizeWordMemory(words);
      return {
        ...project,
        reviewWords: memorySummary.learning,
        newWords: memorySummary.unlearned,
      };
    }),
    allWords: Object.values(wordsByProject).flat(),
  };
}

function buildHomeStats(allWords: Word[]): HomeStats {
  const daily = getDailyStats();
  const dueWords = getWordsDueForReview(allWords);
  const statusCounts = countHomeWordStatuses(allWords);
  const memorySummary = summarizeWordMemory(allWords);
  return {
    dueCount: dueWords.length,
    completedToday: daily.todayCount,
    streakDays: getStreakDays(),
    totalWords: memorySummary.total,
    mastered: statusCounts.masteredTotal,
    activeW: statusCounts.activeTotal,
    review: statusCounts.learningTotal,
    newW: statusCounts.unlearnedTotal,
    favoriteCount: allWords.filter((word) => word.isFavorite).length,
    hasReviewSchedule: allWords.some((word) => Boolean(word.nextReviewAt) || Boolean(word.lastReviewedAt)),
  };
}

function getQueuedWordCreateProjectId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const projectId = (data as Partial<Word>).projectId;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

async function getPendingLocalWordCreateProjectIds(): Promise<Set<string>> {
  try {
    const db = getDb();
    const pending = await db.syncQueue.toArray();
    return new Set(
      pending
        .filter((item) => item.table === 'words' && item.operation === 'create')
        .map((item) => getQueuedWordCreateProjectId(item.data))
        .filter((projectId): projectId is string => Boolean(projectId)),
    );
  } catch (error) {
    console.warn('Failed to inspect pending word sync queue:', error);
    return new Set();
  }
}

async function mergePendingLocalWordsIntoRemoteResult(
  remoteProjectsWithStats: HomeProjectStats[],
  remoteWords: Word[],
): Promise<{ projectsWithStats: HomeProjectStats[]; allWords: Word[] }> {
  const pendingProjectIds = await getPendingLocalWordCreateProjectIds();
  if (pendingProjectIds.size === 0 || remoteProjectsWithStats.length === 0) {
    return { projectsWithStats: remoteProjectsWithStats, allWords: remoteWords };
  }

  const affectedProjectIds = remoteProjectsWithStats
    .map((project) => project.id)
    .filter((projectId) => pendingProjectIds.has(projectId));
  if (affectedProjectIds.length === 0) {
    return { projectsWithStats: remoteProjectsWithStats, allWords: remoteWords };
  }

  const localWordsByProject = await localRepository.getAllWordsByProjectIds(affectedProjectIds);
  const mergedWordsByProject = new Map<string, Word[]>();
  for (const word of remoteWords) {
    const words = mergedWordsByProject.get(word.projectId) ?? [];
    words.push(word);
    mergedWordsByProject.set(word.projectId, words);
  }

  let changed = false;
  for (const projectId of affectedProjectIds) {
    const localWords = localWordsByProject[projectId] ?? [];
    if (localWords.length === 0) continue;
    const remoteProjectWords = mergedWordsByProject.get(projectId) ?? [];
    if (localWords.length <= remoteProjectWords.length) continue;
    mergedWordsByProject.set(projectId, localWords);
    changed = true;
  }

  if (!changed) {
    return { projectsWithStats: remoteProjectsWithStats, allWords: remoteWords };
  }

  const allWords = Array.from(mergedWordsByProject.values()).flat();
  return {
    projectsWithStats: buildProjectStats(remoteProjectsWithStats, Object.fromEntries(mergedWordsByProject)).map((project) => {
      const words = mergedWordsByProject.get(project.id) ?? [];
      const memorySummary = summarizeWordMemory(words);
      return {
        ...project,
        reviewWords: memorySummary.learning,
        newWords: memorySummary.unlearned,
      };
    }),
    allWords,
  };
}

const EMPTY_STATS: HomeStats = {
  dueCount: 0,
  completedToday: 0,
  streakDays: 0,
  totalWords: 0,
  mastered: 0,
  activeW: 0,
  review: 0,
  newW: 0,
  favoriteCount: 0,
  hasReviewSchedule: false,
};

export function HomeClient() {
  const router = useRouter();
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  useOnboarding();
  const { stage: tutorialStage, setStage: setTutorialStage } = useTutorialFlow();
  const isMobileViewport = useIsMobileViewport();
  const [projects, setProjects] = useState<HomeProjectStats[]>([]);
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingScans, setPendingScans] = useState<HomePendingScan[]>([]);
  const [recentScanJobs, setRecentScanJobs] = useState<RecentScanJob[]>([]);
  const [pendingGeneratingWordbook, setPendingGeneratingWordbook] = useState<HomeGeneratingWordbookPayload | null>(null);

  const [vocabScanOpen, setVocabScanOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const loadHomeRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const showHomeGeneratingWordbook = useCallback((payload: HomeGeneratingWordbookPayload) => {
    // 新しいスキャンを開始したら、前回の失敗メッセージが残っていても消す。
    setError(null);
    setPendingGeneratingWordbook(withHomeGeneratingFallbackId(payload));
  }, []);

  const loadHome = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setProjects([]);
      setStats(EMPTY_STATS);
      setPendingScans([]);
      setRecentScanJobs([]);
      setPendingGeneratingWordbook(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userId = user.id;
      let rawProjects: Project[] = [];
      let readRepo: WordReadRepository = repository;

      try {
        rawProjects = await localRepository.getProjects(userId);
        if (rawProjects.length > 0) {
          const localResult = await getProjectsWithWords(rawProjects, localRepository);
          setProjects(localResult.projectsWithStats);
          setStats(buildHomeStats(localResult.allWords));
          setLoading(false);
        }
      } catch (localError) {
        console.error('Local home preload failed:', localError);
      }

      if (user && navigator.onLine) {
        try {
          const remoteProjects = await remoteRepository.getProjects(user.id);
          if (remoteProjects.length > 0 || rawProjects.length === 0 || isPro) {
            rawProjects = remoteProjects;
            readRepo = remoteRepository;
          }
        } catch (remoteError) {
          console.error('Remote home load failed:', remoteError);
        }
      }

      if (rawProjects.length === 0) {
        rawProjects = await repository.getProjects(userId);
        readRepo = repository;
      }

      let result = await getProjectsWithWords(rawProjects, readRepo);
      if (readRepo === remoteRepository) {
        result = await mergePendingLocalWordsIntoRemoteResult(result.projectsWithStats, result.allWords);
      }
      setProjects(result.projectsWithStats);
      setStats(buildHomeStats(result.allWords));

      // Write remote data to local IndexedDB so the next navigation shows it instantly (no flash)
      if (readRepo === remoteRepository && rawProjects.length > 0) {
        try {
          const db = getDb();
          await db.projects.bulkPut(rawProjects);
          if (result.allWords.length > 0) {
            await db.words.bulkPut(result.allWords);
          }
        } catch {
          // Non-critical — local cache write failure doesn't affect the UI
        }
      }
    } catch (loadError) {
      console.error('Failed to load home data:', loadError);
      setError('ホームの読み込みに失敗しました');
      setProjects([]);
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isPro, repository, user]);

  useEffect(() => {
    loadHomeRef.current = loadHome;
  }, [loadHome]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    try {
      const payload = consumeHomeGeneratingWordbook(sessionStorage);
      if (payload) {
        showHomeGeneratingWordbook(payload);
      }
    } catch {
      // sessionStorage may be unavailable in restricted browser contexts.
    }
  }, [showHomeGeneratingWordbook]);


  // Pro: バックグラウンドスキャンのポーリング
  useEffect(() => {
    if (!user || authLoading || (!isPro && !pendingGeneratingWordbook)) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const hadActiveRef = { current: false };

    const poll = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/scan-jobs', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = await res.json() as { jobs?: RecentScanJob[] };
        const jobs = data.jobs ?? [];
        const active = jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
        setRecentScanJobs(jobs);
        setPendingScans(active.map((j) => ({ id: j.id, project_title: j.project_title })));
        if (active.length === 0) {
          if (hadActiveRef.current) {
            hadActiveRef.current = false;
            void loadHomeRef.current();
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
          }
        } else {
          hadActiveRef.current = true;
        }
      } catch { /* silent */ }
    };

    void poll();
    intervalId = setInterval(poll, 2000);
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [user, isPro, authLoading, pendingGeneratingWordbook]);

  useEffect(() => {
    const linkedJobId = pendingGeneratingWordbook?.linkedJobId;
    if (!linkedJobId) return;

    const linkedJob = recentScanJobs.find((job) => job.id === linkedJobId);
    if (!linkedJob) return;

    if (
      linkedJob.status === 'pending'
      || linkedJob.status === 'processing'
      || linkedJob.status === 'completed'
      || linkedJob.status === 'failed'
    ) {
      setPendingGeneratingWordbook(null);
      try {
        clearHomeGeneratingWordbook(sessionStorage);
      } catch {
        // Ignore storage failures; state is already cleared.
      }
    }

    if (linkedJob.status === 'completed') {
      void loadHomeRef.current();
    }

    // 失敗（単語ゼロなど）した場合、以前は「生成中」カードが理由も出さず
    // 消えるだけでユーザーが困っていた。サーバーが記録した理由を必ず表示する。
    if (linkedJob.status === 'failed') {
      setError(linkedJob.error_message?.trim() || SCAN_JOB_FAILED_FALLBACK_MESSAGE);
    }
  }, [pendingGeneratingWordbook?.linkedJobId, recentScanJobs]);

  const { dueCount, completedToday, streakDays, totalWords, mastered, review, newW, favoriteCount, hasReviewSchedule } = stats;
  const unmasteredCount = newW + review;
  const goalTotal = dueCount + completedToday;
  const goalProgress = goalTotal > 0 ? Math.round((completedToday / goalTotal) * 100) : 0;
  const dailyLearnTarget = Math.min(unmasteredCount, 10);
  const learnProgress = dailyLearnTarget > 0
    ? Math.min(100, Math.round((completedToday / dailyLearnTarget) * 100))
    : 0;
  // `start`: brand-new account with a default wordbook but no review schedule yet
  // (nothing quizzed). Showing the full unlearned backlog as the goal is
  // demotivating, so surface a small, achievable daily learning target instead.
  const goalState: 'review' | 'learn' | 'empty' | 'start' | 'done' =
    dueCount > 0
      ? 'review'
      : totalWords === 0
        ? 'empty'
        : !hasReviewSchedule
          ? 'start'
          : unmasteredCount === 0
            ? 'done'
            : 'learn';
  // The reel-saved backing wordbook is an internal bucket for 保存済み — keep it
  // out of the browsable マイ単語帳 list (its words still count in `stats`).
  const listProjects = useMemo(() => excludeReelSavedProjects(projects), [projects]);
  const visibleProjects = listProjects.slice(0, HOME_MY_BOOKS_VISIBLE_LIMIT);

  // The guided flow starts for any user who hasn't studied yet. Word status only
  // advances past 'new' via quiz/study, so any progress means they've quizzed.
  const hasStudiedBefore = completedToday > 0 || mastered > 0 || review > 0 || stats.activeW > 0;
  const firstProject = visibleProjects[0];
  const firstProjectHasWords = (firstProject?.totalWords ?? 0) > 0;
  const homeTourEligible = isMobileViewport && !!user && !loading && firstProjectHasWords;

  // Step 1 of the flow: nudge the user to open their wordbook. Only shown before
  // the flow has started (stage null) and only to users who haven't studied yet.
  const runOpenProjectTour = homeTourEligible && tutorialStage === null && !hasStudiedBefore;
  const openProjectTourSteps = useMemo<TourStep[]>(() => {
    if (!firstProject) return [];
    return [
      {
        target: '[data-tour="wordbook-row"]',
        title: 'まずは単語帳を開こう',
        content: '単語帳をタップして、中の単語を見てみましょう。',
        placement: 'bottom',
        data: {
          primaryAction: {
            label: '単語帳を開く',
            onClick: () => {
              setTutorialStage('open-flashcard');
              router.push(`/project/${firstProject.id}`);
            },
          },
        },
      },
    ];
  }, [firstProject, router, setTutorialStage]);

  // Final step of the flow: reveal the play button as a quiz shortcut, only once
  // the flashcard→quiz flow has completed (stage 'done').
  const runPlayButtonTour = homeTourEligible && tutorialStage === 'done';
  const displayedPendingScans = useMemo<HomePendingScan[]>(() => {
    if (!pendingGeneratingWordbook) return pendingScans;
    if (
      pendingGeneratingWordbook.linkedJobId
      && pendingScans.some((job) => job.id === pendingGeneratingWordbook.linkedJobId)
    ) {
      return pendingScans;
    }

    return [
      {
        id: pendingGeneratingWordbook.id ?? pendingGeneratingWordbook.linkedJobId ?? 'generating-wordbook',
        project_title: pendingGeneratingWordbook.title,
        iconDataUrl: pendingGeneratingWordbook.iconDataUrl,
      },
      ...pendingScans,
    ];
  }, [pendingGeneratingWordbook, pendingScans]);

  const [upgradeBannerDismissed, dismissUpgradeBanner] = useProUpgradeBannerDismissed();
  const showUpgradeBanner = isBillingEnabled() && !isPro && !upgradeBannerDismissed;
  // 参加中のグループ（マイ単語帳の下に表示。/shared から移設）
  const { groups: myGroups } = useMyGroups();

  if (authLoading) {
    return <HomeLoadingScreen />;
  }

  if (!user) {
    return <GuestLanding />;
  }

  return (
    <>
      <DesktopHomeView
        projects={listProjects}
        stats={stats}
        loading={loading}
        error={error}
        pendingScans={displayedPendingScans}
        joinedGroups={myGroups}
        onStartScan={() => router.push('/scan')}
        showUpgrade={showUpgradeBanner}
        onDismissUpgrade={dismissUpgradeBanner}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="flex items-center justify-between px-[18px] pb-4 pt-2 lg:hidden">
        <div className="font-display text-[26px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-1 inline-block h-[5px] w-[5px] -translate-y-2 bg-[var(--color-accent)]" />
        </div>
        <div className="flex items-center gap-2">
          <CoinBalancePill />
          <div className="flex items-center gap-[5px] rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-1.5">
            <span className="inline-flex text-[var(--color-warning)]">
              <Icon name="local_fire_department" size={13} filled />
            </span>
            <span className="font-mono text-xs font-bold text-[var(--solid-ink)]">{streakDays}</span>
            <span className="text-[10px] font-semibold text-[var(--color-muted)]">日連続</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-[18px] pb-3">
          <SolidPanel className="!rounded-[12px] border-[var(--color-error)]" faceClassName="!p-3 text-xs font-bold text-[var(--color-error)]">
            {error}
          </SolidPanel>
        </div>
      )}

      <PwaInstallBanner />

      <div className="grid grid-cols-2 gap-2.5 px-[18px] pb-3.5">
        {goalState === 'empty' ? (
          <button type="button" onClick={() => setVocabScanOpen(true)} className="block text-left">
            <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
                TODAY&apos;S GOAL
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex text-[var(--solid-ink)]">
                  <Icon name="photo_camera" size={26} />
                </span>
                <span className="font-display text-[18px] font-extrabold leading-tight text-[var(--solid-ink)]">
                  最初のスキャン
                </span>
              </div>
              <div className="mt-3.5 flex items-center gap-[3px] text-[var(--solid-ink)]">
                <span className="text-[13px] font-bold">スキャンを開始</span>
                <span className="inline-flex text-[var(--color-accent)]">
                  <Icon name="chevron_right" size={12} />
                </span>
              </div>
            </SolidPanel>
          </button>
        ) : goalState === 'start' ? (
          <Link href="/quiz/all?learn=1&from=/" className="block">
            <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
                TODAY&apos;S GOAL
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-[30px] font-extrabold tabular-nums leading-none text-[var(--solid-ink)]">
                  {dailyLearnTarget}
                </span>
                <span className="text-sm font-bold text-[var(--solid-ink)]">語</span>
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
                まずはここから
              </div>
              <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
                <div className="h-full bg-[var(--color-accent)]" style={{ width: `${learnProgress}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-[3px] text-[var(--solid-ink)]">
                <span className="text-[13px] font-bold">学習を始める</span>
                <span className="inline-flex text-[var(--color-accent)]">
                  <Icon name="chevron_right" size={12} />
                </span>
              </div>
            </SolidPanel>
          </Link>
        ) : goalState === 'done' ? (
          <div className="block">
            <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
                TODAY&apos;S GOAL
              </div>
              <div className="mt-5 flex items-center gap-1.5">
                <span className="inline-flex text-[var(--color-success)]">
                  <Icon name="check_circle" size={26} filled />
                </span>
                <span className="font-display text-[20px] font-extrabold leading-tight text-[var(--solid-ink)]">
                  復習完了
                </span>
              </div>
            </SolidPanel>
          </div>
        ) : goalState === 'learn' ? (
          <Link href="/quiz/all?learn=1&from=/" className="block">
            <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
                TODAY&apos;S GOAL
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-[30px] font-extrabold tabular-nums leading-none text-[var(--solid-ink)]">
                  {unmasteredCount}
                </span>
                <span className="text-sm font-bold text-[var(--solid-ink)]">語</span>
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
                未習得 ・ 本日 {completedToday} 語学習
              </div>
              <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
                <div className="h-full bg-[var(--color-accent)]" style={{ width: `${learnProgress}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-[3px] text-[var(--solid-ink)]">
                <span className="text-[13px] font-bold">学習を始める</span>
                <span className="inline-flex text-[var(--color-accent)]">
                  <Icon name="chevron_right" size={12} />
                </span>
              </div>
            </SolidPanel>
          </Link>
        ) : (
          <Link href="/quiz/all?review=1&from=/" className="block">
            <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
                TODAY&apos;S GOAL
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-[30px] font-extrabold tabular-nums leading-none text-[var(--solid-ink)]">
                  {dueCount}
                </span>
                <span className="text-sm font-bold text-[var(--solid-ink)]">語</span>
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
                {completedToday} / {goalTotal} 完了
              </div>
              <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
                <div className="h-full bg-[var(--color-accent)]" style={{ width: `${goalProgress}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-[3px] text-[var(--solid-ink)]">
                <span className="text-[13px] font-bold">復習を始める</span>
                <span className="inline-flex text-[var(--color-accent)]">
                  <Icon name="chevron_right" size={12} />
                </span>
              </div>
            </SolidPanel>
          </Link>
        )}

        <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
            MASTERY
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <MiniDonut mastered={mastered} review={review} total={totalWords} />
            <div className="flex flex-1 flex-col gap-[5px]">
              <LegendItem color="var(--color-success)" label="習得" count={mastered} />
              <LegendItem color="var(--color-warning)" label="学習中" count={review} />
              <LegendItem color="rgba(26,26,26,0.15)" label="未学習" count={newW} />
            </div>
          </div>
        </SolidPanel>
      </div>

      {showUpgradeBanner && (
        <div className="px-[18px] pb-3.5">
          <ProUpgradeBanner onDismiss={dismissUpgradeBanner} />
        </div>
      )}

      {favoriteCount > 0 && (
        <div className="px-[18px] pb-3.5">
          <Link href="/favorites" className="block">
            <SolidPanel className="!rounded-2xl" faceClassName="!p-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white">
                  <Icon name="bookmark" size={17} filled />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
                    SAVED WORDS
                  </div>
                  <div className="text-sm font-bold text-[var(--solid-ink)]">保存済み単語</div>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-display text-lg font-extrabold tabular-nums text-[var(--solid-ink)]">
                    {favoriteCount}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--color-muted)]">語</span>
                </div>
                <span className="inline-flex text-[var(--color-accent)]">
                  <Icon name="chevron_right" size={14} />
                </span>
              </div>
            </SolidPanel>
          </Link>
        </div>
      )}

      <div className="flex items-baseline justify-between px-5 pb-2.5 pt-3">
        <div>
          <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">
            MY BOOKS
          </div>
          <h2 className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">
            マイ単語帳
          </h2>
        </div>
        <Link href="/projects" className="flex items-center gap-[3px] text-[13px] font-semibold text-[var(--color-accent)]">
          すべて見る
          <Icon name="chevron_right" size={11} />
        </Link>
      </div>

      <div className="flex flex-col gap-2.5 px-[18px] pb-4">
        {displayedPendingScans.map((job) => (
          <GeneratingProjectCard
            key={job.id}
            title={job.project_title}
            iconDataUrl={job.iconDataUrl}
          />
        ))}
        {loading && visibleProjects.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : visibleProjects.length === 0 ? (
            <SolidEmpty
              icon="menu_book"
              title="単語帳はまだありません"
              description="スキャンまたは手入力で最初の単語帳を作成しましょう。"
              action={
                <button type="button" onClick={() => setCreateSheetOpen(true)} className="solid-link-primary">
                  <Icon name="add" size={16} />
                  単語帳を作成
                </button>
              }
            />
        ) : (
          visibleProjects.map((project, i) =>
            i === 0 ? (
              <div key={project.id} data-tour="wordbook-row">
                <ProjectRow
                  project={project}
                  tourAnchor
                  onCardOpen={runOpenProjectTour ? () => setTutorialStage('open-flashcard') : undefined}
                />
              </div>
            ) : (
              <ProjectRow key={project.id} project={project} />
            ),
          )
        )}
      </div>

      {/* 参加中のグループ（/shared から移設） */}
      <JoinedGroupsSection groups={myGroups} />

      </div>
      <ScanCaptureModal
        isOpen={vocabScanOpen}
        onClose={() => setVocabScanOpen(false)}
        defaultMode="vocab"
        onBackgroundScanStarted={showHomeGeneratingWordbook}
      />
      <CreateWordbookSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
      />
      <GuidedTour
        run={runOpenProjectTour}
        steps={openProjectTourSteps}
        onFinish={() => setTutorialStage('finished')}
      />
      <GuidedTour
        run={runPlayButtonTour}
        steps={PLAY_BUTTON_TOUR_STEPS}
        onFinish={() => setTutorialStage('finished')}
      />
      {/* 未読のお知らせを中央モーダルで1件表示(チュートリアルのツアー中は出さない) */}
      {!runOpenProjectTour && !runPlayButtonTour && <HomeAnnouncementSpotlight />}


    </>
  );
}

function HomeLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] text-[var(--color-muted)]">
      <Icon name="progress_activity" size={22} className="animate-spin" />
    </div>
  );
}

function MiniDonut({ mastered, review, total }: { mastered: number; review: number; total: number }) {
  const size = 74;
  const sw = 11;
  const r = (size - sw) / 2;
  const C = 2 * Math.PI * r;
  const mFrac = total ? mastered / total : 0;
  const rFrac = total ? review / total : 0;
  const pct = calculateHomeCompletionPercent(mastered, total);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(26,26,26,0.08)" strokeWidth={sw} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-success)"
          strokeWidth={sw}
          fill="none"
          strokeDasharray={`${C * mFrac} ${C * (1 - mFrac)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-warning)"
          strokeWidth={sw}
          fill="none"
          strokeDasharray={`${C * rFrac} ${C * (1 - rFrac)}`}
          strokeDashoffset={-C * mFrac}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-base font-extrabold tabular-nums leading-none text-[var(--solid-ink)]">
          {pct}<span className="text-[10px]">%</span>
        </div>
        <div className="mt-px text-[9px] text-[var(--color-muted)]">習得</div>
      </div>
    </div>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-[10px] text-[var(--color-muted)]">{label}</span>
      <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--solid-ink)]">{count}</span>
    </div>
  );
}

function ProjectRow({
  project,
  tourAnchor = false,
  onCardOpen,
}: {
  project: HomeProjectStats;
  tourAnchor?: boolean;
  /** Advances the guided tutorial when the wordbook card is tapped. */
  onCardOpen?: () => void;
}) {
  const bg = thumbColor(project.id);
  const hasWords = project.totalWords > 0;
  return (
    <SolidPanel
      className="!rounded-[14px]"
      faceClassName="!p-[13px]"
    >
      <div className="flex items-center gap-[13px]">
        <Link
          href={`/project/${project.id}`}
          onClick={onCardOpen}
          className="flex min-w-0 flex-1 items-center gap-[13px] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-xl font-extrabold text-white"
            style={{ background: project.iconImage ? `center / cover url(${project.iconImage})` : bg }}
          >
            {!project.iconImage && project.title.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{project.title}</div>
            <div className="mt-px flex items-baseline gap-0.5">
              <span className="font-display text-lg font-extrabold tabular-nums text-[var(--solid-ink)]">{project.totalWords}</span>
              <span className="ml-px text-[11px] font-bold text-[var(--color-muted)]">語</span>
            </div>
            {project.totalWords > 0 && (
              <div className="mt-[5px] flex h-[4px] overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
                {project.masteredWords > 0 && <div style={{ flex: project.masteredWords, background: 'var(--color-success)' }} />}
                {project.activeWords > 0 && <div style={{ flex: project.activeWords, background: '#2563eb' }} />}
                {project.reviewWords > 0 && <div style={{ flex: project.reviewWords, background: 'var(--color-warning)' }} />}
                {project.newWords > 0 && <div style={{ flex: project.newWords, background: 'rgba(26,26,26,0.12)' }} />}
              </div>
            )}
          </div>
        </Link>
        {hasWords && (
          <Link
            href={`/quiz/${project.id}?from=${encodeURIComponent('/')}`}
            aria-label={`${project.title}のクイズを開始`}
            data-tour={tourAnchor ? 'quiz-start' : undefined}
            className="flex h-[37px] w-[37px] shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-ink)]"
          >
            <Icon name="play_arrow" size={20} filled />
          </Link>
        )}
      </div>
    </SolidPanel>
  );
}

function DotLabel({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-[var(--color-muted)]">{label}</span>
    </span>
  );
}
