'use client';

/**
 * グループのトップ（ハブ）。
 *
 * モバイルは LINE のトークルーム風: 固定ヘッダ（戻る / ルーム名 / メンバー
 * アイコン）＋ 2×2 の大きなタイル（ランキング・単語帳・対戦・単語一覧）だけ。
 * 各機能の中身はそれぞれの専用ページに置き、このページには積まない。
 *
 * デスクトップ（lg 以上）は従来どおり ds-top / ds-scroll の2カラム表示。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DesktopButton } from '@/components/desktop/DesktopChrome';
import { GroupHubTiles, buildGroupHubTiles } from '@/components/groups/GroupHubTiles';
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
        <div className="ds-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">共有ライブラリ / グループ</div>
            <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {group?.name ?? 'グループ'}
            </h1>
          </div>
          {group && (
            <>
              <button type="button" className="ds-btn" onClick={() => void copyInvite()} title="招待コードをコピー">
                <Icon name="content_copy" />
                <span className="mono">{group.inviteCode}</span>
              </button>
              <DesktopButton variant="dark" icon="ios_share" onClick={() => setInviteShareOpen(true)}>
                シェア
              </DesktopButton>
              <DesktopButton href={settingsHref} icon="settings" variant="ghost" title="グループ設定">{''}</DesktopButton>
            </>
          )}
        </div>
        <div className="ds-scroll">
          {stateView ?? (group && (
            loading ? (
              <LoadingState />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(320px, 1fr)', gap: 20, alignItems: 'start' }}>
                <GroupWordbooksSection groupId={groupId} projects={projects} />
                <div className="flex flex-col gap-5">
                  <DesktopSection icon="emoji_events" title="今週のランキング" accent="#FFC800" href={`${groupPath}/ranking`}>
                    <GroupLeaderboard leaderboard={leaderboard.slice(0, 5)} />
                  </DesktopSection>
                  <DesktopSection
                    icon="local_fire_department"
                    title="みんなが苦戦中"
                    accent="#CC4D59"
                    href={`${groupPath}/words?filter=struggling`}
                  >
                    <MissedWordList missedWords={missedWords} totalCount={missedWordsTotalCount} />
                  </DesktopSection>
                </div>
              </div>
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
                {/* 上部に今週の上位3人。誰が走っているかを開いた瞬間に見せる。
                    メンバーは全員0問でも並ぶので、空配列＝まだ読めていない状態。
                    その間は帯ごと出さない（一瞬「誰も解いていません」が出るため）*/}
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

/* ---------------- デスクトップ側（従来レイアウトを維持） ---------------- */

function DesktopSection({
  icon,
  title,
  accent,
  href,
  children,
}: {
  icon: string;
  title: string;
  accent: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] text-white"
          style={{ backgroundColor: accent }}
        >
          <Icon name={icon} size={18} />
        </span>
        <h2 className="min-w-0 flex-1 font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">
          {title}
        </h2>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-1.5 font-display text-[12px] font-extrabold text-[var(--solid-ink)]"
        >
          すべて見る
          <Icon name="chevron_right" size={14} />
        </Link>
      </div>
      {children}
    </section>
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

// デスクトップ用: グループの単語帳をそのままグリッドで表示する。
// 共有・解除の管理は従来どおり本棚ページで行う。
function GroupWordbooksSection({ groupId, projects }: { groupId: string; projects: SharedProjectCard[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[#F5A623] text-white">
          <Icon name="auto_stories" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">単語帳</h2>
          <div className="text-[11px] font-bold text-[var(--color-muted)]">
            {projects.length > 0 ? `みんなの単語帳 ${projects.length}冊` : 'みんなの単語帳が並ぶ場所'}
          </div>
        </div>
        <Link
          href={`/groups/${encodeURIComponent(groupId)}/bookshelf`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-1.5 font-display text-[12px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          共有・管理
          <Icon name="chevron_right" size={14} />
        </Link>
      </div>
      {projects.length === 0 ? (
        <EmptyRow message="まだ単語帳がありません。最初の1冊を共有しよう！" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
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
  return (
    <Link
      href={href}
      onClick={() => triggerHaptic()}
      className="block overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] transition-all duration-100 hover:-translate-y-0.5 active:translate-y-0"
    >
      <div
        className="relative flex h-[92px] items-center justify-center bg-cover bg-center"
        style={{
          backgroundColor: thumbColor(card.project.id),
          backgroundImage: card.project.iconImage ? `url(${card.project.iconImage})` : undefined,
        }}
      >
        {!card.project.iconImage && (
          <span className="font-display text-[30px] font-extrabold text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.25)]">
            {card.project.title.charAt(0)}
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] font-extrabold tabular-nums text-[var(--solid-ink)]">
          {card.wordCount ?? 0}語
        </span>
      </div>
      <div className="border-t-2 border-[var(--solid-ink)] p-2.5">
        <div className="line-clamp-2 font-display text-[13px] font-extrabold leading-snug text-[var(--solid-ink)]">
          {card.project.title}
        </div>
        <div className="mt-1 truncate text-[10px] font-bold text-[var(--color-muted)]">
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
