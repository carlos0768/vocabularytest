'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SolidEmpty, SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import {
  buildProjectStats,
  getWordsByProjectMap,
  type ProjectWithStats,
  type WordReadRepository,
} from '@/lib/projects/load-helpers';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import { getDailyStats, getGuestUserId, getStreakDays } from '@/lib/utils';
import type { Project, SubscriptionStatus, Word } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

type HistoryItem = {
  id: string;
  purpose: string;
  preview: string;
  score: number;
  wordCount: number;
  issueCount: number;
  createdAt: string;
};

function scoreColor(score: number): string {
  if (score >= 85) return 'var(--color-success)';
  if (score >= 70) return 'var(--color-accent)';
  if (score >= 60) return '#c8a02e';
  return '#c43d3d';
}

function formatWhen(value: string) {
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 日前`;
  return new Date(value).toLocaleDateString('ja-JP');
}

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
  return {
    dueCount: dueWords.length,
    completedToday: daily.todayCount,
    streakDays: getStreakDays(),
    totalWords: allWords.length,
    mastered: allWords.filter((word) => word.status === 'mastered').length,
    review: allWords.filter((word) => word.status === 'review').length,
    newW: allWords.filter((word) => word.status === 'new').length,
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
  const [projects, setProjects] = useState<HomeProjectStats[]>([]);
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correctionItems, setCorrectionItems] = useState<HistoryItem[]>([]);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [pendingScans, setPendingScans] = useState<{ id: string; project_title: string }[]>([]);
  const loadHomeRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const loadHome = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    setError(null);

    try {
      const userId = user ? user.id : getGuestUserId();
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

  // Pro: バックグラウンドスキャンのポーリング
  useEffect(() => {
    if (!user || !isPro || authLoading) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const hadActiveRef = { current: false };

    const poll = async () => {
      try {
        const res = await fetch('/api/scan-jobs');
        if (!res.ok) return;
        const data = await res.json() as { jobs?: { id: string; status: string; project_title: string }[] };
        const active = (data.jobs ?? []).filter((j) => j.status === 'pending' || j.status === 'processing');
        setPendingScans(active.map((j) => ({ id: j.id, project_title: j.project_title })));
        if (active.length === 0) {
          if (hadActiveRef.current) {
            hadActiveRef.current = false;
            void loadHomeRef.current();
          }
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
        } else {
          hadActiveRef.current = true;
        }
      } catch { /* silent */ }
    };

    void poll();
    intervalId = setInterval(poll, 5000);
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [user, isPro, authLoading]);

  useEffect(() => {
    if (authLoading || !user || !isPro || !navigator.onLine) return;
    let active = true;
    setCorrectionLoading(true);
    fetch('/api/correction/history')
      .then((r) => r.json())
      .then((data: { success: boolean; items?: HistoryItem[] }) => {
        if (active && data.success) setCorrectionItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => { if (active) setCorrectionLoading(false); });
    return () => { active = false; };
  }, [authLoading, user, isPro]);

  const { dueCount, completedToday, streakDays, totalWords, mastered, review, newW } = stats;
  const goalTotal = dueCount + completedToday;
  const goalProgress = goalTotal > 0 ? Math.round((completedToday / goalTotal) * 100) : 0;
  const visibleProjects = projects.slice(0, 3);

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[150px] pt-3 font-[var(--font-body)] lg:pt-4">
      <div className="flex items-center justify-between px-[18px] pb-4 pt-2 lg:hidden">
        <div className="font-display text-[26px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-1 inline-block h-[5px] w-[5px] -translate-y-2 bg-[var(--color-accent)]" />
        </div>
        <div className="flex items-center gap-[5px] rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-1.5 shadow-[2px_2px_0_var(--solid-ink)]">
          <span className="inline-flex text-[var(--color-warning)]">
            <Icon name="local_fire_department" size={13} filled />
          </span>
          <span className="font-mono text-xs font-bold text-[var(--solid-ink)]">{streakDays}</span>
          <span className="text-[10px] font-semibold text-[var(--color-muted)]">日連続</span>
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
        ) : (
          visibleProjects.map((project) => <ProjectRow key={project.id} project={project} />)
        )}
      </div>

      <div className="flex items-baseline justify-between px-5 pb-2.5 pt-3">
        <div>
          <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">CORRECTION</div>
          <h2 className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">添削</h2>
        </div>
      </div>

      <div className="px-[18px] pb-[150px]">
        {correctionLoading ? (
          <div className="flex items-center justify-center py-6 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={18} className="animate-spin" />
          </div>
        ) : correctionItems.length === 0 ? (
          <Link href="/correction" className="block">
            <SolidPanel className="!rounded-[14px] !shadow-[3px_4px_0_var(--color-accent)]" faceClassName="!p-3 min-h-[88px]">
              <div className="flex items-center gap-1.5 text-[var(--color-accent)]">
                <Icon name="edit_note" size={16} />
                <span className="font-mono text-[11px] font-bold tracking-[0.04em]">CORRECTION</span>
              </div>
              <div className="mt-1.5 text-[15px] font-bold leading-[1.35] text-[var(--solid-ink)]">英作文の添削</div>
              <div className="mt-[3px] text-[11px] leading-[1.45] text-[var(--color-muted)]">Pro向けAI添削に接続済み</div>
            </SolidPanel>
          </Link>
        ) : (
          <div className="flex flex-col gap-2.5">
            {correctionItems.slice(0, 3).map((item) => (
              <Link key={item.id} href={`/correction/result?id=${item.id}`} className="block">
                <SolidPanel
                  className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:!shadow-[1px_1px_0_var(--solid-ink)]"
                  faceClassName="!p-[13px]"
                >
                  <div className="flex items-stretch gap-[11px]">
                    <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-[8px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-background)]">
                      <div className="tabular-nums text-[19px] font-extrabold leading-none" style={{ fontFamily: 'var(--font-display)', color: scoreColor(item.score) }}>{item.score}</div>
                      <div className="mt-0.5 font-mono text-[7.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">SCORE</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-[3px] flex items-center gap-1.5">
                        <span className="rounded bg-[var(--solid-ink)] px-[5px] py-[1.5px] font-mono text-[8px] font-bold tracking-[0.06em] text-white">{item.purpose}</span>
                        <span className="font-mono text-[9px] text-[var(--color-muted)]">{formatWhen(item.createdAt)}</span>
                      </div>
                      <div className="line-clamp-2 text-[11.5px] italic leading-[1.5] text-[var(--solid-ink)]">{item.preview}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-[3px] font-mono text-[9px] font-bold text-[var(--color-muted)]"><span className="inline-block h-[5px] w-[5px] rounded-full bg-[#c43d3d]" />{item.issueCount} 指摘</span>
                        <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
                        <span className="font-mono text-[9px] font-semibold text-[var(--color-muted)]">{item.wordCount} 語</span>
                      </div>
                    </div>
                    <div className="shrink-0 self-center text-[var(--color-muted)]"><Icon name="chevron_right" size={14} /></div>
                  </div>
                </SolidPanel>
              </Link>
            ))}
          </div>
        )}
      </div>
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
  const pct = total ? Math.round((mastered / total) * 100) : 0;

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
