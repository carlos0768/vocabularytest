'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SolidButton, SolidEmpty, SolidPanel } from '@/components/redesign/SolidPage';
import { ScanCaptureModal } from '@/components/home/ScanCaptureModal';
import { WelcomeOverlay } from '@/components/onboarding/WelcomeOverlay';
import { EmptyStateGuide } from '@/components/onboarding/EmptyStateGuide';
import { HintBanner } from '@/components/onboarding/HintBanner';
import { useOnboarding } from '@/hooks/use-onboarding';
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
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import {
  calculateHomeCompletionPercent,
  countHomeWordStatuses,
} from '@/lib/home/home-page-selectors';
import { getDailyStats, getStreakDays } from '@/lib/utils';
import type { Project, SubscriptionStatus, Word } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];
const GUEST_PREVIEW_WORDS = [
  { english: 'adapt', japanese: '適応する', status: '復習' },
  { english: 'evidence', japanese: '証拠', status: '新規' },
  { english: 'reliable', japanese: '信頼できる', status: '定着' },
];

type HomeStats = {
  dueCount: number;
  completedToday: number;
  streakDays: number;
  totalWords: number;
  mastered: number;
  review: number;
  newW: number;
};

type HomeProjectStats = ProjectWithStats & {
  reviewWords: number;
  newWords: number;
};

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
      return {
        ...project,
        reviewWords: words.filter((word) => word.status === 'review').length,
        newWords: words.filter((word) => word.status === 'new').length,
      };
    }),
    allWords: Object.values(wordsByProject).flat(),
  };
}

function buildHomeStats(allWords: Word[]): HomeStats {
  const daily = getDailyStats();
  const dueWords = getWordsDueForReview(allWords);
  const statusCounts = countHomeWordStatuses(allWords);
  return {
    dueCount: dueWords.length,
    completedToday: daily.todayCount,
    streakDays: getStreakDays(),
    totalWords: allWords.length,
    mastered: statusCounts.masteredTotal,
    review: statusCounts.learningTotal,
    newW: statusCounts.unlearnedTotal,
  };
}

const EMPTY_STATS: HomeStats = {
  dueCount: 0,
  completedToday: 0,
  streakDays: 0,
  totalWords: 0,
  mastered: 0,
  review: 0,
  newW: 0,
};

export default function HomePage() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { step: onboardingStep, loading: onboardingLoading, setStep: setOnboardingStep } = useOnboarding();
  const [projects, setProjects] = useState<HomeProjectStats[]>([]);
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingScans, setPendingScans] = useState<{ id: string; project_title: string }[]>([]);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [vocabScanOpen, setVocabScanOpen] = useState(false);
  const loadHomeRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const loadHome = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setProjects([]);
      setStats(EMPTY_STATS);
      setPendingScans([]);
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

      const result = await getProjectsWithWords(rawProjects, readRepo);
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
    if (authLoading || onboardingLoading) return;
    if (!user) {
      setWelcomeOpen(false);
      return;
    }
    if (onboardingStep === 'signed_up') {
      setWelcomeOpen(true);
      return;
    }
    setWelcomeOpen(false);
  }, [authLoading, onboardingLoading, onboardingStep, user]);

  const handleWelcomeSkip = useCallback(() => {
    setWelcomeOpen(false);
    void setOnboardingStep('skipped');
  }, [setOnboardingStep]);

  // Pro: バックグラウンドスキャンのポーリング
  useEffect(() => {
    if (!user || !isPro || authLoading) return;
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
        const data = await res.json() as { jobs?: { id: string; status: string; project_title: string }[] };
        const active = (data.jobs ?? []).filter((j) => j.status === 'pending' || j.status === 'processing');
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
  }, [user, isPro, authLoading]);

  const { dueCount, completedToday, streakDays, totalWords, mastered, review, newW } = stats;
  const goalTotal = dueCount + completedToday;
  const goalProgress = goalTotal > 0 ? Math.round((completedToday / goalTotal) * 100) : 0;
  const visibleProjects = projects.slice(0, 3);

  if (authLoading) {
    return <HomeLoadingScreen />;
  }

  if (!user) {
    return <GuestHomePage />;
  }

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:pt-4">
      <div className="flex items-center justify-between px-[18px] pb-4 pt-2 lg:hidden">
        <div className="font-display text-[26px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-1 inline-block h-[5px] w-[5px] -translate-y-2 bg-[var(--color-accent)]" />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/favorites"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[2px_2px_0_var(--solid-ink)]"
            aria-label="お気に入り"
          >
            <Icon name="bookmark" size={16} filled />
          </Link>
          <div className="flex items-center gap-[5px] rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-1.5 shadow-[2px_2px_0_var(--solid-ink)]">
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

      <div className="grid grid-cols-2 gap-2.5 px-[18px] pb-3.5">
        <Link href={dueCount > 0 ? '/quiz/all?review=1&from=/' : '/projects'} className="block">
          <SolidPanel className="!rounded-2xl" faceClassName="!p-3 min-h-[120px]">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted)]">
              TODAY&apos;S GOAL
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">今日の目標</div>
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

      {onboardingStep === 'first_scan_done' && visibleProjects.length > 0 && (
        <div className="px-[18px] pb-3">
          <HintBanner
            icon="bolt"
            title="次はクイズで覚えよう！"
            description="作った単語帳を 4 択クイズで定着させましょう。"
            href={`/quiz/${visibleProjects[0].id}`}
            ctaLabel="クイズへ"
            tone="amber"
          />
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-[18px] pb-4">
        {pendingScans.map((job) => (
          <PendingScanRow key={job.id} title={job.project_title} />
        ))}
        {loading && visibleProjects.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : visibleProjects.length === 0 ? (
          onboardingStep === 'completed' || onboardingStep === 'first_scan_done' ? (
            <EmptyStateGuide onStartScan={() => setVocabScanOpen(true)} />
          ) : (
            <SolidEmpty
              icon="menu_book"
              title="単語帳はまだありません"
              description="スキャンまたは手入力で最初の単語帳を作成しましょう。"
              action={
                <Link href="/scan" className="solid-link-primary">
                  <Icon name="add_a_photo" size={16} />
                  新規スキャン
                </Link>
              }
            />
          )
        ) : (
          visibleProjects.map((project) => <ProjectRow key={project.id} project={project} />)
        )}
      </div>

      <ScanCaptureModal
        isOpen={vocabScanOpen}
        onClose={() => setVocabScanOpen(false)}
        defaultMode="vocab"
      />

      <WelcomeOverlay
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onSkip={handleWelcomeSkip}
        onStartScan={() => setVocabScanOpen(true)}
      />
    </div>
  );
}

function HomeLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] text-[var(--color-muted)]">
      <Icon name="progress_activity" size={22} className="animate-spin" />
    </div>
  );
}

function GuestHomePage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] font-[var(--font-body)] text-[var(--solid-ink)]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 lg:px-8">
        <Link href="/" className="flex items-baseline gap-2" aria-label="MERKEN home">
          <span className="font-display text-[24px] font-black leading-none tracking-[0.08em]">
            MERKEN
          </span>
          <span className="inline-block h-1.5 w-1.5 bg-[var(--color-accent)]" />
        </Link>
        <Link
          href="/login?redirect=/"
          className="rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-4 py-2 text-[12px] font-bold shadow-[2px_2px_0_var(--solid-ink)]"
        >
          ログイン
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 pb-28 pt-2 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-16 lg:pt-8">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-1.5 shadow-[2px_2px_0_var(--solid-ink)]">
            <Icon name="add_a_photo" size={15} className="text-[var(--color-accent)]" />
            <span className="text-[11px] font-black">写真から単語帳作成</span>
          </div>
          <h1 className="font-display text-[42px] font-black leading-[1.06] text-[var(--solid-ink)] lg:text-[64px]">
            覚えたい英単語を、
            <br />
            その場で単語帳に。
          </h1>
          <p className="mt-4 max-w-[560px] text-[15px] font-semibold leading-7 text-[var(--color-muted)] lg:text-[17px]">
            ノートやプリントを撮って、英単語を保存。作った単語帳はクイズと復習でそのまま覚えられます。
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <SolidButton href="/signup?redirect=/" variant="inverse" size="lg" iconRight="chevron_right">
              無料で始める
            </SolidButton>
            <SolidButton href="/login?redirect=/" size="lg" iconLeft="login">
              すでにアカウントがある
            </SolidButton>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {['メール登録', 'スキャン保存', '4択クイズ', '復習管理'].map((label) => (
              <span
                key={label}
                className="rounded-full border-[1.25px] border-[var(--color-border)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--solid-ink)]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <SolidPanel className="!rounded-[24px]" faceClassName="!p-4 lg:!p-5">
          <div className="rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[#faf7f1] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[var(--color-muted)]">
                  SAMPLE BOOK
                </div>
                <div className="mt-1 font-display text-[22px] font-black">英検プリント</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.25px] border-[var(--solid-ink)] bg-white shadow-[2px_2px_0_var(--solid-ink)]">
                <Icon name="menu_book" size={24} />
              </div>
            </div>

            <div className="space-y-2.5">
              {GUEST_PREVIEW_WORDS.map((word) => (
                <div
                  key={word.english}
                  className="flex items-center gap-3 rounded-[14px] border-[1.25px] border-[var(--color-border)] bg-white p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] font-display text-[15px] font-black">
                    {word.english.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-black">{word.english}</div>
                    <div className="truncate text-[11px] font-semibold text-[var(--color-muted)]">{word.japanese}</div>
                  </div>
                  <span className="rounded-full bg-[var(--solid-ink)] px-2 py-1 font-mono text-[9px] font-black text-white">
                    {word.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <GuestMetric value="3" label="保存" />
              <GuestMetric value="1" label="復習" />
              <GuestMetric value="0" label="未登録" />
            </div>
          </div>
        </SolidPanel>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#faf7f1] via-[#faf7f1] to-transparent px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-8 lg:hidden">
        <SolidButton href="/signup?redirect=/" variant="inverse" size="lg" className="w-full" iconRight="chevron_right">
          無料で始める
        </SolidButton>
      </div>
    </main>
  );
}

function GuestMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white px-2 py-3 text-center shadow-[2px_2px_0_var(--solid-ink)]">
      <div className="font-display text-[22px] font-black leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-bold text-[var(--color-muted)]">{label}</div>
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

function PendingScanRow({ title }: { title: string }) {
  return (
    <SolidPanel
      className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)]"
      faceClassName="!p-[13px]"
    >
      <div className="flex items-center gap-[13px]">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[rgba(26,26,26,0.06)]">
          <Icon name="progress_activity" size={20} className="animate-spin text-[var(--color-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{title}</div>
          <div className="mt-px font-mono text-[10px] text-[var(--color-muted)]">単語を抽出中...</div>
        </div>
      </div>
    </SolidPanel>
  );
}

function ProjectRow({ project }: { project: HomeProjectStats }) {
  const bg = thumbColor(project.id);
  return (
    <Link href={`/project/${project.id}`}>
      <SolidPanel
        className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:!shadow-[1px_1px_0_var(--solid-ink)]"
        faceClassName="!p-[13px]"
      >
        <div className="flex items-center gap-[13px]">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] font-display text-xl font-extrabold text-white"
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
            <div className="mt-[3px] flex gap-2.5">
              <DotLabel color="var(--color-success)" label={`習得 ${project.masteredWords}`} />
              <DotLabel color="var(--color-warning)" label={`学習 ${project.reviewWords}`} />
              <DotLabel color="rgba(26,26,26,0.2)" label={`未 ${project.newWords}`} />
            </div>
          </div>
        </div>
      </SolidPanel>
    </Link>
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
