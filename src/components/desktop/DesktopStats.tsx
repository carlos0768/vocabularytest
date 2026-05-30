'use client';

import { Icon } from '@/components/ui/Icon';
import { DesktopDonut, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { DesktopStudySidebar } from '@/components/desktop/DesktopStudySidebar';
import { EMPTY_DESKTOP_STUDY_SUMMARY, type DesktopStudySummaryStats } from '@/lib/desktop-study-summary';
import type { CachedStats } from '@/lib/stats-cache';

export function DesktopStatsView({
  stats,
  loading,
}: {
  stats: CachedStats | null;
  loading: boolean;
}) {
  const recentWeek = stats?.weeklyStats.slice(-7) ?? [];
  const chartData = recentWeek.map((item, index) => ({
    label: new Date(`${item.date}T00:00:00`).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }),
    count: item.masteredCount || item.totalCount,
    isToday: index === recentWeek.length - 1,
  }));
  const weekTotal = chartData.reduce((sum, item) => sum + item.count, 0);
  const totalWords = stats?.totalWords ?? 0;
  const mastered = stats?.masteredWords ?? 0;
  const review = stats?.reviewWords ?? 0;
  const newWords = stats?.newWords ?? 0;
  const accuracy = stats?.quizStats.todayCount
    ? Math.round((stats.quizStats.correctCount / stats.quizStats.todayCount) * 100)
    : 0;
  const masteryPercent = totalWords > 0 ? Math.round((mastered / totalWords) * 100) : 0;
  const summaryStats: DesktopStudySummaryStats = stats
    ? {
        dueCount: stats.reviewWords,
        completedToday: stats.quizStats.todayCount,
        streakDays: stats.quizStats.streakDays,
        totalWords,
        mastered,
        review,
        newW: newWords,
      }
    : EMPTY_DESKTOP_STUDY_SUMMARY;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="学習の推移" crumb="進歩 / トレンド" />
      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        <div>
          {loading ? (
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
            <div className="ds-card" style={{ padding: '26px 32px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="local_fire_department" style={{ color: '#f97316', fontSize: 30 }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48, lineHeight: 1 }}>
                      {stats.quizStats.streakDays}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>日連続</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>今週は {weekTotal} 語を新しく習得しました</div>
                </div>
              </div>
              <div style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--color-border)' }} />
              <div style={{ display: 'flex', gap: 38, flex: 1 }}>
                <HeroMetric value={chartData.at(-1)?.count ?? 0} suffix="語" label="今日の習得" />
                <HeroMetric value={stats.quizStats.todayCount} suffix="問" label="今日の解答" />
                <HeroMetric value={accuracy} suffix="%" label="正答率" accent />
              </div>
            </div>

            <div className="ds-card" style={{ padding: '26px 30px', marginBottom: 18 }}>
              <div className="ds-sec-head" style={{ marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: 18 }}>暗記した単語数の推移</h2>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>毎日習得した単語数の記録</div>
                </div>
                <span className="ds-chip active">直近7日間</span>
              </div>
              <DesktopBarChart data={chartData} height={300} showAxis />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div className="ds-card ds-kpi" style={{ borderColor: 'var(--color-accent-ink)' }}>
                <div className="l" style={{ marginBottom: 2 }}>習得済み</div>
                <div className="v" style={{ color: 'var(--color-accent-ink)' }}>{mastered}</div>
                <div className="ds-prog" style={{ marginTop: 4 }}><div className="fi" style={{ width: `${masteryPercent}%` }} /></div>
              </div>
              <div className="ds-card ds-kpi"><div className="l" style={{ marginBottom: 2 }}>復習中</div><div className="v" style={{ color: '#92400e' }}>{review}</div><div className="mono muted" style={{ fontSize: 11 }}>要レビュー</div></div>
              <div className="ds-card ds-kpi"><div className="l" style={{ marginBottom: 2 }}>未学習</div><div className="v muted">{newWords}</div><div className="mono muted" style={{ fontSize: 11 }}>これから</div></div>
              <div className="ds-card ds-kpi"><div className="l" style={{ marginBottom: 2 }}>間違えた問題</div><div className="v" style={{ color: 'var(--color-error)' }}>{stats.wrongAnswersCount}</div><div className="mono muted" style={{ fontSize: 11 }}>復習推奨</div></div>
            </div>

            <div className="ds-card" style={{ marginTop: 18, padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 26 }}>
              <DesktopDonut mastered={mastered} review={review} total={totalWords} size={110} stroke={15} percent={masteryPercent} />
              <div style={{ flex: 1 }}>
                <div className="ds-dist" style={{ marginBottom: 18 }}>
                  <span className="c-mastered" style={{ flex: mastered || 0.0001 }} />
                  <span className="c-review" style={{ flex: review || 0.0001 }} />
                  <span className="c-new" style={{ flex: newWords || 0.0001 }} />
                </div>
                <div className="ds-legend">
                  <div className="row"><span className="ds-sdot c-mastered" /><span className="lb">習得</span><span className="ct tnum">{mastered}</span></div>
                  <div className="row"><span className="ds-sdot c-review" /><span className="lb">学習中</span><span className="ct tnum">{review}</span></div>
                  <div className="row"><span className="ds-sdot c-new" /><span className="lb">未学習</span><span className="ct tnum">{newWords}</span></div>
                </div>
              </div>
            </div>
            </>
          )}
        </div>

        <DesktopStudySidebar stats={summaryStats} reviewHref={summaryStats.totalWords > 0 ? '/quiz/all?review=1&from=/stats' : '/projects'} />
      </div>
    </div>
  );
}

function HeroMetric({ value, suffix, label, accent }: { value: number; suffix: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: accent ? 'var(--color-accent)' : undefined }}>
        {value}
        <span style={{ fontSize: 13, color: accent ? 'var(--color-accent)' : 'var(--color-secondary-text)' }}>{suffix}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function DesktopBarChart({
  data,
  height,
  showAxis,
}: {
  data: { label: string; count: number; isToday?: boolean }[];
  height: number;
  showAxis?: boolean;
}) {
  const maxVal = Math.max(...data.map((item) => item.count), 1);
  const yLabels = [maxVal, Math.round(maxVal / 2), 0];
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {showAxis && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height, paddingBottom: 26, width: 26 }}>
          {yLabels.map((value, index) => <span key={index} className="mono muted" style={{ fontSize: 10, textAlign: 'right' }}>{value}</span>)}
        </div>
      )}
      <div className="ds-bars" style={{ height, flex: 1 }}>
        {data.map((item, index) => (
          <div key={`${item.label}-${index}`} className={'ds-col col' + (item.isToday ? ' today' : '')}>
            <div className="bar" style={{ height: `${(item.count / maxVal) * (height - 30)}px` }} title={`${item.label}: ${item.count}語`}>
              {item.count > 0 && <span className="val">{item.count}</span>}
            </div>
            <span className="x">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
