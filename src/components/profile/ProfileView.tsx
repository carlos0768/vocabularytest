'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { SolidPanel } from '@/components/redesign/SolidPage';
import type { CachedStats } from '@/lib/stats-cache';
import { usePageScrolled } from '@/hooks/use-page-scrolled';

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
  settingsHref,
  name,
  accountId,
  initial,
  color,
  avatarUrl,
  joined,
  planLabel,
  counts,
  followingHref = '/follows?tab=following',
  followersHref = '/follows?tab=followers',
  friendsHref = '/follows?tab=following',
  actions,
  stats,
  statsLoading,
  withBottomNav = false,
}: {
  title: string;
  /** 未指定なら戻るボタンを出さない(ボトムナビ直下のタブ画面用) */
  backHref?: string;
  editHref?: string;
  /** 自分のプロフィールからのみ渡す。設定ページへの導線を表示する */
  settingsHref?: string;
  name: string;
  accountId: string | null;
  initial: string;
  color: string;
  /** 設定済みのアカウントアイコン(data URL)。未設定なら頭文字を表示する。 */
  avatarUrl?: string | null;
  joined: string | null;
  planLabel?: string | null;
  counts: ProfileCounts | null;
  followingHref?: string;
  followersHref?: string;
  friendsHref?: string;
  actions?: ReactNode;
  stats: CachedStats | null;
  statsLoading: boolean;
  /** ボトムナビが表示される画面ではナビに隠れないよう下部余白を広げる */
  withBottomNav?: boolean;
}) {
  const router = useRouter();
  const pageScrolled = usePageScrolled();

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
      settingsHref={settingsHref}
      name={name}
      accountId={accountId}
      initial={initial}
      color={color}
      avatarUrl={avatarUrl}
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
    <div
      className={`relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden ${
        withBottomNav ? 'pb-[110px]' : 'pb-[max(24px,env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="mx-auto w-full max-w-xl">
        {/* Top bar: スクロールしても上部に固定する */}
        <header
          className={`sticky z-40 flex items-center gap-2 border-b-2 bg-[var(--color-background)]/95 px-[18px] py-1.5 backdrop-blur-md ${
            pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'
          }`}
          style={{ top: 'env(safe-area-inset-top, 0px)' }}
        >
          {backHref ? (
            <Link
              href={backHref}
              onClick={handleBack}
              aria-label="戻る"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
            >
              <Icon name="arrow_back" size={22} />
            </Link>
          ) : (
            <div className="w-1 shrink-0" />
          )}
          <div className="min-w-0 flex-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {title}
          </div>
          {editHref && (
            <Link
              href={editHref}
              aria-label="プロフィールを編集"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
            >
              <Icon name="edit" size={22} />
            </Link>
          )}
          {settingsHref && (
            <Link
              href={settingsHref}
              aria-label="設定"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
            >
              <Icon name="settings" size={22} />
            </Link>
          )}
        </header>

        {/* Profile header */}
        <div className="px-[18px] pb-[14px] pt-2">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              avatarUrl={avatarUrl}
              initial={initial}
              color={color}
              size={80}
              radius={20}
              fontSize={36}
            />
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
  settingsHref,
  name,
  accountId,
  initial,
  color,
  avatarUrl,
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
  settingsHref?: string;
  name: string;
  accountId: string | null;
  initial: string;
  color: string;
  avatarUrl?: string | null;
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
  const kpis: Array<{ label: string; value: number; suffix: string; icon?: string; iconColor: string }> = [
    { label: '連続日数', value: stats?.quizStats.streakDays ?? 0, suffix: '日', icon: 'local_fire_department', iconColor: 'var(--color-warning)' },
    { label: '累計学習日', value: totalDays, suffix: '日', iconColor: 'var(--color-muted)' },
    { label: '今週の復習', value: weekTotal, suffix: '語', iconColor: 'var(--color-muted)' },
    { label: '1日平均', value: avgPerDay, suffix: '語', iconColor: 'var(--color-muted)' },
  ];

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title={title} crumb="ACCOUNT">
        {editHref && (
          <DesktopButton href={editHref} icon="edit" className="pill">
            編集
          </DesktopButton>
        )}
        {settingsHref && (
          <DesktopButton href={settingsHref} icon="settings" className="pill">
            設定
          </DesktopButton>
        )}
      </DesktopTopbar>

      <div className="ds-scroll">
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          {/* プロフィール: 左にアバター + 名前、右にフォロー数 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 24, paddingTop: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
              <ProfileAvatar
                avatarUrl={avatarUrl}
                initial={initial}
                color={color}
                size={80}
                radius={20}
                fontSize={36}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
                {accountId && (
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>@{accountId}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {planLabel && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 5, background: 'var(--solid-ink)', padding: '2px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: '#fff' }}>
                      <Icon name="auto_awesome" size={10} />
                      {planLabel}
                    </span>
                  )}
                  {joined && <span className="muted" style={{ fontSize: 10, fontWeight: 700 }}>{joined}から</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', overflow: 'hidden', borderRadius: 14, border: '2px solid var(--solid-ink)', background: '#fff' }}>
              <DesktopCountCell href={followingHref} label="フォロー中" value={counts?.following} />
              <DesktopCountCell href={followersHref} label="フォロワー" value={counts?.followers} border />
              <DesktopCountCell href={friendsHref} label="フレンド" value={counts?.friends} border />
            </div>
          </div>

          {actions && (
            <div style={{ display: 'flex', gap: 10, marginTop: 18, maxWidth: 420 }}>{actions}</div>
          )}

          <div style={{ padding: '24px 2px 10px' }}>
            <div className="ds-eyebrow" style={{ letterSpacing: '0.08em' }}>OVERVIEW</div>
            <div style={{ marginTop: 2, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--color-ink)' }}>学習の記録</div>
          </div>

          {/* Overview / stats */}
          {statsLoading ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)', boxShadow: 'none' }}>
              <Icon name="progress_activity" className="animate-spin" />
              <span style={{ marginLeft: 8 }}>読み込み中...</span>
            </div>
          ) : !stats ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)', boxShadow: 'none' }}>
              統計を読み込めませんでした
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                {kpis.map((kpi) => (
                  <div key={kpi.label} style={{ borderRadius: 12, border: '2px solid var(--solid-ink)', background: '#fff', padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: kpi.iconColor }}>
                      {kpi.icon && <Icon name={kpi.icon} size={13} filled />}
                      <span className="ds-eyebrow" style={{ fontSize: 9 }}>{kpi.label}</span>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, lineHeight: 1, color: 'var(--color-ink)' }}>
                        {kpi.value.toLocaleString()}
                      </span>
                      <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{kpi.suffix}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, paddingTop: 12 }}>
                {/* Weekly bars */}
                <div style={{ borderRadius: 14, border: '2px solid var(--solid-ink)', background: '#fff', padding: 14 }}>
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div>
                      <div className="ds-eyebrow">WEEKLY</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>過去 7 日間</div>
                    </div>
                    <div className="muted tnum" style={{ fontSize: 11 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{weekTotal}</span> 語
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                    {recentWeek.map((item, i) => {
                      const isToday = i === recentWeek.length - 1;
                      const h = Math.max(4, (item.totalCount / maxWeekValue) * 90);
                      const date = new Date(`${item.date}T00:00:00`);
                      return (
                        <div key={item.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div className="tnum" style={{ fontSize: 9, fontWeight: 700, color: isToday ? 'var(--solid-ink)' : 'var(--color-muted)' }}>
                            {item.totalCount}
                          </div>
                          <div
                            style={{
                              width: '100%',
                              maxWidth: 38,
                              height: h,
                              borderRadius: 3,
                              border: '1px solid var(--solid-ink)',
                              background: isToday ? 'var(--solid-ink)' : 'rgba(26,26,26,0.85)',
                              boxShadow: isToday ? '2px 2px 0 var(--color-accent)' : 'none',
                            }}
                          />
                          <div style={{ fontSize: 10, color: isToday ? 'var(--solid-ink)' : 'var(--color-muted)', fontWeight: isToday ? 700 : 500 }}>
                            {date.toLocaleDateString('ja-JP', { weekday: 'short' }).replace('曜日', '')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Heatmap */}
                <div style={{ borderRadius: 14, border: '2px solid var(--solid-ink)', background: '#fff', padding: 14 }}>
                  <div style={{ marginBottom: 10, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div>
                      <div className="ds-eyebrow">HEATMAP</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>過去 12 週</div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--color-muted)' }}>
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
                          <HeatCell key={row} level={heat[col * 7 + row] ?? 0} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginTop: 6 }}>
                    <span>12週前</span>
                    <span>今週</span>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ marginTop: 14, borderRadius: 14, border: '2px solid var(--solid-ink)', background: '#fff', padding: 14 }}>
                <div className="ds-eyebrow" style={{ marginBottom: 8 }}>BREAKDOWN</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, lineHeight: 1, color: 'var(--color-ink)' }}>{masteryPercent}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>%</span>
                  <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>習得済</span>
                </div>
                <div style={{ marginTop: 10, display: 'flex', height: 10, overflow: 'hidden', borderRadius: 4, border: '2px solid var(--solid-ink)' }}>
                  <div style={{ flex: mastered || 0.0001, background: 'var(--color-success)' }} />
                  <div style={{ flex: review || 0.0001, background: 'var(--color-warning)' }} />
                  <div style={{ flex: newWords || 0.0001, background: 'rgba(26,26,26,0.15)' }} />
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, maxWidth: 420 }}>
                  <BreakLeg color="var(--color-success)" label="習得" v={mastered} />
                  <BreakLeg color="var(--color-warning)" label="学習中" v={review} />
                  <BreakLeg color="rgba(26,26,26,0.15)" label="未学習" v={newWords} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DesktopCountCell({ href, label, value, border }: { href: string; label: string; value: number | undefined; border?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0',
        textDecoration: 'none', color: 'inherit', borderLeft: border ? '2px solid var(--solid-ink)' : undefined,
      }}
    >
      <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, lineHeight: 1 }}>
        {value ?? '–'}
      </span>
      <span className="muted" style={{ marginTop: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>
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
