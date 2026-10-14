'use client';

/**
 * タブレット (iPad) のホーム。左サイドバー (TabletSidebar) の右に出す。
 *
 * スマホのホームを横に伸ばすのではなく、幅を使って**折り返すグリッド**にする:
 *   上段: 今日の学習 (復習 / 今日解いた / 連続) + ショートカット (3〜4 列)
 *   中段: マイ単語帳 (3〜5 列の正方形タイル。横スクロールはしない) / バインダー
 *   下段: 語法問題集 (グリッド) / 参加中のグループ
 * 部品はスマホ版と共用 (HomeTiles / HomeShortcutGrid / 各 Section)。
 * データの契約は DesktopHomeView と同じ (home-client が同じ props を渡す)。
 * タッチ前提: hover でしか出ないものは置かない。
 */

import Link from 'next/link';
import { useMemo } from 'react';
import type { DesktopHomeViewProps } from '@/components/desktop/DesktopHome';
import { JoinedGroupsSection } from '@/components/groups/JoinedGroupsSection';
import { FollowingTodayStrip } from '@/components/home/FollowingTodayStrip';
import { HomeGrammarBooksSection } from '@/components/home/HomeGrammarBooks';
import { HomeShortcutGrid } from '@/components/home/HomeShortcutGrid';
import { BinderSquareTile, ProjectSquareTile } from '@/components/home/HomeTiles';
import { ProUpgradeBanner } from '@/components/home/ProUpgradeBanner';
import { ScanCompletedBanner, ScanFailedBanner, ScanInProgressBanner } from '@/components/home/ScanInProgressBanner';
import { FollowNotificationsButton } from '@/components/notifications/FollowNotificationsButton';
import { GeneratingProjectCard } from '@/components/project/GeneratingProjectCard';
import { SolidEmpty, SolidPanel } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import type { FollowSuggestion } from '@/lib/follows/suggestions';
import type { FollowingTodayActivity } from '@/lib/follows/today-activity';
import { cn } from '@/lib/utils';

export type TabletHomeViewProps = DesktopHomeViewProps & {
  /** 今日クイズを解いたフォロー中の人 + フォローのおすすめ (スマホと同じ帯) */
  followingToday?: { activity: FollowingTodayActivity[]; suggestions: FollowSuggestion[] };
};

function SectionHeading({
  eyebrow,
  title,
  count,
  href,
  className,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  href?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-3 pb-3', className)}>
      <div className="min-w-0">
        <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">{eyebrow}</div>
        <h2 className="flex items-center gap-2 font-display text-[21px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">
          {title}
          {typeof count === 'number' && count > 0 && (
            <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[var(--solid-ink)] px-1.5 font-mono text-[11px] font-extrabold tabular-nums text-[var(--color-on-ink)]">
              {count}
            </span>
          )}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="flex min-h-[44px] items-center gap-[3px] px-1 text-[14px] font-semibold text-[var(--color-accent)]"
        >
          すべて見る
          <Icon name="chevron_right" size={12} />
        </Link>
      )}
    </div>
  );
}

/** 今日の学習の 3 枚: 復習 (目標ページへ) / 今日解いた / 連続日数 */
function TodayStrip({
  goal,
  stats,
}: {
  goal: DesktopHomeViewProps['goal'];
  stats: DesktopHomeViewProps['stats'];
}) {
  const reviewLabel = (() => {
    switch (goal.state) {
      case 'review':
        return { title: `${goal.count}語を復習`, sub: '復習期限が来ています', icon: 'schedule', href: '/quiz/all?review=1' };
      case 'learn':
        return { title: `${goal.count}語を学習`, sub: '新しい語を覚えましょう', icon: 'school', href: '/quiz/all?learn=1' };
      case 'done':
        return { title: '今日の復習は完了', sub: 'お疲れさまでした', icon: 'check_circle', href: '/goal' };
      case 'start':
        return { title: '学習を始める', sub: '最初のクイズへ', icon: 'play_arrow', href: '/goal' };
      default:
        return { title: '目標を立てる', sub: '単語帳と期日を選ぶ', icon: 'flag', href: '/goal' };
    }
  })();

  return (
    <div className="grid grid-cols-3 gap-3 pb-5">
      <Link
        href={reviewLabel.href}
        className="col-span-1 flex min-h-[96px] flex-col justify-between rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] p-4 text-[var(--color-on-accent)] shadow-[3px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)]"
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.06em] opacity-90">
          <Icon name={reviewLabel.icon} size={16} filled />
          TODAY
        </div>
        <div>
          <div className="font-display text-[20px] font-extrabold leading-tight">{reviewLabel.title}</div>
          <div className="mt-0.5 text-[12px] font-semibold opacity-90">{reviewLabel.sub}</div>
        </div>
      </Link>
      <SolidPanel as="div" className="!rounded-[16px]" faceClassName="flex min-h-[92px] flex-col justify-between !p-4">
        <div className="font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">SOLVED</div>
        <div>
          <div className="font-display text-[26px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
            {stats.completedToday}
            <span className="ml-1 text-[12px] font-bold text-[var(--color-muted)]">問</span>
          </div>
          <div className="mt-1 text-[12px] font-semibold text-[var(--color-ink-muted)]">今日解いた問題</div>
        </div>
      </SolidPanel>
      <SolidPanel as="div" className="!rounded-[16px]" faceClassName="flex min-h-[92px] flex-col justify-between !p-4">
        <div className="font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">STREAK</div>
        <div>
          <div className="font-display text-[26px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
            {stats.streakDays}
            <span className="ml-1 text-[12px] font-bold text-[var(--color-muted)]">日</span>
          </div>
          <div className="mt-1 text-[12px] font-semibold text-[var(--color-ink-muted)]">連続学習</div>
        </div>
      </SolidPanel>
    </div>
  );
}

export function TabletHomeView({
  projects,
  stats,
  loading,
  error,
  pendingScans,
  completedScans = [],
  failedScans = [],
  onDismissCompletedScan,
  joinedGroups = [],
  goal,
  grammarBooks = [],
  recommendedBooks = [],
  binderIcons = {},
  onStartScan,
  showUpgrade = false,
  onDismissUpgrade,
  followingToday,
}: TabletHomeViewProps) {
  // バインダー (フォルダ) 一覧を binder 名で集計する
  const binders = useMemo(() => {
    const byBinder = new Map<string, number>();
    for (const project of projects) {
      const name = project.binder?.trim();
      if (!name) continue;
      byBinder.set(name, (byBinder.get(name) ?? 0) + 1);
    }
    return [...byBinder.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .map(([name, count]) => ({ name, count }));
  }, [projects]);

  // バインダーに入っている単語帳はバインダーのタイルから開くので、本棚には出さない
  const shelfProjects = useMemo(() => projects.filter((project) => !project.binder?.trim()), [projects]);
  const showShelfLoading = loading && projects.length === 0 && pendingScans.length === 0;

  return (
    <div className="tb-bleed mx-auto w-full max-w-[1120px] px-[18px] pb-16 pt-[14px] font-[var(--font-body)]">
      {/* ページ見出し。ロゴとナビはサイドバーにあるので、ここはタイトルと通知だけ */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">HOME</div>
          <h1 className="font-display text-[26px] font-black leading-none tracking-[-0.01em] text-[var(--solid-ink)]">ホーム</h1>
        </div>
        <FollowNotificationsButton variant="mobile" />
      </div>

      <ScanInProgressBanner scans={pendingScans} className="mb-3" />
      {onDismissCompletedScan && (
        <>
          <ScanCompletedBanner scans={completedScans} onDismiss={onDismissCompletedScan} className="mb-3" />
          <ScanFailedBanner scans={failedScans} onDismiss={onDismissCompletedScan} onRetryScan={onStartScan} className="mb-3" />
        </>
      )}

      {error && (
        <SolidPanel className="mb-3 !rounded-[12px] border-[var(--color-error)]" faceClassName="!p-3 text-xs font-bold text-[var(--color-error)]">
          {error}
        </SolidPanel>
      )}

      {showUpgrade && (
        <div className="pb-4">
          <ProUpgradeBanner onDismiss={onDismissUpgrade} />
        </div>
      )}

      <TodayStrip goal={goal} stats={stats} />

      {/* ショートカット: スマホは 2 列、タブレットは 3〜4 列 */}
      <HomeShortcutGrid
        projects={projects}
        groups={joinedGroups}
        recommendations={loading ? [] : recommendedBooks}
        className="grid grid-cols-3 gap-2.5 pb-4 tablet-regular:grid-cols-4"
      />

      {followingToday && (
        <div className="-mx-[18px]">
          <FollowingTodayStrip activity={followingToday.activity} suggestions={followingToday.suggestions} />
        </div>
      )}

      {/* マイ単語帳: 折り返すグリッド (縦 3 列 / 横 5 列) */}
      <SectionHeading eyebrow="MY BOOKS" title="マイ単語帳" href="/projects" className="pt-2" />
      {pendingScans.length > 0 && (
        <div className="flex flex-col gap-2.5 pb-3">
          {pendingScans.map((job) => (
            <GeneratingProjectCard key={job.id} title={job.project_title} iconDataUrl={job.iconDataUrl} />
          ))}
        </div>
      )}
      {showShelfLoading ? (
        <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="ml-2 text-sm">読み込み中...</span>
        </div>
      ) : shelfProjects.length === 0 && binders.length === 0 ? (
        <SolidEmpty
          icon="menu_book"
          title="単語帳はまだありません"
          description="スキャンまたは手入力で最初の単語帳を作成しましょう。"
          action={
            <button type="button" onClick={onStartScan} className="solid-link-primary">
              <Icon name="add" size={16} />
              単語帳を作成
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-3 pb-5 tablet-regular:grid-cols-5">
          {shelfProjects.map((project) => (
            <ProjectSquareTile key={project.id} project={project} />
          ))}
          <button
            type="button"
            onClick={onStartScan}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            aria-label="新しい単語帳を作成"
          >
            <Icon name="add" size={28} />
            <span className="font-display text-[13px] font-bold">新しい単語帳</span>
            <span className="font-mono text-[9.5px] text-[var(--color-muted)]">スキャン / 手入力 / 音声</span>
          </button>
        </div>
      )}

      {binders.length > 0 && (
        <>
          <SectionHeading eyebrow="BINDERS" title="バインダー" count={binders.length} />
          <div className="grid grid-cols-3 gap-3 pb-5 tablet-regular:grid-cols-5">
            {binders.map((binder) => (
              <BinderSquareTile key={binder.name} name={binder.name} count={binder.count} iconImage={binderIcons[binder.name] ?? null} />
            ))}
          </div>
        </>
      )}

      {/* 以下はスマホと同じセクション部品。内側の 18px 余白を本文の端に合わせる */}
      <div className="-mx-[18px]">
        <HomeGrammarBooksSection books={grammarBooks} layout="grid" />
        <JoinedGroupsSection groups={joinedGroups} />
      </div>
    </div>
  );
}
