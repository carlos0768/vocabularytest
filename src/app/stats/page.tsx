'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { DesktopStatsView } from '@/components/desktop/DesktopStats';
import { Icon } from '@/components/ui/Icon';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { getStats, type CachedStats } from '@/lib/stats-cache';
import type { FriendProfile, FriendTimelineSession } from '@/lib/friends/types';

const HEAT_COLORS = [
  'rgba(26,26,26,0.07)',
  'rgba(61,122,78,0.35)',
  'rgba(61,122,78,0.7)',
  'var(--color-success)',
];

const AVATAR_PALETTE = [
  '#f97316', '#06b6d4', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f59e0b', '#6366f1', '#10b981',
];

function avatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

type StatsLoadState = {
  authKey: string;
  stats: CachedStats | null;
};

type TimelineApiResponse = {
  success?: boolean;
  sessions?: FriendTimelineSession[];
  error?: string;
};

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  return 3;
}

function displayName(profile: FriendProfile): string {
  return profile.username?.trim() || `@${profile.accountId}`;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StatsPage() {
  const { user, subscription, isPro, wasPro, isAuthenticated, loading: authLoading } = useAuth();
  const authStatsKey = authLoading ? null : user?.id ?? 'guest';
  const [statsState, setStatsState] = useState<StatsLoadState | null>(null);
  const stats = statsState?.authKey === authStatsKey ? statsState.stats : null;
  const statsLoading = authLoading || (authStatsKey !== null && statsState?.authKey !== authStatsKey);

  const [showStats, setShowStats] = useState(false);
  const [sessions, setSessions] = useState<FriendTimelineSession[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading || !authStatsKey) return;

    let cancelled = false;
    const subscriptionStatus = subscription?.status ?? 'free';

    getStats(subscriptionStatus, user?.id ?? null, isPro, wasPro)
      .then((freshStats) => {
        if (cancelled) return;
        setStatsState({ authKey: authStatsKey, stats: freshStats });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load stats:', error);
        setStatsState({ authKey: authStatsKey, stats: null });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, authStatsKey, isPro, subscription?.status, user?.id, wasPro]);

  const loadTimeline = useCallback(async () => {
    if (!isAuthenticated) {
      setTimelineLoading(false);
      return;
    }
    setTimelineLoading(true);
    try {
      const response = await fetch('/api/friends/timeline?limit=40', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as TimelineApiResponse | null;
      if (response.ok && payload?.success) {
        setSessions(payload.sessions ?? []);
      }
    } catch {
      // timeline is best-effort
    } finally {
      setTimelineLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    void loadTimeline();
  }, [authLoading, loadTimeline]);

  const toggleSession = (sessionId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const recentWeek = useMemo(() => stats?.weeklyStats.slice(-7) ?? [], [stats?.weeklyStats]);
  const weekTotal = recentWeek.reduce((sum, item) => sum + item.totalCount, 0);
  const maxWeekValue = Math.max(1, ...recentWeek.map((item) => item.totalCount));
  const activity = useMemo(() => stats?.activityHistory ?? [], [stats?.activityHistory]);
  const heat = activity.map((item) => heatLevel(item.quizCount));
  const totalDays = activity.filter((item) => item.quizCount > 0).length;
  const avgPerDay = Math.round(weekTotal / 7);
  const totalWords = stats?.totalWords ?? 0;
  const mastered = stats?.masteredWords ?? 0;
  const review = stats?.reviewWords ?? 0;
  const newWords = stats?.newWords ?? 0;
  const masteryPercent = totalWords > 0 ? Math.round((mastered / totalWords) * 100) : 0;

  const userInitial = (user?.email || '?').charAt(0).toUpperCase();
  const userColor = avatarColor(user?.id ?? 'guest');

  return (
    <>
      <DesktopStatsView stats={stats} loading={statsLoading} />
      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] lg:hidden">
        <div className="flex items-center gap-3 px-[18px] pb-2 pt-4">
          <button
            type="button"
            onClick={() => setShowStats((v) => !v)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 font-display text-[16px] font-extrabold text-white transition-all ${showStats ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30' : 'border-[var(--solid-ink)]'}`}
            style={{ backgroundColor: userColor }}
            aria-label="学習統計を表示"
          >
            {userInitial}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[20px] font-extrabold leading-tight text-[var(--solid-ink)]">
              進歩
            </div>
          </div>
          <Link
            href="/friends"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-3 text-[11px] font-bold text-[var(--solid-ink)]"
          >
            <Icon name="group" size={15} />
            フレンド
          </Link>
        </div>

        <AnimatePresence>
          {showStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {statsLoading ? (
                <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
                  <Icon name="progress_activity" size={20} className="animate-spin" />
                  <span className="ml-2 text-sm">読み込み中...</span>
                </div>
              ) : !stats ? (
                <div className="px-[18px] pb-3">
                  <SolidPanel className="!rounded-[14px]" faceClassName="!p-6 text-center text-sm text-[var(--color-muted)]">
                    統計を読み込めませんでした
                  </SolidPanel>
                </div>
              ) : (
                <div className="pb-2">
                  <div className="grid grid-cols-2 gap-2 px-[18px] pb-3">
                    <KPI label="連続日数" value={stats.quizStats.streakDays} suffix="日" accent icon="local_fire_department" />
                    <KPI label="累計学習日" value={totalDays} suffix="日" />
                    <KPI label="今週の復習" value={weekTotal} suffix="語" />
                    <KPI label="1日平均" value={avgPerDay} suffix="語" />
                  </div>

                  <div className="px-[18px] pb-3">
                    <SolidPanel className="!rounded-[14px]" faceClassName="!p-3.5">
                      <div className="mb-3 flex items-baseline justify-between">
                        <div>
                          <div className="font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">WEEKLY</div>
                          <div className="mt-px text-[13px] font-bold text-[var(--solid-ink)]">過去 7 日間</div>
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
                          <span className="text-sm font-bold text-[var(--solid-ink)]">{weekTotal}</span> 語
                        </div>
                      </div>
                      <div className="flex items-end gap-1.5" style={{ height: 90 }}>
                        {recentWeek.map((item, i) => {
                          const isToday = i === recentWeek.length - 1;
                          const h = Math.max(4, (item.totalCount / maxWeekValue) * 78);
                          const date = new Date(`${item.date}T00:00:00`);
                          return (
                            <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                              <div className="font-mono text-[9px] font-bold tabular-nums" style={{ color: isToday ? 'var(--solid-ink)' : 'var(--color-muted)' }}>
                                {item.totalCount}
                              </div>
                              <div
                                className="w-full rounded-[3px] border border-[var(--solid-ink)]"
                                style={{
                                  height: h,
                                  background: isToday ? 'var(--solid-ink)' : 'rgba(26,26,26,0.85)',
                                  boxShadow: isToday ? '2px 2px 0 var(--color-accent)' : 'none',
                                }}
                              />
                              <div className="text-[10px]" style={{ color: isToday ? 'var(--solid-ink)' : 'var(--color-muted)', fontWeight: isToday ? 700 : 500 }}>
                                {date.toLocaleDateString('ja-JP', { weekday: 'short' }).replace('曜日', '')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </SolidPanel>
                  </div>

                  <div className="px-[18px] pb-3">
                    <SolidPanel className="!rounded-[14px]" faceClassName="!p-3.5">
                      <div className="mb-2.5 flex items-baseline justify-between">
                        <div>
                          <div className="font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">HEATMAP</div>
                          <div className="mt-px text-[13px] font-bold text-[var(--solid-ink)]">過去 12 週</div>
                        </div>
                        <div className="flex items-center gap-1 font-mono text-[9px] text-[var(--color-muted)]">
                          <span>少</span>
                          {[0, 1, 2, 3].map((l) => (
                            <HeatCell key={l} level={l} size={10} />
                          ))}
                          <span>多</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-12 gap-[3px]">
                        {Array.from({ length: 12 }).map((_, col) => (
                          <div key={col} className="flex flex-col gap-[3px]">
                            {Array.from({ length: 7 }).map((__, row) => (
                              <HeatCell key={row} level={heat[col * 7 + row] ?? 0} />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-[var(--color-muted)]">
                        <span>12週前</span>
                        <span>今週</span>
                      </div>
                    </SolidPanel>
                  </div>

                  <div className="px-[18px] pb-3">
                    <SolidPanel className="!rounded-[14px]" faceClassName="!p-3.5">
                      <div className="mb-2 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">BREAKDOWN</div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-[32px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">{masteryPercent}</span>
                        <span className="text-[13px] font-bold text-[var(--solid-ink)]">%</span>
                        <span className="ml-1 text-[11px] text-[var(--color-muted)]">習得済</span>
                      </div>
                      <div className="mt-2.5 flex overflow-hidden rounded-[4px] border-2 border-[var(--solid-ink)]" style={{ height: 10 }}>
                        <div style={{ flex: mastered, background: 'var(--color-success)' }} />
                        <div style={{ flex: review, background: 'var(--color-warning)' }} />
                        <div style={{ flex: newWords, background: 'rgba(26,26,26,0.15)' }} />
                      </div>
                      <div className="mt-2 flex justify-between font-mono text-[10px]">
                        <BreakLeg color="var(--color-success)" label="習得" v={mastered} />
                        <BreakLeg color="var(--color-warning)" label="学習中" v={review} />
                        <BreakLeg color="rgba(26,26,26,0.15)" label="未学習" v={newWords} />
                      </div>
                    </SolidPanel>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {timelineLoading ? (
          <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="mx-[18px] mt-2 rounded-[16px] border-2 border-dashed border-[var(--color-border)] px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
              <Icon name="group" size={28} className="text-[var(--color-accent)]" />
            </div>
            <div className="font-display text-[15px] font-bold text-[var(--color-muted)]">フレンドの活動はまだありません</div>
            <div className="mt-1 text-[12px] text-[var(--color-muted)]">フレンドが学習を始めるとここに表示されます</div>
            <Link href="/friends" className="mt-4 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-4 py-2 text-[12px] font-bold text-[var(--solid-ink)]">
              <Icon name="person_add" size={14} />
              フレンドを見つける
            </Link>
          </div>
        ) : (
          sessions.map((session) => (
            <TimelineItem
              key={session.id}
              session={session}
              expanded={expanded.has(session.id)}
              onToggle={() => toggleSession(session.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function TimelineItem({
  session,
  expanded,
  onToggle,
}: {
  session: FriendTimelineSession;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-secondary)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3.5 px-[18px] py-4 text-left"
      >
        <FeedAvatar profile={session.profile} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{displayName(session.profile)}</span>
            <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">@{session.profile.accountId}</span>
            <span className="text-[var(--color-border)]">·</span>
            <span className="text-[12px] font-bold text-[var(--color-muted)]">{formatSessionTime(session.startedAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <MetricChip icon="quiz" label={`${session.answerCount}問`} variant="quiz" />
            <MetricChip icon="check_circle" label={`${session.masteredCount}語 習得`} variant="mastered" />
          </div>
        </div>
        <Icon name={expanded ? 'expand_less' : 'expand_more'} size={20} className="mt-1 shrink-0 text-[var(--color-muted)]" />
      </button>
      {expanded && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-[18px] py-4">
          <div className="pl-[52px]">
            {session.words.length > 0 ? (
              <div className="flex flex-col gap-2">
                {session.words.map((word) => (
                  <div key={word.id} className="rounded-[12px] border border-[#bbf7d0] bg-[var(--color-accent-subtle)] px-4 py-3">
                    <div className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{word.english}</div>
                    <div className="mt-0.5 text-[13px] font-bold text-[var(--color-muted)]">{word.japanese}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[var(--color-border)] px-4 py-4 text-center text-[13px] font-bold text-[var(--color-muted)]">
                習得済みに変わった単語はありません
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function FeedAvatar({ profile }: { profile: Pick<FriendProfile, 'username' | 'accountId'> }) {
  const label = (profile.username || profile.accountId || '?').charAt(0).toUpperCase();
  const color = avatarColor(profile.accountId);
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  );
}

function MetricChip({
  icon,
  label,
  variant = 'default',
}: {
  icon: string;
  label: string;
  variant?: 'quiz' | 'mastered' | 'default';
}) {
  const styles = {
    quiz: 'border-[#bbf7d0] bg-[var(--color-accent-light)] text-[var(--color-accent)]',
    mastered: 'border-[#fde68a] bg-[#fef3c7] text-[#92400e]',
    default: 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${styles[variant]}`}>
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
}

function KPI({
  label,
  value,
  suffix,
  icon,
  accent,
}: {
  label: string;
  value: number;
  suffix: string;
  icon?: string;
  accent?: boolean;
}) {
  return (
    <SolidPanel className="!rounded-xl" faceClassName="!p-3">
      <div
        className="flex items-center gap-1"
        style={{ color: accent ? 'var(--color-warning)' : 'var(--color-muted)' }}
      >
        {icon && <Icon name={icon} size={13} filled />}
        <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-[3px]">
        <span className="font-display text-[26px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
          {value.toLocaleString()}
        </span>
        {suffix && (
          <span className="text-[11px] font-bold text-[var(--color-muted)]">{suffix}</span>
        )}
      </div>
    </SolidPanel>
  );
}

function HeatCell({ level, size = 13 }: { level: number; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 2.5,
        background: HEAT_COLORS[level],
        border: level > 0 ? '1px solid rgba(26,26,26,0.12)' : 'none',
        flexShrink: 0,
      }}
    />
  );
}

function BreakLeg({ color, label, v }: { color: string; label: string; v: number }) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="h-2 w-2 rounded-[2px]"
        style={{ background: color, border: '1px solid var(--solid-ink)' }}
      />
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-bold tabular-nums text-[var(--solid-ink)]">{v.toLocaleString()}</span>
    </div>
  );
}
