'use client';

/**
 * デスクトップホーム。
 * ヘッダ: ページ内トップバー（タイトル + 通知ベル）
 * 上部: ショートカットグリッド（今日の目標 + 保存済み + 単語帳/グループ/おすすめ）
 * 中段: マイ単語帳（176px の正方形タイルを横スクロールで並べる本棚）
 *       バインダーと語法問題集を2カラムで並べる
 * 下段: 参加中のグループ（3カラム）+ リアルタイム対戦の導線（Pro）
 * 右レール: 今日の目標 / 習得サマリー / 連続学習（DesktopStudySidebar）
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { DesktopStudySidebar } from '@/components/desktop/DesktopStudySidebar';
import { FollowNotificationsButton } from '@/components/notifications/FollowNotificationsButton';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import { DesktopHomeGrammarBooks } from '@/components/home/HomeGrammarBooks';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { GrammarBook } from '@/components/desktop/DesktopGrammar';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import type { BinderIconMap } from '@/lib/binders/icons';
import { buildHomeShortcutTiles, homeShortcutContentSlots } from '@/lib/home/shortcut-tiles';
import {
  prefetchGroupOverview,
  seedGroupSummary,
} from '@/lib/shared-projects/group-overview-cache';
import type { HomeRecommendedBook } from '@/lib/home/recommendations-types';
import type { Project } from '@/types';
import type { StudyGroupSummary, StudyGroupTopMember } from '@/lib/shared-projects/types';

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

// 1位/2位/3位のメダル色（グループのランキングページの podium と同じ）
const MEDALS = ['#FFC800', '#C3CDD6', '#E29C57'];

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
  binderIcons = {},
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
  /** バインダー名 -> アイコン画像 (/binder/[name]/settings で設定)。飾りなので無くてもよい */
  binderIcons?: BinderIconMap;
  onStartScan: () => void;
  showUpgrade?: boolean;
  onDismissUpgrade?: () => void;
}) {
  const { isPro } = useAuth();

  // バインダー (フォルダ) 一覧を binder 名で集計する
  const homeBinders = (() => {
    const byBinder = new Map<string, number>();
    for (const project of projects) {
      const name = project.binder?.trim();
      if (!name) continue;
      byBinder.set(name, (byBinder.get(name) ?? 0) + 1);
    }
    return [...byBinder.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .map(([name, count]) => ({ name, count }));
  })();

  const showShelfLoading = loading && projects.length === 0 && pendingScans.length === 0;
  const showBinderRow = homeBinders.length > 0 || grammarBooks.length > 0;
  const showGroupsSection = joinedGroups.length > 0 || isPro;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      {/* ホームはタブの起点なので戻るボタンは出さず、右側に通知ベルだけを置く */}
      <DesktopTopbar title="ホーム" crumb="MERKEN" back={false}>
        <FollowNotificationsButton variant="desktop" />
      </DesktopTopbar>
      <div className="ds-scroll ds-two-col">
        <div style={{ minWidth: 0 }}>
          {error && (
            <div className="ds-card" style={{ padding: 14, marginBottom: 18, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* ショートカットグリッド */}
          <DesktopShortcutGrid
            goal={goal}
            favoriteCount={stats.favoriteCount}
            projects={projects}
            groups={joinedGroups}
            recommendations={loading ? [] : recommendedBooks}
            onStartScan={onStartScan}
          />

          {/* マイ単語帳: 176px の本棚 */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '26px 2px 12px' }}>
            <div>
              <div className="ds-eyebrow">MY BOOKS</div>
              <h2 className="ds-h2">マイ単語帳</h2>
            </div>
            <Link href="/projects" className="ds-see-all">
              すべて見る
              <Icon name="chevron_right" />
            </Link>
          </div>
          {showShelfLoading ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)', boxShadow: 'none' }}>
              <Icon name="progress_activity" className="animate-spin" />
              <span style={{ marginLeft: 8 }}>読み込み中...</span>
            </div>
          ) : (
            <div className="ds-bookshelf">
              {pendingScans.map((scan) => (
                <div key={scan.id}>
                  <DesktopGeneratingBookTile scan={scan} />
                </div>
              ))}
              {projects.map((project) => (
                <div key={project.id}>
                  <DesktopBookTile project={project} />
                  {project.totalWords > 0 && (
                    <Link
                      href={`/quiz/${project.id}?from=/`}
                      className="ds-book-play"
                      aria-label={`${project.title}のクイズを開始`}
                      title="クイズを開始"
                    >
                      <Icon name="play_arrow" size={18} filled />
                    </Link>
                  )}
                </div>
              ))}
              <div>
                <button type="button" onClick={onStartScan} className="ds-book ds-book--new">
                  <Icon name="add" style={{ fontSize: 28, color: 'var(--color-ink)' }} />
                  <div className="nt">新しい単語帳</div>
                  <div className="ns">写真を撮るだけ</div>
                </button>
              </div>
            </div>
          )}

          {/* バインダー / 語法問題集 */}
          {showBinderRow && (
            <div style={{ display: 'grid', gridTemplateColumns: homeBinders.length > 0 && grammarBooks.length > 0 ? '1fr 1fr' : '1fr', gap: 24, paddingTop: 22 }}>
              {homeBinders.length > 0 && (
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 12px' }}>
                    <div>
                      <div className="ds-eyebrow">BINDERS</div>
                      <h2 className="ds-h2">バインダー</h2>
                    </div>
                  </div>
                  <div className="ds-tile-row">
                    {homeBinders.map((binder) => (
                      <DesktopBinderTile key={binder.name} name={binder.name} count={binder.count} iconImage={binderIcons[binder.name] ?? null} />
                    ))}
                  </div>
                </div>
              )}
              <DesktopHomeGrammarBooks books={grammarBooks} />
            </div>
          )}

          {/* 参加中のグループ + リアルタイム対戦 */}
          {showGroupsSection && (
            <div style={{ paddingTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 12px' }}>
                <Icon name="groups" size={20} style={{ color: 'var(--color-ink)' }} />
                <h2 className="ds-h2" style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>参加中のグループ</h2>
                <span className="ds-count-badge">{joinedGroups.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, alignItems: 'start' }}>
                {joinedGroups.map((group) => (
                  <DesktopGroupCard key={group.id} group={group} />
                ))}
                {isPro && (
                  <Link href="/battle" className="ds-battle-cta">
                    <span className="spine" />
                    <Icon name="bolt" style={{ fontSize: 28, marginLeft: 4 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="t">リアルタイム対戦</span>
                      <span className="s">早押し4択 / フレンド・ランダム</span>
                    </span>
                    <Icon name="chevron_right" style={{ fontSize: 18 }} />
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* おすすめの単語帳 */}
          {recommendedBooks.length > 0 && (
            <div style={{ paddingTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 12px' }}>
                <div>
                  <div className="ds-eyebrow">RECOMMENDED</div>
                  <h2 className="ds-h2">おすすめの単語帳</h2>
                </div>
                <Link href="/shared" className="ds-see-all">
                  すべて見る
                  <Icon name="chevron_right" />
                </Link>
              </div>
              <div className="ds-bookshelf">
                {recommendedBooks.map((book) => (
                  <div key={book.shareId}>
                    <DesktopRecommendedBookTile book={book} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右レール */}
        <div className="ds-rail">
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

/* ============ ショートカットグリッド ============ */

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

/* ============ マイ単語帳（本棚タイル） ============ */

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
          <div className="bk-title" style={{ paddingLeft: 0 }}>{scan.project_title}</div>
          <div className="bk-foot">単語を抽出中...</div>
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
        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
          <span className="scanvocab-generating-pulse" style={{ height: 7, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.78)' }} />
          <span className="scanvocab-generating-pulse" style={{ height: 7, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.58)', animationDelay: '0.16s' }} />
          <span className="scanvocab-generating-pulse" style={{ height: 7, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.38)', animationDelay: '0.32s' }} />
        </div>
      </div>
    </div>
  );
}

// バインダー (フォルダ) タイル。DesktopBookTile と同じ ds-book シェル・配色
// (desktopThumbColor) で、キーは binder 名。アイコン画像が設定されていれば
// モバイルのホームと同じくそれを面に敷く。
function DesktopBinderTile({ name, count, iconImage }: { name: string; count: number; iconImage?: string | null }) {
  return (
    <Link
      href={`/binder/${encodeURIComponent(name)}`}
      className="ds-book"
      style={{
        background: iconImage ? undefined : desktopThumbColor(name),
        backgroundImage: iconImage ? `url(${iconImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        textShadow: iconImage ? '1px 1px 0 rgba(0,0,0,0.35)' : undefined,
      }}
    >
      <div className="bk-spine" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon name="folder" filled style={{ fontSize: 15 }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>BINDER</span>
      </div>
      <div>
        <div className="bk-title" style={{ paddingLeft: 0, fontSize: 14 }}>{name}</div>
        <div className="bk-foot">{count}冊</div>
      </div>
    </Link>
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
      <div className="bk-title" style={{ paddingLeft: 0 }}>{project.title}</div>
      <div>
        <div className="bk-n">{project.totalWords}<span className="u">語</span></div>
        <div className="bk-bar"><i style={{ width: `${pct}%` }} /></div>
      </div>
    </Link>
  );
}

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
        <div className="bk-title" style={{ paddingLeft: 0 }}>{book.title}</div>
        <div className="bk-foot">{book.eikenLevelTag ? `おすすめ · ${book.eikenLevelTag}` : 'おすすめ'}</div>
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

/* ============ 参加中のグループ ============ */

function topMemberLabel(member: StudyGroupTopMember): string {
  return member.username ?? (member.accountId ? `@${member.accountId}` : '匿名');
}

function DesktopGroupCard({ group }: { group: StudyGroupSummary }) {
  const top = (group.topMembers ?? []).slice(0, 3);
  const maxCount = Math.max(...top.map((member) => member.quizCount), 1);
  const viewerRank = top.findIndex((member) => member.isViewer);
  const handlePress = () => {
    // タップ時点で概要をシード+先読みし、グループページのヘッダーを即描画できるようにする
    seedGroupSummary(group);
    prefetchGroupOverview(group.id);
  };

  return (
    <Link
      href={`/groups/${group.id}`}
      className="ds-group-card"
      onPointerDown={handlePress}
      onClick={handlePress}
      aria-label={`${group.name}のグループを開く`}
    >
      <div className="head" style={{ background: desktopThumbColor(group.id) }}>
        <span className="spine" />
        {group.iconImage ? (
          <GroupAvatar group={group} size={28} borderWidth={0} />
        ) : (
          <Icon name="groups" style={{ fontSize: 18 }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm">{group.name}</div>
          <div className="mt">{group.memberCount}人 · {group.projectCount}冊</div>
        </div>
        {viewerRank >= 0 && (
          <span className="rank">
            <Icon name="emoji_events" filled style={{ fontSize: 12, color: '#FFC800' }} />
            {viewerRank + 1}位
          </span>
        )}
      </div>
      {top.length === 0 ? (
        <div className="empty">今週の記録はまだありません</div>
      ) : (
        <div className="body">
          {top.map((member, index) => {
            const label = topMemberLabel(member);
            return (
              <div key={member.userId} className="mem">
                <div style={{ position: 'relative' }}>
                  <ProfileAvatar
                    avatarUrl={member.avatarUrl}
                    initial={label.charAt(0).toUpperCase()}
                    color={profileAvatarColor(member.accountId ?? member.userId)}
                    size={34}
                    radius={17}
                    fontSize={13}
                  />
                  <span className="medal" style={{ background: MEDALS[index] ?? '#fff' }}>{index + 1}</span>
                </div>
                <span className="nm" style={{ color: member.isViewer ? 'var(--color-accent)' : 'var(--color-ink)' }}>{label}</span>
                <div className="bar"><i style={{ width: `${Math.round((member.quizCount / maxCount) * 100)}%` }} /></div>
                <span className="ct">{member.quizCount}<span className="u">問</span></span>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}

/* ============ 右レール ============ */

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
        <div className="ds-eyebrow" style={{ color: 'var(--color-accent)' }}>UPGRADE</div>
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
