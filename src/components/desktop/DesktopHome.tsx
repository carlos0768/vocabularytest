'use client';

/**
 * デスクトップホーム。
 * 上部: Spotify 風ショートカットグリッド（TODAY'S GOAL + 保存済み + 単語帳/グループ/おすすめ）
 * 下部: マイ単語帳は従来の本棚タイル（グリッド/リスト切替）。上部グリッドに
 *       載った単語帳は除外して表示する。おすすめの単語帳/リールはシェルフのまま。
 * 右サイドの学習サイドバー・アップグレードカードはモバイルと違い維持する。
 */

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { DesktopWordSearchOverlay } from '@/components/desktop/DesktopWordSearchOverlay';
import { useAuth } from '@/hooks/use-auth';
import { DesktopMediaCard, DesktopShelf } from '@/components/desktop/DesktopMediaShelf';
import { DesktopStudySidebar } from '@/components/desktop/DesktopStudySidebar';
import { JoinedGroupGrid } from '@/components/groups/JoinedGroupsSection';
import { DesktopHomeGrammarBooks } from '@/components/home/HomeGrammarBooks';
import type { GrammarBook } from '@/components/desktop/DesktopGrammar';
import {
  desktopSourceLabel,
  desktopThumbColor,
  desktopUpdatedLabel,
} from '@/components/desktop/desktop-data';
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
  grammarBooks = [],
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
  grammarBooks?: GrammarBook[];
  recommendedBooks?: HomeRecommendedBook[];
  recommendedReels?: HomeReelPreviewItem[];
  recommendationsLoading?: boolean;
  onStartScan: () => void;
  showUpgrade?: boolean;
  onDismissUpgrade?: () => void;
}) {
  const { user } = useAuth();
  // 単語検索（旧サイドバー下部のボタンから移設）。開くたびに初期化する。
  const [wordSearchOpen, setWordSearchOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // 上部ショートカットグリッドに載った単語帳は下の一覧から除外し、
  // 溢れた分だけを表示する。
  const gridProjectCount = Math.min(
    projects.length,
    homeShortcutContentSlots(stats.favoriteCount > 0),
  );
  const shelfProjects = projects.slice(gridProjectCount);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="ホーム" crumb="HOME / ライブラリ">
        {/* 自分の単語帳内の単語検索（サイドバー下部から移設） */}
        {user && (
          <DesktopButton
            icon="manage_search"
            onClick={() => setWordSearchOpen(true)}
            title="自分の単語帳から単語を検索"
          >
            {''}
          </DesktopButton>
        )}
        <DesktopButton variant="accent" icon="add" onClick={onStartScan}>
          新規作成
        </DesktopButton>
      </DesktopTopbar>
      {wordSearchOpen && user && (
        <DesktopWordSearchOverlay onClose={() => setWordSearchOpen(false)} userId={user.id} />
      )}

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

          {/* マイ単語帳（従来の本棚タイル。上部グリッドに載った単語帳は除外） */}
          <div style={{ marginTop: 28 }}>
            <div className="ds-sec-head" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h2>マイ単語帳</h2>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {projects.length + pendingScans.length} 冊 · {stats.totalWords} 語
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className="ds-btn ghost sm"
                  onClick={() => setView('grid')}
                  style={view === 'grid' ? { background: 'rgba(26,26,26,0.06)' } : undefined}
                  aria-label="グリッド表示"
                >
                  <Icon name="grid_view" />
                </button>
                <button
                  type="button"
                  className="ds-btn ghost sm"
                  onClick={() => setView('list')}
                  style={view === 'list' ? { background: 'rgba(26,26,26,0.06)' } : undefined}
                  aria-label="リスト表示"
                >
                  <Icon name="view_list" />
                </button>
                <Link
                  href="/projects"
                  className="ds-btn ghost sm"
                  style={{ textDecoration: 'none', fontSize: 13 }}
                >
                  すべて表示
                  <Icon name="chevron_right" style={{ fontSize: 16 }} />
                </Link>
              </div>
            </div>

            {loading && shelfProjects.length === 0 && pendingScans.length === 0 ? (
              <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
                <Icon name="progress_activity" className="animate-spin" />
                <span style={{ marginLeft: 8 }}>読み込み中...</span>
              </div>
            ) : projects.length === 0 && pendingScans.length === 0 ? (
              <button
                type="button"
                onClick={onStartScan}
                className="ds-book"
                style={{
                  width: 220,
                  background: '#fff',
                  color: 'var(--color-muted)',
                  border: '1.5px dashed var(--solid-ink)',
                  boxShadow: 'none',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Icon name="add" style={{ fontSize: 30, color: 'var(--color-ink)' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--color-ink)' }}>
                  新しい単語帳
                </div>
                <div className="mono" style={{ fontSize: 10, textAlign: 'center' }}>
                  写真を撮るだけ
                </div>
              </button>
            ) : view === 'grid' ? (
              /* 横スクロールの棚に従来の本棚タイルを並べる (1行10冊の高密度表示) */
              <div className="ds-shelf-row cols-10">
                {pendingScans.map((scan) => (
                  <DesktopGeneratingBookTile key={scan.id} scan={scan} />
                ))}
                {shelfProjects.map((project) => (
                  <DesktopBookTile key={project.id} project={project} />
                ))}
                <button
                  type="button"
                  onClick={onStartScan}
                  className="ds-book"
                  style={{
                    background: '#fff',
                    color: 'var(--color-muted)',
                    border: '1.5px dashed var(--solid-ink)',
                    boxShadow: 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name="add" style={{ fontSize: 30, color: 'var(--color-ink)' }} />
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--color-ink)' }}>
                    新しい単語帳
                  </div>
                  <div className="mono" style={{ fontSize: 10, textAlign: 'center' }}>
                    写真を撮るだけ
                  </div>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingScans.map((scan) => (
                  <DesktopGeneratingProjectRow key={scan.id} scan={scan} />
                ))}
                {shelfProjects.map((project) => (
                  <DesktopProjectRow key={project.id} project={project} />
                ))}
              </div>
            )}
          </div>

          {/* 語法問題集（グループ表示の上） */}
          <DesktopHomeGrammarBooks books={grammarBooks} />

          {/* 参加中のグループ */}
          <div style={{ marginTop: 28 }}>
            <JoinedGroupGrid groups={joinedGroups} columns={3} />
          </div>

          {/* おすすめの単語帳（マイ単語帳と同じ本棚タイルで表示） */}
          {recommendedBooks.length > 0 && (
            <DesktopShelf title="おすすめの単語帳" seeAllHref="/shared" >
              {recommendedBooks.map((book) => (
                <DesktopRecommendedBookTile key={book.shareId} book={book} />
              ))}
            </DesktopShelf>
          )}

          {/* おすすめのリール（語源がある単語限定）。デスクトップで小さくなり
              すぎないようカード幅を広めに取る */}
          {(recommendationsLoading || recommendedReels.length > 0) && (
            <DesktopShelf title="おすすめのリール" seeAllHref="/reels" >
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

/* ============ マイ単語帳（従来の本棚タイル/行） ============ */

function DesktopGeneratingBookTile({ scan }: { scan: DesktopPendingScan }) {
  return (
    <div
      className="ds-book"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${scan.project_title} を生成中`}
      style={{
        background: scan.iconDataUrl
          ? `linear-gradient(rgba(26,26,26,0.42), rgba(26,26,26,0.42)), center / cover url(${scan.iconDataUrl})`
          : 'linear-gradient(135deg, #137FEC 0%, #3DA1B8 52%, #228B22 100%)',
        cursor: 'default',
        pointerEvents: 'none',
      }}
    >
      <div className="bk-spine" />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="bk-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scan.project_title}
          </div>
          <div className="bk-foot mono">単語を抽出中...</div>
        </div>
        <div
          className="scanvocab-generating-spin"
          style={{
            width: 30,
            height: 30,
            border: '3px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            borderRadius: 999,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      </div>
      <div>
        <div className="bk-n">AI<span className="u">解析</span></div>
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          <span className="scanvocab-generating-pulse" style={{ height: 9, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.78)' }} />
          <span className="scanvocab-generating-pulse" style={{ height: 9, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.58)', animationDelay: '0.16s' }} />
          <span className="scanvocab-generating-pulse" style={{ height: 9, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.38)', animationDelay: '0.32s' }} />
        </div>
      </div>
    </div>
  );
}

function DesktopBookTile({ project }: { project: DesktopHomeProject }) {
  const pct = project.totalWords > 0 ? Math.round((project.masteredWords / project.totalWords) * 100) : 0;
  const bg = project.iconImage ? undefined : desktopThumbColor(project.id);
  return (
    <Link
      href={`/project/${project.id}`}
      className="ds-book"
      style={{
        background: bg,
        backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="bk-spine" />
      <div>
        <div className="bk-title">{project.title}</div>
        <div className="bk-foot mono">{desktopSourceLabel(project)}</div>
      </div>
      <div>
        <div className="bk-n">{project.totalWords}<span className="u">語</span></div>
        <div className="bk-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="bk-foot">習得 {pct}% · 更新 {desktopUpdatedLabel(project.lastUsedAt ?? project.createdAt)}</div>
      </div>
    </Link>
  );
}

function DesktopGeneratingProjectRow({ scan }: { scan: DesktopPendingScan }) {
  return (
    <div className="ds-prow" role="status" aria-live="polite" aria-busy="true" style={{ cursor: 'default', pointerEvents: 'none' }}>
      <div
        className="tn"
        style={{
          background: scan.iconDataUrl
            ? `center / cover url(${scan.iconDataUrl})`
            : 'linear-gradient(135deg, #137FEC, #3DA1B8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="scanvocab-generating-spin"
          style={{
            width: 25,
            height: 25,
            border: '3px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            borderRadius: 999,
          }}
          aria-hidden="true"
        />
      </div>
      <div className="body">
        <div className="ttl">{scan.project_title}</div>
        <div className="sub">AI が単語を抽出しています</div>
      </div>
      <div className="count" style={{ fontSize: 18 }}>生成中</div>
    </div>
  );
}

function DesktopProjectRow({ project }: { project: DesktopHomeProject }) {
  const hasWords = project.totalWords > 0;
  return (
    <div className="ds-prow">
      <Link href={`/project/${project.id}`} className="ds-prow-main">
        <div
          className="tn"
          style={{
            background: desktopThumbColor(project.id),
            backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!project.iconImage && project.title.charAt(0)}
        </div>
        <div className="body">
          <div className="ttl">{project.title}</div>
          <div className="sub">{desktopSourceLabel(project)} · 更新 {desktopUpdatedLabel(project.lastUsedAt ?? project.createdAt)}</div>
        </div>
        <div className="count">{project.totalWords}<span className="u">語</span></div>
      </Link>
      {hasWords && (
        <Link
          href={`/quiz/${project.id}?from=/`}
          className="ds-prow-play"
          aria-label={`${project.title}のクイズを開始`}
          title="クイズを開始"
        >
          <Icon name="play_arrow" size={20} filled />
        </Link>
      )}
      <Icon name="chevron_right" style={{ color: 'var(--color-muted)' }} />
    </div>
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

// おすすめの共有単語帳。マイ単語帳と同じ本棚タイル（ds-book）で表示する。
function DesktopRecommendedBookTile({ book }: { book: HomeRecommendedBook }) {
  const bg = book.iconImage ? undefined : desktopThumbColor(book.shareId);
  return (
    <Link
      href={`/share/${book.shareId}`}
      className="ds-book"
      style={{
        background: bg,
        backgroundImage: book.iconImage ? `url(${book.iconImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="bk-spine" />
      <div>
        <div className="bk-title">{book.title}</div>
        <div className="bk-foot mono">
          {book.eikenLevelTag ? `おすすめ · ${book.eikenLevelTag}` : 'おすすめ'}
        </div>
      </div>
      <div>
        <div className="bk-n">{book.wordCount}<span className="u">語</span></div>
        <div className="bk-foot" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="thumb_up" style={{ fontSize: 13 }} />
          {book.likeCount}
        </div>
      </div>
    </Link>
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
