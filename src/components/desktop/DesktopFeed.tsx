'use client';

/**
 * デスクトップ版フィード（/friends）。
 * 学習タイムラインを本文幅いっぱいのフルブリードなリストで表示し、
 * フレンド申請があるときだけ右カラムに申請パネルを出す。
 * 行をクリックすると学習内容が単語詳細と同じモーダルで浮き上がる。
 * スタイルは desktop.css の .ds-feed-* を参照。
 */

import Link from 'next/link';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui/Icon';
import {
  avatarColor,
  displayName,
  formatRelativeTime,
  type FeedEntry,
} from '@/lib/friends/feed-display';
import type {
  FriendProfile,
  FriendshipSummary,
  FriendsHomePayload,
  FriendTimelineSession,
} from '@/lib/friends/types';
import type { StudyGroupFeedEvent } from '@/lib/shared-projects/types';

type DesktopFeedProps = {
  loading: boolean;
  timelineLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  entries: FeedEntry[];
  home: FriendsHomePayload;
  actionLoading: string | null;
  activeSession: FriendTimelineSession | null;
  onOpenSession: (session: FriendTimelineSession) => void;
  onCloseSession: () => void;
  onRespondRequest: (friendshipId: string, action: 'accept' | 'decline') => void;
  onRemoveFriend: (friendshipId: string) => void;
  onRefresh: () => void;
};

export function DesktopFeed({
  loading,
  timelineLoading,
  isAuthenticated,
  error,
  entries,
  home,
  actionLoading,
  activeSession,
  onOpenSession,
  onCloseSession,
  onRespondRequest,
  onRemoveFriend,
  onRefresh,
}: DesktopFeedProps) {
  return (
    <>
      <DesktopTopbar title="フィード" crumb="学習タイムライン">
        {isAuthenticated && !loading && (
          <DesktopButton onClick={onRefresh} icon="refresh" variant="ghost" title="フィードを更新">
            更新
          </DesktopButton>
        )}
      </DesktopTopbar>
      <div className="ds-scroll flush">
        <div className="ds-feed-wrap">
          {loading ? (
            <FeedSkeleton />
          ) : !isAuthenticated ? (
            <FeedLoginCard />
          ) : (
            <>
              {error && (
                <div className="ds-feed-error" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={onRefresh}>再試行</button>
                </div>
              )}
              <div className={`ds-feed-grid${home.incoming.length > 0 || home.outgoing.length > 0 ? '' : ' single'}`}>
                <div className="ds-feed-main">
                  {entries.length > 0 && (
                    <div className="ds-feed-list">
                      {entries.map((entry) =>
                        entry.kind === 'quiz' ? (
                          <QuizEntryCard
                            key={`quiz-${entry.session.id}`}
                            session={entry.session}
                            onOpen={() => onOpenSession(entry.session)}
                          />
                        ) : (
                          <GroupEntryCard key={`group-${entry.event.id}`} event={entry.event} />
                        ),
                      )}
                    </div>
                  )}
                  {timelineLoading && (
                    <div className="ds-feed-loadrow">
                      <Icon name="progress_activity" className="animate-spin" size={20} />
                    </div>
                  )}
                  {!timelineLoading && entries.length === 0 && <FeedEmptyCard />}
                </div>

                {(home.incoming.length > 0 || home.outgoing.length > 0) && (
                  <aside className="ds-feed-side">
                    <RequestsPanel
                      incoming={home.incoming}
                      outgoing={home.outgoing}
                      actionLoading={actionLoading}
                      onRespondRequest={onRespondRequest}
                      onRemoveFriend={onRemoveFriend}
                    />
                  </aside>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {activeSession && (
        <SessionDetailModal session={activeSession} onClose={onCloseSession} />
      )}
    </>
  );
}

/* ── タイムラインカード ──────────────────────────────────── */

function QuizEntryCard({
  session,
  onOpen,
}: {
  session: FriendTimelineSession;
  onOpen: () => void;
}) {
  const profileHref = `/profile/${encodeURIComponent(session.profile.accountId)}`;
  return (
    <article className="ds-feed-card fade-in">
      {/* 行全体をクリックで学習内容モーダルを開く（下方向への展開はしない） */}
      <div
        className="fc-row fc-toggle"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label="学習内容を見る"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <Link
          href={profileHref}
          className="ds-feed-avatar md"
          style={{ backgroundColor: avatarColor(session.profile.accountId) }}
          aria-label={`${displayName(session.profile)}のプロフィール`}
          onClick={(event) => event.stopPropagation()}
        >
          {(session.profile.username || session.profile.accountId || '?').charAt(0).toUpperCase()}
        </Link>
        <div className="fc-body">
          <p className="fc-text">
            <Link href={profileHref} onClick={(event) => event.stopPropagation()}>
              {displayName(session.profile)}
            </Link>
            さんが{session.answerCount}問クイズを解きました
          </p>
          <div className="fc-meta">
            <span className="id">@{session.profile.accountId}</span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeTime(session.lastAnsweredAt)}</span>
          </div>
          <div className="fc-chips">
            <span className="ds-feed-chip quiz">
              <Icon name="quiz" size={14} />
              <span className="n">{session.answerCount}</span>問
            </span>
            <span className="ds-feed-chip mastered">
              <Icon name="check_circle" size={14} />
              <span className="n">{session.masteredCount}</span>語 習得
            </span>
          </div>
        </div>
        <Icon name="chevron_right" size={20} className="fc-chev" />
      </div>
    </article>
  );
}

/** 学習内容の詳細。単語詳細（ds-modal）と同じく浮き上がるモーダルで表示する。 */
function SessionDetailModal({
  session,
  onClose,
}: {
  session: FriendTimelineSession;
  onClose: () => void;
}) {
  const profileHref = `/profile/${encodeURIComponent(session.profile.accountId)}`;
  return (
    <div className="ds-overlay" onClick={onClose}>
      <div
        className="ds-modal"
        role="dialog"
        aria-modal="true"
        aria-label="学習の詳細"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ds-modal-head">
          <div className="lab">学習の詳細</div>
          <div className="nav">
            <button type="button" className="ds-iconbtn" onClick={onClose} aria-label="閉じる">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="ds-modal-body">
          <div className="ds-feed-detail-head">
            <Link
              href={profileHref}
              className="ds-feed-avatar md"
              style={{ backgroundColor: avatarColor(session.profile.accountId) }}
              aria-label={`${displayName(session.profile)}のプロフィール`}
            >
              {(session.profile.username || session.profile.accountId || '?').charAt(0).toUpperCase()}
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, lineHeight: 1.55, color: 'var(--color-ink)' }}>
                <Link
                  href={profileHref}
                  style={{ color: 'inherit', fontFamily: 'var(--font-display)', fontWeight: 800, textDecoration: 'none' }}
                >
                  {displayName(session.profile)}
                </Link>
                さんが{session.answerCount}問クイズを解きました
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>@{session.profile.accountId}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRelativeTime(session.lastAnsweredAt)}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
                <span className="ds-feed-chip quiz">
                  <Icon name="quiz" size={14} />
                  {session.answerCount}問
                </span>
                <span className="ds-feed-chip mastered">
                  <Icon name="check_circle" size={14} />
                  {session.masteredCount}語 習得
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="ds-feed-detail-lab">
              <Icon name="school" size={13} />
              習得した単語
            </div>
            {session.words.length > 0 ? (
              <div className="ds-feed-detail-grid">
                {session.words.map((word) => (
                  <div key={word.id} className="ds-feed-detail-word">
                    <span className="en">{word.english}</span>
                    <span className="ja">{word.japanese}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ds-feed-detail-none">習得済みに変わった単語はありません</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupEntryCard({ event }: { event: StudyGroupFeedEvent }) {
  return (
    <article className="ds-feed-card fade-in">
      <Link href={`/groups/${event.groupId}`} className="fc-row fc-link">
        <div
          className="ds-feed-avatar md"
          style={{ backgroundColor: avatarColor(event.groupId) }}
        >
          <Icon name="library_add" size={20} />
        </div>
        <div className="fc-body">
          <p className="fc-text">
            <span className="fc-strong">{event.groupName}</span>
            に「{event.projectTitle}」が追加されました
          </p>
          <div className="fc-meta">
            {event.actorName && <span>{event.actorName}</span>}
            {event.actorName && <span aria-hidden="true">·</span>}
            <span>{formatRelativeTime(event.createdAt)}</span>
          </div>
        </div>
        <Icon name="chevron_right" size={20} className="fc-chev" />
      </Link>
    </article>
  );
}

/* ── サイドパネル（申請 / フレンド） ─────────────────────── */

function RequestsPanel({
  incoming,
  outgoing,
  actionLoading,
  onRespondRequest,
  onRemoveFriend,
}: {
  incoming: FriendshipSummary[];
  outgoing: FriendshipSummary[];
  actionLoading: string | null;
  onRespondRequest: (friendshipId: string, action: 'accept' | 'decline') => void;
  onRemoveFriend: (friendshipId: string) => void;
}) {
  return (
    <section className="ds-feed-panel">
      <header className="ph">
        <Icon name="mark_email_unread" size={16} />
        <span className="t">申請</span>
        <span className="ct">{incoming.length + outgoing.length}</span>
      </header>
      <div className="pb">
        {incoming.map((item) => (
          <SideRow key={item.id} profile={item.profile}>
            <button
              type="button"
              className="ds-feed-act ok"
              onClick={() => onRespondRequest(item.id, 'accept')}
              disabled={Boolean(actionLoading)}
              aria-label="承認"
            >
              <Icon
                name={actionLoading === `accept:${item.id}` ? 'progress_activity' : 'check'}
                className={actionLoading === `accept:${item.id}` ? 'animate-spin' : ''}
                size={15}
              />
            </button>
            <button
              type="button"
              className="ds-feed-act"
              onClick={() => onRespondRequest(item.id, 'decline')}
              disabled={Boolean(actionLoading)}
              aria-label="拒否"
            >
              <Icon name="close" size={15} />
            </button>
          </SideRow>
        ))}
        {outgoing.map((item) => (
          <SideRow key={item.id} profile={item.profile}>
            <span className="ds-feed-pending">申請中</span>
            <button
              type="button"
              className="ds-feed-act"
              onClick={() => onRemoveFriend(item.id)}
              disabled={Boolean(actionLoading)}
              aria-label="申請を取り消す"
            >
              <Icon name="close" size={15} />
            </button>
          </SideRow>
        ))}
      </div>
    </section>
  );
}

function SideRow({
  profile,
  children,
}: {
  profile: FriendProfile;
  children: React.ReactNode;
}) {
  const profileHref = `/profile/${encodeURIComponent(profile.accountId)}`;
  return (
    <div className="ds-feed-frow">
      <Link
        href={profileHref}
        className="ds-feed-avatar sm"
        style={{ backgroundColor: avatarColor(profile.accountId) }}
        aria-label={`${displayName(profile)}のプロフィール`}
      >
        {(profile.username || profile.accountId || '?').charAt(0).toUpperCase()}
      </Link>
      <div className="info">
        <Link href={profileHref} className="nm">{displayName(profile)}</Link>
        <div className="id">@{profile.accountId}</div>
      </div>
      {children}
    </div>
  );
}

/* ── 状態カード（空 / 未ログイン / スケルトン） ──────────── */

function FeedEmptyCard() {
  return (
    <div className="ds-feed-card">
      <div className="ds-feed-empty">
        <div className="eic">
          <Icon name="dynamic_feed" size={28} />
        </div>
        <div className="et">まだアクティビティがありません</div>
        <p className="ed">
          フレンドがクイズを解いたり、グループに単語帳が追加されると、ここに流れてきます。まずは自分がクイズを解いてみましょう。
        </p>
        <Link href="/" className="ds-btn dark" style={{ marginTop: 18 }}>
          <Icon name="quiz" />
          クイズを始める
        </Link>
      </div>
    </div>
  );
}

function FeedLoginCard() {
  return (
    <div className="ds-feed-card" style={{ maxWidth: 460, margin: '48px auto 0' }}>
      <div className="ds-feed-empty">
        <div className="eic">
          <Icon name="lock" size={28} />
        </div>
        <div className="et">ログインが必要です</div>
        <p className="ed">フレンドの学習タイムラインを見るにはログインしてください。</p>
        <Link href="/login" className="ds-btn dark" style={{ marginTop: 18 }}>
          ログイン
        </Link>
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="ds-feed-grid single" aria-hidden="true">
      <div className="ds-feed-main">
        {[0, 1, 2].map((index) => (
          <div key={index} className="ds-feed-skel">
            <div className="ds-shimmer av" />
            <div className="body">
              <div className="ds-shimmer ln w70" />
              <div className="ds-shimmer ln w40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
