'use client';

/**
 * ホーム上部の Spotify 風ショートカットグリッド（2カラムのコンパクトタイル）。
 * 先頭は TODAY'S GOAL（今日の復習/学習）タイル。残りの枠は
 * 自分の単語帳 → 参加中のグループ → 英検級ベースのおすすめ共有単語帳 の
 * 優先順で埋める（buildHomeShortcutTiles）。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';
import {
  prefetchGroupOverview,
  seedGroupSummary,
} from '@/lib/shared-projects/group-overview-cache';
import { buildHomeShortcutTiles, homeShortcutContentSlots } from '@/lib/home/shortcut-tiles';
import type { HomeRecommendedBook } from '@/lib/home/recommendations-types';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

export type HomeShortcutGoal = {
  state: 'review' | 'learn' | 'empty' | 'start' | 'done';
  count: number;
};

export type HomeShortcutProject = {
  id: string;
  title: string;
  iconImage?: string;
  totalWords: number;
};

export function HomeShortcutGrid({
  goal,
  savedWordsCount,
  projects,
  groups,
  recommendations,
  onStartScan,
}: {
  goal: HomeShortcutGoal;
  /** 保存済み単語（お気に入り）の数。0 のときはタイルを出さない */
  savedWordsCount: number;
  projects: HomeShortcutProject[];
  groups: StudyGroupSummary[];
  recommendations: HomeRecommendedBook[];
  onStartScan: () => void;
}) {
  const showSavedTile = savedWordsCount > 0;
  const tiles = buildHomeShortcutTiles({
    projects,
    groups,
    recommendations,
    slots: homeShortcutContentSlots(showSavedTile),
  });

  return (
    <div className="grid grid-cols-2 gap-2 px-[18px] pb-3.5">
      <GoalTile goal={goal} onStartScan={onStartScan} />
      {showSavedTile && (
        <TileShell
          href="/favorites"
          iconArea={<GoalIconSquare icon="bookmark" />}
          title="保存済み単語"
          sub={<TileSub>{savedWordsCount}語</TileSub>}
        />
      )}
      {tiles.map((tile) => {
        if (tile.kind === 'project') {
          const project = tile.project;
          return (
            <TileShell
              key={`p:${project.id}`}
              href={`/project/${project.id}`}
              iconArea={
                <IconSquare
                  background={project.iconImage ? `center / cover url(${project.iconImage})` : thumbColor(project.id)}
                >
                  {!project.iconImage && project.title.charAt(0)}
                </IconSquare>
              }
              title={project.title}
              sub={<TileSub>{project.totalWords}語</TileSub>}
            />
          );
        }
        if (tile.kind === 'group') {
          const group = tile.group;
          return (
            <TileShell
              key={`g:${group.id}`}
              href={`/groups/${group.id}`}
              onPress={() => {
                // タップ時点で概要をシード+先読みして、グループページの
                // ヘッダーを即描画できるようにする（遷移の体感短縮）。
                seedGroupSummary(group);
                prefetchGroupOverview(group.id);
              }}
              iconArea={
                <IconSquare background={thumbColor(group.id)}>{group.name.charAt(0)}</IconSquare>
              }
              title={group.name}
              sub={<TileSub>グループ · {group.memberCount}人</TileSub>}
            />
          );
        }
        const book = tile.book;
        return (
          <TileShell
            key={`b:${book.shareId}`}
            href={`/share/${book.shareId}`}
            iconArea={
              <IconSquare
                background={book.iconImage ? `center / cover url(${book.iconImage})` : thumbColor(book.shareId)}
              >
                {!book.iconImage && book.title.charAt(0)}
              </IconSquare>
            }
            title={book.title}
            sub={
              <div className="mt-px flex items-center gap-1 text-[9px] font-extrabold leading-none">
                <span className="text-[var(--color-accent)]">おすすめ</span>
                {book.eikenLevelTag && (
                  <span className="text-[var(--color-muted)]">· {book.eikenLevelTag}</span>
                )}
              </div>
            }
          />
        );
      })}
    </div>
  );
}

function GoalTile({ goal, onStartScan }: { goal: HomeShortcutGoal; onStartScan: () => void }) {
  if (goal.state === 'empty') {
    return (
      <TileShell
        onClick={onStartScan}
        iconArea={<GoalIconSquare icon="photo_camera" />}
        title="最初のスキャン"
        sub={<TileSub accent>タップして開始</TileSub>}
      />
    );
  }
  if (goal.state === 'done') {
    return (
      <TileShell
        iconArea={<GoalIconSquare icon="check_circle" background="var(--color-success)" />}
        title="復習完了"
        sub={<TileSub>今日はおつかれさま</TileSub>}
      />
    );
  }
  if (goal.state === 'review') {
    return (
      <TileShell
        href="/quiz/all?review=1&from=/"
        iconArea={<GoalIconSquare icon="replay" />}
        title="今日の復習"
        sub={<TileSub accent>{goal.count}語 →</TileSub>}
      />
    );
  }
  // 'learn' | 'start'
  return (
    <TileShell
      href="/quiz/all?learn=1&from=/"
      iconArea={<GoalIconSquare icon="school" />}
      title={goal.state === 'start' ? '学習を始める' : '今日の学習'}
      sub={<TileSub accent>{goal.count}語 →</TileSub>}
    />
  );
}

function GoalIconSquare({ icon, background = 'var(--color-accent)' }: { icon: string; background?: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center text-white"
      style={{ background }}
    >
      <Icon name={icon} size={20} filled />
    </div>
  );
}

function IconSquare({ background, children }: { background: string; children?: React.ReactNode }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center font-display text-[17px] font-extrabold text-white"
      style={{ background }}
    >
      {children}
    </div>
  );
}

function TileSub({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`mt-px text-[9px] font-extrabold leading-none ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
    >
      {children}
    </div>
  );
}

function TileShell({
  href,
  onClick,
  onPress,
  iconArea,
  title,
  sub,
}: {
  href?: string;
  onClick?: () => void;
  /** pointerdown で発火（先読みなど。onClick より早い） */
  onPress?: () => void;
  iconArea: React.ReactNode;
  title: string;
  sub?: React.ReactNode;
}) {
  const className =
    'flex h-[54px] items-center overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-left transition-all duration-100 active:translate-x-px active:translate-y-px';
  const handlePress = () => {
    triggerHaptic();
    onPress?.();
  };
  const inner = (
    <>
      <div className="h-full w-[50px] shrink-0 border-r-2 border-[var(--solid-ink)]">{iconArea}</div>
      <div className="min-w-0 flex-1 px-2">
        <div className="line-clamp-2 text-[11px] font-bold leading-[1.25] text-[var(--solid-ink)]">
          {title}
        </div>
        {sub}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} onPointerDown={handlePress} onClick={onPress}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} onPointerDown={handlePress} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
