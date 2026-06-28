'use client';

import { DesktopButton, DesktopDonut } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui/Icon';
import type { DesktopStudySummaryStats } from '@/lib/desktop-study-summary';

export function DesktopStudySidebar({
  stats,
  reviewHref,
}: {
  stats: DesktopStudySummaryStats;
  reviewHref: string;
}) {
  const totalGoal = stats.dueCount + stats.completedToday;
  const goalProgress = totalGoal > 0 ? Math.round((stats.completedToday / totalGoal) * 100) : 0;
  const masteryPercent = stats.totalWords > 0 ? Math.round((stats.mastered / stats.totalWords) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
      <div className="ds-card" style={{ padding: '20px 22px' }}>
        <div className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>今日の目標</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
          <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, lineHeight: 1 }}>
            {stats.dueCount}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>語</span>
        </div>
        <div className="ds-prog" style={{ marginTop: 14 }}>
          <div className="fi" style={{ width: `${goalProgress}%` }} />
        </div>
        <div className="mono muted" style={{ fontSize: 11, marginTop: 6 }}>
          {stats.completedToday} / {totalGoal} 完了
        </div>
        <DesktopButton href={reviewHref} variant="accent" icon="play_arrow" className="w-full">
          復習を始める
        </DesktopButton>
      </div>

      <div className="ds-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, alignSelf: 'flex-start' }}>習得サマリー</div>
        <DesktopDonut mastered={stats.mastered} review={stats.review} total={stats.totalWords} size={130} stroke={17} percent={masteryPercent} />
        <div className="ds-legend" style={{ alignSelf: 'stretch' }}>
          <div className="row"><span className="ds-sdot c-mastered" /><span className="lb">習得</span><span className="ct tnum">{stats.mastered}</span></div>
          <div className="row"><span className="ds-sdot c-active" /><span className="lb">定着中</span><span className="ct tnum">{stats.activeW}</span></div>
          <div className="row"><span className="ds-sdot c-review" /><span className="lb">学習中</span><span className="ct tnum">{stats.review}</span></div>
          <div className="row"><span className="ds-sdot c-new" /><span className="lb">未学習</span><span className="ct tnum">{stats.newW}</span></div>
        </div>
      </div>

      <div className="ds-card ds-kpi" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
        <div className="ic" style={{ background: 'rgba(249,115,22,0.12)' }}>
          <Icon name="local_fire_department" style={{ color: '#f97316' }} />
        </div>
        <div>
          <div className="v" style={{ fontSize: 26 }}>{stats.streakDays}<span className="u">日</span></div>
          <div className="l">連続学習</div>
        </div>
      </div>
    </div>
  );
}
