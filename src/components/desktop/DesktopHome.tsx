'use client';

/**
 * デスクトップホーム（Spotify デスクトップ風の構成）。
 * 上部: ショートカットグリッド（TODAY'S GOAL + 保存済み + 単語帳/グループ/おすすめ）
 * 下部: 横スクロールのシェルフ（マイ単語帳 / おすすめの単語帳 / おすすめのリール）
 * 右サイドの学習サイドバー・アップグレードカードはモバイルと違い維持する。
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopButton,
  DesktopSearchBox,
  DesktopTopbar,
} from '@/components/desktop/DesktopChrome';
import { DesktopMediaCard, DesktopShelf } from '@/components/desktop/DesktopMediaShelf';
import { DesktopStudySidebar } from '@/components/desktop/DesktopStudySidebar';
import { JoinedGroupGrid } from '@/components/groups/JoinedGroupsSection';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import { buildHomeShortcutTiles, homeShortcutContentSlots } from '@/lib/home/shortcut-tiles';
import {
  prefetchGroupOverview,
  seedGroupSummary,
} from '@/lib/shared-projects/group-overview-cache';
import { prefetchReelFeed } from '@/hooks/use-reel-feed';
import { seedPinnedReelPreview } from '@/lib/reels/pinned-preview';
import type { HomeRecommendedBook, HomeReelPreviewItem } from '@/lib/home/recommendations-types';
import type { Project } from '@/types';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';

type DesktopHomeProject = Project & {
  totalWords: number;
  masteredWords: number;
  reviewWords: number;
  newWords: number;
  lastUsedAt?: string | null;
};

type DesktopHomeStats = {
  dueCount: number;
  completedToday: number;
  streakDays: number;
  totalWords: number;
  mastered: number;
  activeW: number;
  review: number;
  newW: number;
  favoriteCount: number;
  hasReviewSchedule: boolean;
};

type DesktopHomeGoal = {
  state: 'review' | 'learn' | 'empty' | 'start' | 'done';
  count: number;
};

type DesktopPendingScan = {
  id: string;
  project_title: string;
  iconDataUrl?: string;
};

export function DesktopHomeView({
  projects,
  stats,
  loading,
  error,
  pendingScans,
  joinedGroups = [],
  goal,
  recommendedBooks = [],
  recommendedReels = [],
  recommendationsLoading = false,
  onStartScan,
  showUpgrade = false,
  onDismissUpgrade,
}: {
  projects: DesktopHomeProject[];
  stats: DesktopHomeStats;
  loading: boolean;
  error: string | null;
  pendingScans: DesktopPendingScan[];
  joinedGroups?: StudyGroupSummary[];
  goal: DesktopHomeGoal;
  recommendedBooks?: HomeRecommendedBook[];
  recommendedReels?: HomeReelPreviewItem[];
  recommendationsLoading?: boolean;
  onStartScan: () => void;
  showUpgrade?: boolean;
  onDismissUpgrade?: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filteredProjects = useMemo(
    () => (q ? projects.filter((project) => project.title.toLowerCase().includes(q)) : projects),
    [projects, q],
  );
  // 上部ショートカットグリッドに載った単語帳は下のシェルフから除外し、
  // 溢れた分だけを表示する（検索中は全件から検索）。
  const gridProjectCount = Math.min(
    projects.length,
    homeShortcutContentSlots(stats.favoriteCount > 0),
  );
  const shelfProjects = q ? filteredProjects : projects.slice(gridProjectCount);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="ホーム" crumb="HOME / ライブラリ">
        <DesktopSearchBox
          placeholder="単語・単語帳を検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <DesktopButton variant="accent" icon="add" onClick={onStartScan}>
          新規作成
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          {error && (
            <div className="ds-card" style={{ padding: 14, marginBottom: 18, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* Spotify風ショートカットグリッド */}
          <DesktopShortcutGrid
            goal={goal}
            favoriteCount={stats.favoriteCount}
            projects={projects}
            groups={joinedGroups}
            recommendations={loading ? [] : recommendedBooks}
            onStartScan={onStartScan}
          />

          {/* マイ単語帳（横スクロールのメディアカード） */}
          <DesktopShelf
            title="マイ単語帳"
            count={projects.length + pendingScans.length}
            seeAllHref="/projects"
          >
            {pendingScans.map((scan) => (
              <DesktopGeneratingMediaCard key={scan.id} scan={scan} />
            ))}
            {loading && shelfProjects.length === 0 && pendingScans.length === 0
              ? [0, 1, 2, 3].map((slot) => <DesktopMediaCardSkeleton key={slot} />)
              : shelfProjects.map((project) => (
                  <DesktopHomeBookCard key={project.id} project={project} />
                ))}
            {!q && !loading && <DesktopNewBookCard onClick={onStartScan} />}
          </DesktopShelf>

          {/* 参加中のグループ */}
          <div style={{ marginTop: 28 }}>
            <JoinedGroupGrid groups={joinedGroups} columns={3} />
          </div>

          {/* おすすめの単語帳（英検級ベースの共有単語帳） */}
          {recommendedBooks.length > 0 && (
            <DesktopShelf title="おすすめの単語帳" seeAllHref="/shared">
              {recommendedBooks.map((book) => (
                <DesktopRecommendedBookCard key={book.shareId} book={book} />
              ))}
            </DesktopShelf>
          )}

          {/* おすすめのリール（語源がある単語限定） */}
          {(recommendationsLoading || recommendedReels.length > 0) && (
            <DesktopShelf title="おすすめのリール" seeAllHref="/reels">
              {recommendationsLoading && recommendedReels.length === 0
                ? [0, 1, 2].map((slot) => <DesktopMediaCardSkeleton key={slot} />)
                : recommendedReels.map((item) => (
                    <DesktopReelPreviewCard key={item.id} item={item} />
                  ))}
            </DesktopShelf>
          )}
        </div>

        {/* 右サイド（モバイルと違い維持） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 0 }}>
          {showUpgrade && <DesktopUpgradeCard onDismiss={onDismissUpgrade} />}
          <DesktopStudySidebar
            stats={stats}
            reviewHref={stats.totalWords > 0 ? '/quiz/all?review=1&from=/' : '/projects'}
            learnHref={stats.totalWords > 0 ? '/quiz/all?learn=1&from=/' : '/projects'}
          />
        </div>
      </div>
    </div>
  );
}

/* ============ ショートカットグリッド（Spotify のクイックアクセス風） ============ */

function DesktopShortcutGrid({
  goal,
  favoriteCount,
  projects,
  groups,
  recommendations,
  onStartScan,
}: {
  goal: DesktopHomeGoal;
  favoriteCount: number;
  projects: DesktopHomeProject[];
  groups: StudyGroupSummary[];
  recommendations: HomeRecommendedBook[];
  onStartScan: () => void;
}) {
  const showSavedTile = favoriteCount > 0;
  const tiles = buildHomeShortcutTiles({
    projects,
    groups,
    recommendations,
    slots: homeShortcutContentSlots(showSavedTile),
  });

  return (
    <div className="ds-shortcut-grid">
      <DesktopGoalTile goal={goal} onStartScan={onStartScan} />
      {showSavedTile && (
        <ShortcutTile
          href="/favorites"
          artStyle={{ background: 'var(--color-accent)' }}
          artChildren={<Icon name="bookmark" size={20} filled />}
          title="保存済み単語"
          sub={`${favoriteCount}語`}
        />
      )}
      {tiles.map((tile) => {
        if (tile.kind === 'project') {
          const project = tile.project;
          return (
            <ShortcutTile
              key={`p:${project.id}`}
              href={`/project/${project.id}`}
              artStyle={{
                background: desktopThumbColor(project.id),
                backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
              }}
              artChildren={!project.iconImage && project.title.charAt(0)}
              title={project.title}
              sub={`${project.totalWords}語`}
            />
          );
        }
        if (tile.kind === 'group') {
          const group = tile.group;
          return (
            <ShortcutTile
              key={`g:${group.id}`}
              href={`/groups/${group.id}`}
              onPress={() => {
                // タップ時点で概要をシード+先読みして、グループページの
                // ヘッダーを即描画できるようにする（遷移の体感短縮）。
                seedGroupSummary(group);
                prefetchGroupOverview(group.id);
              }}
              artStyle={{ background: desktopThumbColor(group.id) }}
              artChildren={group.name.charAt(0)}
              title={group.name}
              sub={`グループ · ${group.memberCount}人`}
            />
          );
        }
        const book = tile.book;
        return (
          <ShortcutTile
            key={`b:${book.shareId}`}
            href={`/share/${book.shareId}`}
            artStyle={{
              background: desktopThumbColor(book.shareId),
              backgroundImage: book.iconImage ? `url(${book.iconImage})` : undefined,
            }}
            artChildren={!book.iconImage && book.title.charAt(0)}
            title={book.title}
            sub={book.eikenLevelTag ? `おすすめ · ${book.eikenLevelTag}` : 'おすすめ'}
            subAccent
          />
        );
      })}
    </div>
  );
}

function DesktopGoalTile({ goal, onStartScan }: { goal: DesktopHomeGoal; onStartScan: () => void }) {
  if (goal.state === 'empty') {
    return (
      <ShortcutTile
        onClick={onStartScan}
        artStyle={{ background: 'var(--color-accent)' }}
        artChildren={<Icon name="photo_camera" size={20} filled />}
        title="最初のスキャン"
        sub="クリックして開始"
        subAccent
      />
    );
  }
  if (goal.state === 'done') {
    return (
      <ShortcutTile
        artStyle={{ background: 'var(--color-success)' }}
        artChildren={<Icon name="check_circle" size={20} filled />}
        title="復習完了"
        sub="今日はおつかれさま"
      />
    );
  }
  if (goal.state === 'review') {
    return (
      <ShortcutTile
        href="/quiz/all?review=1&from=/"
        artStyle={{ background: 'var(--color-accent)' }}
        artChildren={<Icon name="replay" size={20} filled />}
        title="今日の復習"
        sub={`${goal.count}語 →`}
        subAccent
      />
    );
  }
  // 'learn' | 'start'
  return (
    <ShortcutTile
      href="/quiz/all?learn=1&from=/"
      artStyle={{ background: 'var(--color-accent)' }}
      artChildren={<Icon name="school" size={20} filled />}
      title={goal.state === 'start' ? '学習を始める' : '今日の学習'}
      sub={`${goal.count}語 →`}
      subAccent
    />
  );
}

function ShortcutTile({
  href,
  onClick,
  onPress,
  artStyle,
  artChildren,
  title,
  sub,
  subAccent = false,
}: {
  href?: string;
  onClick?: () => void;
  /** クリック時に発火（先読みなど） */
  onPress?: () => void;
  artStyle?: React.CSSProperties;
  artChildren?: React.ReactNode;
  title: string;
  sub?: string;
  subAccent?: boolean;
}) {
  const inner = (
    <>
      <div className="art" style={artStyle}>{artChildren}</div>
      <div className="body">
        <div className="t">{title}</div>
        {sub && <div className={subAccent ? 's accent' : 's'}>{sub}</div>}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="ds-shortcut" onClick={onPress}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="ds-shortcut" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="ds-shortcut" style={{ cursor: 'default' }}>{inner}</div>;
}

/* ============ シェルフのカード ============ */

function DesktopHomeBookCard({ project }: { project: DesktopHomeProject }) {
  const pct = project.totalWords > 0 ? Math.round((project.masteredWords / project.totalWords) * 100) : 0;
  return (
    <DesktopMediaCard
      href={`/project/${project.id}`}
      artStyle={{
        background: desktopThumbColor(project.id),
        backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
      }}
      artChildren={!project.iconImage && project.title.charAt(0)}
      title={project.title}
      subtitle={`${project.totalWords}語 · 習得 ${pct}%`}
      playHref={project.totalWords > 0 ? `/quiz/${project.id}?from=/` : undefined}
      playLabel={`${project.title}のクイズを開始`}
    />
  );
}

function DesktopGeneratingMediaCard({ scan }: { scan: DesktopPendingScan }) {
  return (
    <div
      className="ds-media-card"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${scan.project_title} を生成中`}
      style={{ cursor: 'default' }}
    >
      <div
        className="art"
        style={{
          background: scan.iconDataUrl
            ? `linear-gradient(rgba(26,26,26,0.42), rgba(26,26,26,0.42)), center / cover url(${scan.iconDataUrl})`
            : 'linear-gradient(135deg, #137FEC 0%, #3DA1B8 52%, #228B22 100%)',
        }}
      >
        <div
          className="scanvocab-generating-spin"
          style={{
            width: 34,
            height: 34,
            border: '3px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            borderRadius: 999,
          }}
          aria-hidden="true"
        />
      </div>
      <div className="meta">
        <div className="t">{scan.project_title}</div>
        <div className="s">単語を抽出中...</div>
      </div>
    </div>
  );
}

function DesktopNewBookCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ds-media-card">
      <div
        className="art"
        style={{
          background: '#fff',
          border: '1.5px dashed var(--solid-ink)',
          boxShadow: 'none',
          color: 'var(--color-ink)',
        }}
      >
        <Icon name="add" style={{ fontSize: 34 }} />
      </div>
      <div className="meta">
        <div className="t">新しい単語帳</div>
        <div className="s">写真を撮るだけ</div>
      </div>
    </button>
  );
}

function DesktopMediaCardSkeleton() {
  return (
    <div className="ds-media-card" style={{ cursor: 'default' }} aria-hidden="true">
      <div className="art ds-shimmer" style={{ boxShadow: 'none', borderColor: 'var(--color-border)' }} />
      <div className="meta">
        <div className="ds-shimmer" style={{ height: 13, borderRadius: 6, width: '80%' }} />
        <div className="ds-shimmer" style={{ height: 10, borderRadius: 6, width: '55%', marginTop: 6 }} />
      </div>
    </div>
  );
}

function DesktopRecommendedBookCard({ book }: { book: HomeRecommendedBook }) {
  return (
    <DesktopMediaCard
      href={`/share/${book.shareId}`}
      artStyle={{
        background: desktopThumbColor(book.shareId),
        backgroundImage: book.iconImage ? `url(${book.iconImage})` : undefined,
      }}
      artChildren={!book.iconImage && book.title.charAt(0)}
      title={book.title}
      subtitle={
        <>
          <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>おすすめ</span>
          {book.eikenLevelTag && <span>· {book.eikenLevelTag}</span>}
        </>
      }
    />
  );
}

const REEL_MAX_FORMULA_PARTS = 3;

function DesktopReelPreviewCard({ item }: { item: HomeReelPreviewItem }) {
  const parts = item.morphology.formula.slice(0, REEL_MAX_FORMULA_PARTS);
  return (
    <DesktopMediaCard
      href={`/reels?pin=${encodeURIComponent(item.id)}`}
      // クリック時点でフィード取得を先行開始（この単語を先頭に固定）し、
      // /reels 側で即時表示できるよう表示データもシードする。
      onClick={() => {
        prefetchReelFeed(item.id);
        seedPinnedReelPreview(item);
      }}
      artStyle={{ background: `linear-gradient(165deg, ${desktopThumbColor(item.id)} 0%, #1a1a1a 170%)` }}
      artChildren={
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            textAlign: 'left',
          }}
        >
          <span
            className="mono"
            style={{
              alignSelf: 'flex-start',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.2)',
              padding: '2px 8px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            語源
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, wordBreak: 'break-word' }}>
              {item.english}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8 }}>
              {parts.map((part, index) => (
                <span key={`${part.text}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {index > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>+</span>}
                  <span
                    className="mono"
                    style={{ borderRadius: 6, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}
                  >
                    {part.text}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      }
      title={item.japanese}
      subtitle={item.bookTitle}
    />
  );
}

/* ============ 右サイド ============ */

function DesktopUpgradeCard({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      {onDismiss && (
        <button
          type="button"
          aria-label="アップグレード案内を閉じる"
          onClick={onDismiss}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 999,
            border: '1.5px solid var(--solid-ink)',
            background: '#fff',
            color: 'var(--solid-ink)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    <Link
      href="/subscription"
      className="ds-card"
      style={{
        display: 'block',
        padding: 16,
        textDecoration: 'none',
        color: 'inherit',
        background: 'linear-gradient(135deg, oklch(0.96 0.04 130), #fff)',
      }}
    >
      <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-accent)' }}>
        UPGRADE
      </div>
      <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--solid-ink)' }}>
        Pro でぜんぶ使う
      </div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6, color: 'var(--color-muted)' }}>
        写真スキャンで単語帳を自動作成。単語帳の作成数も無制限に。
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderRadius: 10,
          border: '2px solid var(--solid-ink)',
          background: 'var(--solid-ink)',
          color: '#fff',
          padding: '10px 0',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 13,
          boxShadow: '2px 2px 0 var(--color-accent)',
        }}
      >
        <Icon name="auto_awesome" size={16} filled />
        Proプランを見る
      </div>
    </Link>
    </div>
  );
}
