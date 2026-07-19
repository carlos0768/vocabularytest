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
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { HomeReelRail } from '@/components/home/HomeReelRail';
import { HomeWordSearchSheet } from '@/components/home/HomeWordSearchSheet';
import { PwaInstallBanner } from '@/components/home/PwaInstallBanner';
import { ProUpgradeBanner, useProUpgradeBannerDismissed } from '@/components/home/ProUpgradeBanner';
import { CoinBalancePill } from '@/components/coins/CoinBalancePill';
import { GuidedTour, type TourStep } from '@/components/onboarding/GuidedTour';
import { HomeAnnouncementSpotlight } from '@/components/announcements/HomeAnnouncementSpotlight';
import { JoinedGroupsSection } from '@/components/groups/JoinedGroupsSection';
import { useIsMobileViewport } from '@/hooks/use-is-mobile-viewport';
import { useHomeRecommendations } from '@/hooks/use-home-recommendations';
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
import { countHomeWordStatuses } from '@/lib/home/home-page-selectors';
import { homeShortcutContentSlots } from '@/lib/home/shortcut-tiles';
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
  // スキャン失敗の理由表示。loadHome() が setError(null) するため error とは
  // 別に持ち、リロードせずポーリング検出の時点で即表示する。
  const [scanFailureNotice, setScanFailureNotice] = useState<string | null>(null);
  // 直前のポーリングで実行中(pending/processing)だったジョブID。次のポーリングで
  // failed に変わったものを検出して失敗理由を即表示するために使う。
  const watchedActiveJobIdsRef = useRef<Set<string>>(new Set());

  const [vocabScanOpen, setVocabScanOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  // デスクトップの新規作成はページ遷移せず中央モーダルで完結させる
  const [desktopCreateOpen, setDesktopCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const loadHomeRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const showHomeGeneratingWordbook = useCallback((payload: HomeGeneratingWordbookPayload) => {
    // 新しいスキャンを開始したら、前回の失敗メッセージが残っていても消す。
    setError(null);
    setScanFailureNotice(null);
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

        // 実行中として見えていたジョブが failed に変わった瞬間に理由を表示する。
        // （以前は「生成中」カードが理由も出さず消えるだけで、リロードするまで
        // 失敗に気づけなかった。）
        const newlyFailed = jobs.find(
          (j) => j.status === 'failed' && watchedActiveJobIdsRef.current.has(j.id),
        );
        if (newlyFailed) {
          setScanFailureNotice(
            `「${newlyFailed.project_title}」を作成できませんでした：${newlyFailed.error_message?.trim() || SCAN_JOB_FAILED_FALLBACK_MESSAGE}`,
          );
        }
        watchedActiveJobIdsRef.current = new Set(active.map((j) => j.id));
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
    // （ポーリングで実行中を経ずに最初から failed で見えた高速失敗ケース。）
    if (linkedJob.status === 'failed') {
      setScanFailureNotice(
        `「${linkedJob.project_title}」を作成できませんでした：${linkedJob.error_message?.trim() || SCAN_JOB_FAILED_FALLBACK_MESSAGE}`,
      );
    }
  }, [pendingGeneratingWordbook?.linkedJobId, recentScanJobs]);

  const { dueCount, completedToday, totalWords, mastered, review, newW, favoriteCount, hasReviewSchedule } = stats;
  const unmasteredCount = newW + review;
  const dailyLearnTarget = Math.min(unmasteredCount, 10);
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
  // ショートカットグリッドの TODAY'S GOAL タイルに出す語数（stateごとに意味が変わる）。
  const goalCount =
    goalState === 'review' ? dueCount : goalState === 'start' ? dailyLearnTarget : unmasteredCount;
  // The reel-saved backing wordbook is an internal bucket for 保存済み — keep it
  // out of the browsable マイ単語帳 list (its words still count in `stats`).
  const listProjects = useMemo(() => excludeReelSavedProjects(projects), [projects]);
  // ショートカットグリッドに載り切らなかった単語帳だけを下のマイ単語帳リストに
  // 出す（重複表示を避ける）。全部グリッドに収まる場合は従来どおり全件を出す
  // （新規ユーザーのチュートリアルが最初の ProjectRow をアンカーにしているため）。
  const gridProjectCount = Math.min(
    listProjects.length,
    homeShortcutContentSlots(favoriteCount > 0),
  );
  const overflowProjects = listProjects.slice(gridProjectCount);
  const myBooksProjects = overflowProjects.length > 0 ? overflowProjects : listProjects;
  const visibleProjects = myBooksProjects.slice(0, HOME_MY_BOOKS_VISIBLE_LIMIT);

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
  // ホームのおすすめ（英検級ベースの共有単語帳 + 語源あり単語限定のリール）
  const {
    books: recommendedBooks,
    reels: recommendedReels,
    loading: recommendationsLoading,
  } = useHomeRecommendations();

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
        goal={{ state: goalState, count: goalCount }}
        recommendedBooks={loading ? [] : recommendedBooks}
        recommendedReels={recommendedReels}
        recommendationsLoading={recommendationsLoading}
        onStartScan={() => setDesktopCreateOpen(true)}
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
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="自分の単語帳から検索"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="search" size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-[18px] pb-3">
          <SolidPanel className="!rounded-[12px] border-[var(--color-error)]" faceClassName="!p-3 text-xs font-bold text-[var(--color-error)]">
            {error}
          </SolidPanel>
        </div>
      )}

      {/* スキャン失敗の理由。ポーリング検出時に即表示し、リロード不要にする */}
      {scanFailureNotice && (
        <div className="px-[18px] pb-3">
          <SolidPanel className="!rounded-[12px] border-[var(--color-error)]" faceClassName="!p-3">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-xs font-bold leading-[1.5] text-[var(--color-error)]">
                {scanFailureNotice}
              </p>
              <button
                type="button"
                onClick={() => setScanFailureNotice(null)}
                aria-label="失敗メッセージを閉じる"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-error)]"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </SolidPanel>
        </div>
      )}

      <PwaInstallBanner />

      {/* Spotify風ショートカットグリッド: TODAY'S GOAL + 保存済み + 単語帳/グループ/おすすめ */}
      <HomeShortcutGrid
        goal={{ state: goalState, count: goalCount }}
        savedWordsCount={favoriteCount}
        projects={listProjects}
        groups={myGroups}
        recommendations={loading ? [] : recommendedBooks}
        onStartScan={() => setVocabScanOpen(true)}
      />

      {showUpgradeBanner && (
        <div className="px-[18px] pb-3.5">
          <ProUpgradeBanner onDismiss={dismissUpgradeBanner} />
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

      {/* おすすめのリール（語源がある単語限定・単語帳/グループより下に配置） */}
      <HomeReelRail items={recommendedReels} loading={recommendationsLoading} />

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
      {/* デスクトップの新規作成（ボトムシートではなく中央モーダル・遷移なし） */}
      <CreateWordbookSheet
        isOpen={desktopCreateOpen}
        onClose={() => setDesktopCreateOpen(false)}
        variant="modal"
      />
      {/* 自分の単語帳内の単語検索（ヘッダーの検索ボタンから）。
          開くたびにマウントし直して状態を初期化する */}
      {searchOpen && (
        <HomeWordSearchSheet onClose={() => setSearchOpen(false)} userId={user.id} />
      )}
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
