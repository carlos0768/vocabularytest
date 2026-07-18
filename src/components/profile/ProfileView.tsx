'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { SolidPanel } from '@/components/redesign/SolidPage';
import type { CachedStats } from '@/lib/stats-cache';

const HEAT_COLORS = [
  'rgba(26,26,26,0.07)',
  'rgba(61,122,78,0.35)',
  'rgba(61,122,78,0.7)',
  'var(--color-success)',
];

// Site-wide avatar/thumbnail palette (matches home, collections, shared, feed, stats).
export const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

export function profileAvatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }
  return THUMBS[Math.abs(hash) % THUMBS.length];
}

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  return 3;
}

export type ProfileCounts = { following: number; followers: number; friends: number };

export function ProfileView({
  title,
  backHref,
  editHref,
  name,
  accountId,
  initial,
  color,
  joined,
  planLabel,
  counts,
  followingHref = '/friends',
  followersHref = '/friends',
  friendsHref = '/friends',
  actions,
  stats,
  statsLoading,
}: {
  title: string;
  backHref: string;
  editHref?: string;
  name: string;
  accountId: string | null;
  initial: string;
  color: string;
  joined: string | null;
  planLabel?: string | null;
  counts: ProfileCounts | null;
  followingHref?: string;
  followersHref?: string;
  friendsHref?: string;
  actions?: ReactNode;
  stats: CachedStats | null;
  statsLoading: boolean;
}) {
  const router = useRouter();

  // Prefer returning to the actual previous page (e.g. the group the user came
  // from) when we arrived here via in-app navigation. Fall back to backHref on
  // direct loads / fresh PWA launches where there is no in-app history to pop.
  const handleBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      event.preventDefault();
      router.back();
    }
  };

  const recentWeek = stats?.weeklyStats.slice(-7) ?? [];
  const weekTotal = recentWeek.reduce((sum, item) => sum + item.totalCount, 0);
  const maxWeekValue = Math.max(1, ...recentWeek.map((item) => item.totalCount));
  const activity = stats?.activityHistory ?? [];
  const heat = activity.map((item) => heatLevel(item.quizCount));
  const totalDays = activity.filter((item) => item.quizCount > 0).length;
  const avgPerDay = Math.round(weekTotal / 7);
  const totalWords = stats?.totalWords ?? 0;
  const mastered = stats?.masteredWords ?? 0;
  const review = stats?.reviewWords ?? 0;
  const newWords = stats?.newWords ?? 0;
  const masteryPercent = totalWords > 0 ? Math.round((mastered / totalWords) * 100) : 0;

  return (
    <>
    <DesktopProfileView
      title={title}
      editHref={editHref}
      name={name}
      accountId={accountId}
      initial={initial}
      color={color}
      joined={joined}
      planLabel={planLabel}
      counts={counts}
      followingHref={followingHref}
      followersHref={followersHref}
      friendsHref={friendsHref}
      actions={actions}
      stats={stats}
      statsLoading={statsLoading}
      derived={{ recentWeek, weekTotal, maxWeekValue, heat, totalDays, avgPerDay, totalWords, mastered, review, newWords, masteryPercent }}
    />
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="mx-auto w-full max-w-xl">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-[18px] pb-1 pt-1">
          <Link
            href={backHref}
            onClick={handleBack}
            aria-label="戻る"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
          >
            <Icon name="arrow_back" size={22} />
          </Link>
          <div className="min-w-0 flex-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {title}
          </div>
          {editHref && (
            <Link
              href={editHref}
              aria-label="プロフィールを編集"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
            >
              <Icon name="settings" size={22} />
            </Link>
          )}
        </div>

        {/* Profile header */}
        <div className="px-[18px] pb-[14px] pt-2">
          <div className="flex items-center gap-4">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[20px] border-2 border-[var(--solid-ink)] font-display text-[36px] font-extrabold text-white"
              style={{ backgroundColor: color }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[22px] font-extrabold leading-tight text-[var(--solid-ink)]">
                {name}
              </div>
              {accountId && (
                <div className="mt-0.5 truncate font-mono text-[12px] font-bold text-[var(--color-muted)]">
                  @{accountId}
                </div>
              )}
              {(planLabel || joined) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {planLabel && (
                    <span className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--solid-ink)] px-[7px] py-[2px] font-mono text-[9px] font-bold tracking-[0.05em] text-white">
                      <Icon name="auto_awesome" size={10} />
                      {planLabel}
                    </span>
                  )}
                  {joined && (
                    <span className="font-mono text-[10px] font-bold text-[var(--color-muted)]">
                      {joined}から
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Counts */}
          <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
            <CountCell href={followingHref} label="フォロー中" value={counts?.following} />
            <CountCell href={followersHref} label="フォロワー" value={counts?.followers} border />
            <CountCell href={friendsHref} label="フレンド" value={counts?.friends} border />
          </div>

          {actions && <div className="mt-3 flex items-center gap-2">{actions}</div>}
        </div>

        {/* Overview / stats */}
        <div className="px-[18px] pb-1 pt-2">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            OVERVIEW
          </div>
          <div className="mt-0.5 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            学習の記録
          </div>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : !stats ? (
          <div className="px-[18px] pt-3">
            <SolidPanel className="!rounded-[14px]" faceClassName="!p-6 text-center text-sm text-[var(--color-muted)]">
              統計を読み込めませんでした
            </SolidPanel>
          </div>
        ) : (
          <div className="pt-3">
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
      </div>
    </div>
    </>
  );
}

type ProfileDerivedStats = {
  recentWeek: NonNullable<CachedStats['weeklyStats']>;
  weekTotal: number;
  maxWeekValue: number;
  heat: number[];
  totalDays: number;
  avgPerDay: number;
  totalWords: number;
  mastered: number;
  review: number;
  newWords: number;
  masteryPercent: number;
};

function DesktopProfileView({
  title,
  editHref,
  name,
  accountId,
  initial,
  color,
  joined,
  planLabel,
  counts,
  followingHref,
  followersHref,
  friendsHref,
  actions,
  stats,
  statsLoading,
  derived,
}: {
  title: string;
  editHref?: string;
  name: string;
  accountId: string | null;
  initial: string;
  color: string;
  joined: string | null;
  planLabel?: string | null;
  counts: ProfileCounts | null;
  followingHref: string;
  followersHref: string;
  friendsHref: string;
  actions?: ReactNode;
  stats: CachedStats | null;
  statsLoading: boolean;
  derived: ProfileDerivedStats;
}) {
  const { recentWeek, weekTotal, maxWeekValue, heat, totalDays, avgPerDay, mastered, review, newWords, masteryPercent } = derived;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title={title} crumb="アカウント">
        {editHref && (
          <DesktopButton href={editHref} icon="settings">
            プロフィールを編集
          </DesktopButton>
        )}
      </DesktopTopbar>

      <div className="ds-scroll">
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          {/* Profile header */}
          <div className="ds-card" style={{ padding: '26px 30px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 22,
                  border: '2px solid var(--solid-ink)',
                  background: color,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 38,
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
                {accountId && (
                  <div className="mono muted" style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>@{accountId}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  {planLabel && <span className="ds-tag accent">{planLabel}</span>}
                  {joined && <span className="mono muted" style={{ fontSize: 11, fontWeight: 700 }}>{joined}から</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 26, flexShrink: 0 }}>
              <DesktopCountCell href={followingHref} label="フォロー中" value={counts?.following} />
              <DesktopCountCell href={followersHref} label="フォロワー" value={counts?.followers} />
              <DesktopCountCell href={friendsHref} label="フレンド" value={counts?.friends} />
            </div>
          </div>

          {actions && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, maxWidth: 420 }}>{actions}</div>
          )}

          {/* Overview / stats */}
          {statsLoading ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
              <Icon name="progress_activity" className="animate-spin" />
              <span style={{ marginLeft: 8 }}>読み込み中...</span>
            </div>
          ) : !stats ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
              統計を読み込めませんでした
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 18 }}>
                <div className="ds-card ds-kpi">
                  <div className="ic" style={{ background: 'rgba(249,115,22,0.12)' }}><Icon name="local_fire_department" style={{ color: '#f97316' }} /></div>
                  <div className="v">{stats.quizStats.streakDays}<span className="u">日</span></div>
                  <div className="l">連続日数</div>
                </div>
                <div className="ds-card ds-kpi">
                  <div className="ic" style={{ background: 'var(--color-surface-secondary)' }}><Icon name="event_available" style={{ color: 'var(--color-ink)' }} /></div>
                  <div className="v">{totalDays}<span className="u">日</span></div>
                  <div className="l">累計学習日</div>
                </div>
                <div className="ds-card ds-kpi">
                  <div className="ic" style={{ background: 'var(--color-accent-light)' }}><Icon name="quiz" style={{ color: 'var(--color-accent-ink)' }} /></div>
                  <div className="v">{weekTotal}<span className="u">語</span></div>
                  <div className="l">今週の復習</div>
                </div>
                <div className="ds-card ds-kpi">
                  <div className="ic" style={{ background: 'var(--color-surface-secondary)' }}><Icon name="speed" style={{ color: 'var(--color-ink)' }} /></div>
                  <div className="v">{avgPerDay}<span className="u">語</span></div>
                  <div className="l">1日平均</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 18 }}>
                {/* Weekly bars */}
                <div className="ds-card" style={{ padding: '22px 26px' }}>
                  <div className="ds-sec-head" style={{ marginBottom: 18 }}>
                    <div>
                      <h2 style={{ fontSize: 16 }}>過去 7 日間</h2>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>復習した単語数</div>
                    </div>
                    <span className="mono tnum" style={{ fontSize: 12 }}>
                      <b style={{ fontSize: 15 }}>{weekTotal}</b> 語
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
                    {recentWeek.map((item, i) => {
                      const isToday = i === recentWeek.length - 1;
                      const h = Math.max(4, (item.totalCount / maxWeekValue) * 110);
                      const date = new Date(`${item.date}T00:00:00`);
                      return (
                        <div key={item.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                          <div className="mono tnum" style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--solid-ink)' : 'var(--color-muted)' }}>
                            {item.totalCount}
                          </div>
                          <div
                            style={{
                              width: '100%',
                              maxWidth: 38,
                              height: h,
                              borderRadius: 4,
                              border: '1px solid var(--solid-ink)',
                              background: isToday ? 'var(--color-accent)' : 'rgba(26,26,26,0.82)',
                            }}
                          />
                          <div style={{ fontSize: 11, color: isToday ? 'var(--solid-ink)' : 'var(--color-muted)', fontWeight: isToday ? 700 : 500 }}>
                            {date.toLocaleDateString('ja-JP', { weekday: 'short' }).replace('曜日', '')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Heatmap */}
                <div className="ds-card" style={{ padding: '22px 26px' }}>
                  <div className="ds-sec-head" style={{ marginBottom: 18 }}>
                    <div>
                      <h2 style={{ fontSize: 16 }}>過去 12 週</h2>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>学習ヒートマップ</div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>
                      少
                      {[0, 1, 2, 3].map((l) => (
                        <HeatCell key={l} level={l} size={10} />
                      ))}
                      多
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 4 }}>
                    {Array.from({ length: 12 }).map((_, col) => (
                      <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Array.from({ length: 7 }).map((__, row) => (
                          <HeatCell key={row} level={heat[col * 7 + row] ?? 0} size={16} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 8 }}>
                    <span>12週前</span>
                    <span>今週</span>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="ds-card" style={{ padding: '22px 26px' }}>
                <div className="mono muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                  BREAKDOWN
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{masteryPercent}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>%</span>
                  <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>習得済</span>
                </div>
                <div className="ds-dist" style={{ margin: '14px 0 12px' }}>
                  <span className="c-mastered" style={{ flex: mastered || 0.0001 }} />
                  <span className="c-review" style={{ flex: review || 0.0001 }} />
                  <span className="c-new" style={{ flex: newWords || 0.0001 }} />
                </div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <span className="ds-status mastered"><span className="ds-sdot c-mastered" />習得 {mastered.toLocaleString()}</span>
                  <span className="ds-status review"><span className="ds-sdot c-review" />学習中 {review.toLocaleString()}</span>
                  <span className="ds-status new"><span className="ds-sdot c-new" />未学習 {newWords.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DesktopCountCell({ href, label, value }: { href: string; label: string; value: number | undefined }) {
  return (
    <Link href={href} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit', minWidth: 72 }}>
      <span className="tnum" style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, lineHeight: 1 }}>
        {value ?? '–'}
      </span>
      <span className="mono muted" style={{ display: 'block', fontSize: 10, fontWeight: 700, marginTop: 5 }}>
        {label}
      </span>
    </Link>
  );
}

function CountCell({
  href,
  label,
  value,
  border,
}: {
  href: string;
  label: string;
  value: number | undefined;
  border?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center py-2.5 transition-colors active:bg-[var(--color-surface-secondary)] ${border ? 'border-l-2 border-[var(--solid-ink)]' : ''}`}
    >
      <span className="font-display text-[20px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
        {value ?? '–'}
      </span>
      <span className="mt-1 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-muted)]">
        {label}
      </span>
    </Link>
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
