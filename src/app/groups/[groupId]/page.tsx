'use client';

/**
 * グループのトップ（ハブ）。
 *
 * モバイルは LINE のトークルーム風: 固定ヘッダ（戻る / ルーム名 / メンバー
 * アイコン）＋ 2×2 の大きなタイル（ランキング・単語帳・対戦・単語一覧）だけ。
 * 各機能の中身はそれぞれの専用ページに置き、このページには積まない。
 *
 * デスクトップ（lg 以上）は ds-top（戻る / アイコン / 名前 / メンバー / 招待）＋
 * 4枚のハブタイル → KPI → 単語帳の本棚 と、右レールにランキング / メンバー /
 * 苦戦中 を置く2カラム表示。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DesktopBackButton } from '@/components/desktop/DesktopChrome';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import { GroupHubTiles, buildGroupHubTiles, type GroupHubTile } from '@/components/groups/GroupHubTiles';
import { GroupLeaderboard, findViewerRank } from '@/components/groups/GroupLeaderboard';
import { GroupRoomHeader } from '@/components/groups/GroupRoomHeader';
import { GroupTopThree } from '@/components/groups/GroupTopThree';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { getSeededGroupSummary, loadGroupOverview } from '@/lib/shared-projects/group-overview-cache';
import type {
  SharedProjectCard,
  StudyGroupLeaderboardEntry,
  StudyGroupMember,
  StudyGroupMissedWord,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import { thumbColor } from './member-ui';

// シェアシートはブランドSVG込みで重いので、開くまでロードしない。
const GroupInviteShareSheet = dynamic(
  () => import('./invite-share-sheet').then((mod) => mod.GroupInviteShareSheet),
  { ssr: false },
);

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  // 遷移元（ホームのグループカード等）がシードしたサマリーがあれば、フルの
  // 概要ペイロードを待たずにヘッダーを即描画する（遷移の体感短縮）。
  const [group, setGroup] = useState<StudyGroupSummary | null>(() =>
    groupId ? getSeededGroupSummary(groupId) : null,
  );
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [members, setMembers] = useState<StudyGroupMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<StudyGroupLeaderboardEntry[]>([]);
  const [missedWords, setMissedWords] = useState<StudyGroupMissedWord[]>([]);
  const [missedWordsTotalCount, setMissedWordsTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteShareOpen, setInviteShareOpen] = useState(false);

  const load = useCallback(async (options: { force?: boolean } = {}) => {
    if (!groupId) return;
    setError(null);
    try {
      // stale-while-revalidate: キャッシュがあれば即描画し、背景で再検証する。
      await loadGroupOverview(groupId, (payload) => {
        setGroup(payload.group);
        setProjects(payload.projects);
        setMembers(payload.members);
        setLeaderboard(payload.leaderboard);
        setMissedWords(payload.missedWords);
        setMissedWordsTotalCount(payload.missedWordsTotalCount);
        setLoading(false);
      }, options);
    } catch (loadError) {
      console.warn('Failed to load group overview:', loadError);
      setError('グループ情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  // authLoading を待たずに即フェッチする（サーバー側はCookieで認証）。
  useEffect(() => {
    void load();
  }, [load]);

  const copyInvite = useCallback(async () => {
    if (!group?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      showToast({ message: '招待コードをコピーしました', type: 'success' });
    } catch {
      showToast({ message: 'コピーに失敗しました', type: 'error' });
    }
  }, [group?.inviteCode, showToast]);

  const totalQuiz = useMemo(
    () => leaderboard.reduce((sum, entry) => sum + entry.quizCount, 0),
    [leaderboard],
  );
  const totalWords = useMemo(
    () => projects.reduce((sum, card) => sum + (card.wordCount ?? 0), 0),
    [projects],
  );
  const viewerRank = useMemo(() => findViewerRank(leaderboard), [leaderboard]);
  const viewerQuizCount = useMemo(
    () => leaderboard.find((entry) => entry.isViewer)?.quizCount ?? 0,
    [leaderboard],
  );

  const groupPath = `/groups/${encodeURIComponent(groupId)}`;
  const settingsHref = `${groupPath}/settings`;
  const membersHref = `${groupPath}/members`;

  const tiles = useMemo(
    () => buildGroupHubTiles({
      groupId,
      myRank: viewerRank,
      myQuizCount: viewerQuizCount,
      bookCount: group?.projectCount ?? projects.length,
      memberCount: group?.memberCount ?? members.length,
      wordCount: totalWords,
    }),
    [groupId, viewerRank, viewerQuizCount, group, projects.length, members.length, totalWords],
  );

  const stateView = authLoading || (loading && !group) ? (
    <LoadingState />
  ) : !isAuthenticated ? (
    <CenteredCard icon="lock" title="ログインが必要です">
      <Link href="/login?redirect=/shared" className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-3 font-display text-sm font-bold text-white">
        ログイン
      </Link>
    </CenteredCard>
  ) : error || !group ? (
    <CenteredCard icon="error" title={error ?? 'グループが見つかりません'}>
      <button type="button" onClick={() => void load()} className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-3 font-display text-sm font-bold text-[var(--solid-ink)]">
        再読み込み
      </button>
    </CenteredCard>
  ) : null;

  return (
    <>
      {/* Desktop */}
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <div className="ds-top" style={{ gap: 12 }}>
          <DesktopBackButton fallbackHref="/shared" />
          {group && <GroupAvatar group={group} size={40} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">
              GROUP{group ? ` · ${group.memberCount}人 · ${group.projectCount}冊` : ''}
            </div>
            <h1>{group?.name ?? 'グループ'}</h1>
          </div>
          {group && (
            <>
              <DesktopMemberStack members={members} href={membersHref} />
              <button type="button" className="ds-btn pill" onClick={() => void copyInvite()} title="招待コードをコピー">
                <Icon name="content_copy" />
                <span className="tnum">{group.inviteCode}</span>
              </button>
              <button type="button" className="ds-btn dark pill" onClick={() => setInviteShareOpen(true)}>
                <Icon name="ios_share" />
                シェア
              </button>
              <Link href={settingsHref} className="ds-iconbtn-round sm" aria-label="グループ設定" title="グループ設定">
                <Icon name="settings" />
              </Link>
            </>
          )}
        </div>
        <div className="ds-scroll">
          {stateView ?? (group && (
            loading ? (
              <LoadingState />
            ) : (
              <>
                {/* ハブ: ランキング / 単語帳 / 対戦 / 単語一覧 */}
                <div className="ds-hub-grid">
                  {tiles.map((tile) => (
                    <DesktopHubTile key={tile.key} tile={tile} />
                  ))}
                </div>

                {/* 今週の数字 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, paddingTop: 14 }}>
                  <GroupKpi icon="emoji_events" iconColor="#FFC800" label="あなたの順位" value={viewerRank ? `${viewerRank}` : '–'} suffix={viewerRank ? '位' : ''} />
                  <GroupKpi icon="bolt" iconColor="var(--color-accent)" label="今週のあなた" value={`${viewerQuizCount}`} suffix="問" />
                  <GroupKpi icon="groups" iconColor="var(--color-muted)" label="今週のグループ" value={`${totalQuiz}`} suffix="問" />
                  <GroupKpi icon="menu_book" iconColor="var(--color-muted)" label="共有中の単語" value={`${totalWords}`} suffix="語" />
                </div>

                <div className="ds-two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', paddingTop: 22 }}>
                  <div style={{ minWidth: 0 }}>
                    <GroupWordbooksSection groupId={groupId} projects={projects} />
                  </div>
                  <div className="ds-rail">
                    <DesktopRailCard eyebrow="THIS WEEK" title="今週のランキング" href={`${groupPath}/ranking`}>
                      <GroupLeaderboard leaderboard={leaderboard.slice(0, 5)} />
                      {leaderboard.length > 0 && (
                        <p className="muted" style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 10.5, fontWeight: 700 }}>
                          毎週月曜0時にリセット · 今週このグループで {totalQuiz} 問
                        </p>
                      )}
                    </DesktopRailCard>
                    <DesktopRailCard eyebrow="MEMBERS" title={`メンバー ${members.length}人`} href={membersHref}>
                      <DesktopMemberList members={members} />
                    </DesktopRailCard>
                    <DesktopRailCard eyebrow="STRUGGLING" title="みんなが苦戦中" href={`${groupPath}/words?filter=struggling`}>
                      <MissedWordList missedWords={missedWords} totalCount={missedWordsTotalCount} />
                    </DesktopRailCard>
                  </div>
                </div>
              </>
            )
          ))}
        </div>
      </div>

      {/* Mobile: ハブ画面（固定ヘッダ + 2×2タイル） */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
        <GroupRoomHeader group={group} members={members} membersHref={membersHref} />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            className="mx-auto flex min-h-full w-full max-w-[560px] flex-col px-[14px] pt-3"
            style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
          >
            {stateView ?? (group && (
              <>
                {/* 上部に今週の上位3人。枠は付けず、アイコンを背景の上に直接置く。
                    メンバーは全員0問でも並ぶので、空配列＝まだ読めていない状態。
                    その間は出さない（一瞬「誰も解いていません」が出るため）*/}
                {leaderboard.length > 0 && (
                  <GroupTopThree leaderboard={leaderboard} href={`${groupPath}/ranking`} />
                )}

                {/* タイルは残りの余白の中央に置く（下端に貼り付けない） */}
                <div className="flex flex-1 items-center">
                  <GroupHubTiles tiles={tiles} />
                </div>

                {/* 補助動線は下に細く1行だけ。カードを縦に積まない */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <ActionPill icon="content_copy" label="招待コード" onClick={() => { triggerHaptic(); void copyInvite(); }} />
                  <ActionPill icon="ios_share" label="シェア" onClick={() => { triggerHaptic(); setInviteShareOpen(true); }} />
                  <ActionPill icon="settings" label="設定" href={settingsHref} />
                </div>

                {leaderboard.length > 0 && (
                  <p className="mt-2.5 text-center font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                    今週このグループで {totalQuiz} 問
                  </p>
                )}
              </>
            ))}
          </div>
        </div>
      </div>

      {group && (
        <GroupInviteShareSheet
          open={inviteShareOpen}
          group={group}
          onClose={() => setInviteShareOpen(false)}
        />
      )}
    </>
  );
}

function ActionPill({
  icon,
  label,
  href,
  onClick,
}: {
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className = 'flex h-[42px] items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[12px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px';
  const content = (
    <>
      <Icon name={icon} size={15} />
      {label}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={() => triggerHaptic()} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/* ---------------- デスクトップ側 ---------------- */

/** ハブタイル。モバイルの 2×2 と同じ面（グラデーション + 透かしアイコン）を横1列に並べる */
function DesktopHubTile({ tile }: { tile: GroupHubTile }) {
  const ink = tile.foreground === 'dark';
  const text = ink ? '#1a1a1a' : '#fff';
  return (
    <Link
      href={tile.href}
      className="ds-hub-tile"
      style={{ background: tile.background, color: text }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))' }}
      />
      <Icon name={tile.icon} size={96} filled aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 opacity-[0.18]" />
      <span
        className="ic"
        style={{
          borderColor: ink ? '#1a1a1a' : 'rgba(255,255,255,0.7)',
          background: ink ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)',
        }}
      >
        <Icon name={tile.icon} size={20} />
      </span>
      <span style={{ position: 'relative', zIndex: 1 }}>
        <span className="lb">{tile.label}</span>
        <span className="dt">{tile.detail}</span>
      </span>
    </Link>
  );
}

function GroupKpi({ icon, iconColor, label, value, suffix }: { icon: string; iconColor: string; label: string; value: string; suffix: string }) {
  return (
    <div style={{ borderRadius: 12, border: '2px solid var(--solid-ink)', background: 'var(--color-surface)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: iconColor }}>
        <Icon name={icon} size={13} filled />
        <span className="ds-eyebrow" style={{ fontSize: 9 }}>{label}</span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, lineHeight: 1, color: 'var(--solid-ink)' }}>{value}</span>
        {suffix && <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function DesktopRailCard({ eyebrow, title, href, children }: { eyebrow: string; title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="ds-card" style={{ padding: '16px 18px', boxShadow: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ds-eyebrow">{eyebrow}</div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: 'var(--solid-ink)' }}>{title}</h2>
        </div>
        <Link href={href} className="ds-see-all">
          すべて見る
          <Icon name="chevron_right" />
        </Link>
      </div>
      {children}
    </section>
  );
}

const MAX_STACK = 5;

/** トップバー右のメンバーアイコン（重ねて表示、クリックでメンバー一覧） */
function DesktopMemberStack({ members, href }: { members: StudyGroupMember[]; href: string }) {
  if (members.length === 0) return null;
  const visible = members.slice(0, MAX_STACK);
  const overflow = members.length - visible.length;
  return (
    <Link href={href} className="ds-member-stack" aria-label={`メンバー ${members.length}人を見る`} title="メンバー">
      {visible.map((member) => (
        <ProfileAvatar
          key={member.userId}
          avatarUrl={member.avatarUrl}
          initial={memberLabel(member).charAt(0).toUpperCase()}
          color={profileAvatarColor(member.accountId ?? member.userId)}
          size={30}
          radius={15}
          fontSize={12}
        />
      ))}
      {overflow > 0 && <span className="more">+{overflow}</span>}
    </Link>
  );
}

function memberLabel(member: StudyGroupMember): string {
  return member.username ?? (member.accountId ? `@${member.accountId}` : '匿名');
}

function DesktopMemberList({ members }: { members: StudyGroupMember[] }) {
  if (members.length === 0) return <EmptyRow message="メンバーを読み込み中..." />;
  const shown = members.slice(0, 8);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {shown.map((member) => {
        const label = memberLabel(member);
        return (
          <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--color-border)' }}>
            <ProfileAvatar
              avatarUrl={member.avatarUrl}
              initial={label.charAt(0).toUpperCase()}
              color={profileAvatarColor(member.accountId ?? member.userId)}
              size={30}
              radius={15}
              fontSize={12}
            />
            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 800, color: member.isViewer ? 'var(--color-accent)' : 'var(--solid-ink)' }}>
              {label}
              {member.isViewer && <span className="muted" style={{ marginLeft: 4, fontSize: 10 }}>あなた</span>}
            </span>
            {member.role === 'owner' && (
              <span style={{ flexShrink: 0, borderRadius: 999, border: '1px solid var(--color-border)', padding: '2px 6px', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                owner
              </span>
            )}
          </div>
        );
      })}
      {members.length > shown.length && (
        <p className="muted" style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>ほか {members.length - shown.length} 人</p>
      )}
    </div>
  );
}

function MissedWordList({
  missedWords,
  totalCount,
}: {
  missedWords: StudyGroupMissedWord[];
  totalCount: number;
}) {
  const max = missedWords[0]?.missCount ?? 1;
  if (missedWords.length === 0) {
    return <EmptyRow message="2人以上が間違えた単語がまだありません" />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {missedWords.map((word, index) => (
        <div key={word.englishKey} className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <span className="w-5 shrink-0 text-center font-mono text-[13px] font-extrabold tabular-nums text-[#CC4D59]">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">{word.english}</div>
            <div className="truncate text-[11px] font-bold text-[var(--color-muted)]">{word.japanese}</div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
              <div
                className="h-full rounded-full bg-[#CC4D59]"
                style={{ width: `${Math.max(12, Math.round((word.missCount / max) * 100))}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="font-mono text-[14px] font-extrabold tabular-nums text-[#CC4D59]">{word.missCount}</span>
            <span className="ml-0.5 text-[10px] font-bold text-[var(--color-muted)]">回</span>
          </div>
        </div>
      ))}
      {totalCount > missedWords.length && (
        <p className="pt-1 text-center text-[11px] font-bold text-[var(--color-muted)]">
          ほか {totalCount - missedWords.length} 語
        </p>
      )}
    </div>
  );
}

// デスクトップ用: グループの単語帳をホームの本棚と同じ正方形タイルで並べる。
// 共有・解除の管理は従来どおり本棚ページで行う。
function GroupWordbooksSection({ groupId, projects }: { groupId: string; projects: SharedProjectCard[] }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 12px' }}>
        <div>
          <div className="ds-eyebrow">SHARED BOOKS</div>
          <h2 className="ds-h2">みんなの単語帳<span className="muted" style={{ marginLeft: 8, fontSize: 12, fontWeight: 700 }}>{projects.length}冊</span></h2>
        </div>
        <Link href={`/groups/${encodeURIComponent(groupId)}/bookshelf`} className="ds-btn pill">
          <Icon name="library_add" />
          共有・管理
        </Link>
      </div>
      {projects.length === 0 ? (
        <EmptyRow message="まだ単語帳がありません。最初の1冊を共有しよう！" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {projects.map((card) => (
            <GroupBookTile key={card.project.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

function GroupBookTile({ card }: { card: SharedProjectCard }) {
  const href = card.project.shareId ? `/share/${card.project.shareId}` : '#';
  const hasImage = Boolean(card.project.iconImage);
  return (
    <Link
      href={href}
      onClick={() => triggerHaptic()}
      className="ds-book"
      style={{
        background: hasImage ? undefined : thumbColor(card.project.id),
        backgroundImage: hasImage ? `url(${card.project.iconImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="bk-spine" />
      <div className="bk-title" style={{ paddingLeft: 0, textShadow: hasImage ? '1px 1px 0 rgba(0,0,0,0.35)' : undefined }}>{card.project.title}</div>
      <div>
        <div className="bk-n">{card.wordCount ?? 0}<span className="u">語</span></div>
        <div className="bk-foot" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.ownerUsername ? `@${card.ownerUsername}` : '共有ユーザー'}
        </div>
      </div>
    </Link>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-6 text-center text-[12px] font-bold text-[var(--color-muted)]">
      {message}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-[var(--color-muted)]">
      <Icon name="progress_activity" className="animate-spin" size={22} />
      <span className="ml-2 text-sm font-bold">読み込み中...</span>
    </div>
  );
}

function CenteredCard({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-[18px] py-20">
      <div className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-6 text-center">
        <Icon name={icon} size={30} className="mx-auto text-[var(--color-muted)]" />
        <div className="mt-3 font-display text-lg font-bold text-[var(--solid-ink)]">{title}</div>
        {children}
      </div>
    </div>
  );
}
