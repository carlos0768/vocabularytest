'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DesktopButton } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { getSeededGroupSummary, loadGroupOverview } from '@/lib/shared-projects/group-overview-cache';
import type {
  SharedProjectCard,
  StudyGroupLeaderboardEntry,
  StudyGroupMissedWord,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import { ProfileTapTarget, memberInitial, memberLabel, profileHref, thumbColor } from './member-ui';

// シェアシートはブランドSVG込みで重いので、開くまでロードしない。
const GroupInviteShareSheet = dynamic(
  () => import('./invite-share-sheet').then((mod) => mod.GroupInviteShareSheet),
  { ssr: false },
);

// Duolingo-style podium medal colors for the top three.
const MEDALS = ['#FFC800', '#C3CDD6', '#E29C57'];

export default function GroupPage() {
  const router = useRouter();
  // ページ上端ではヘッダの下線を出さない（スクロールで表示）
  const pageScrolled = usePageScrolled();
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

  // authLoading を待たずに即フェッチする（サーバー側はCookieで認証。
  // 旧実装は use-auth の解決待ちで最大5秒、初回描画がブロックされていた）。
  // 未ログイン時はフェッチが失敗し、auth解決後にログインカードが出る。
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

  const settingsHref = `/groups/${encodeURIComponent(groupId)}/settings`;

  // シード済みサマリーがある間は loading 中でも全画面スピナーにしない
  //（ヘッダーだけ先に出し、セクション部分にスピナーを出す）。
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
      <button type="button" onClick={() => void load()} className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-5 py-3 font-display text-sm font-bold text-[var(--solid-ink)]">
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
            <>
              {loading ? (
                <LoadingState />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(320px, 1fr)', gap: 20, alignItems: 'start' }}>
                  <GroupWordbooksSection groupId={groupId} projects={projects} />
                  <div className="flex flex-col gap-5">
                    <LeaderboardSection leaderboard={leaderboard} />
                    <MissedWordsSection
                      groupId={groupId}
                      missedWords={missedWords}
                      totalCount={missedWordsTotalCount}
                    />
                  </div>
                </div>
              )}
            </>
          ))}
        </div>
      </div>

      {/* Mobile */}
      <div
        className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] font-[var(--font-body)] lg:hidden"
        style={{
          // The <body> already pads by env(safe-area-inset-top) (globals.css), so
          // the header sits just below the notch with no extra gap. Adding more
          // padding here would double-count the inset and leave a dead band.
          paddingTop: 0,
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* スクロールしても上部に固定されるヘッダー。top はノッチ下端に合わせ、
            ノッチ帯は全体共通の StatusBarCover がすりガラスで覆う。
            下線はコンテンツがヘッダの下に潜り込んだとき（スクロール中）だけ出す。 */}
        <header
          className={`sticky z-40 flex items-center gap-2.5 border-b-2 bg-[var(--color-background)]/95 px-[14px] py-2.5 backdrop-blur-md ${pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'}`}
          style={{ top: 'env(safe-area-inset-top, 0px)' }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="戻る"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="arrow_back" size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              STUDY GROUP
            </div>
            <div className="truncate font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
              {group?.name ?? 'グループ'}
            </div>
          </div>
          {group && (
            <Link
              href={settingsHref}
              aria-label="グループ設定"
              onClick={() => triggerHaptic()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="settings" size={16} />
            </Link>
          )}
        </header>
        {stateView ?? (group && (
          <div className="flex flex-col gap-4 px-[14px] pt-3">
            <GroupHeader
              group={group}
              totalQuiz={totalQuiz}
              onCopyInvite={() => void copyInvite()}
              onShare={() => { triggerHaptic(); setInviteShareOpen(true); }}
            />
            {loading ? (
              <LoadingState />
            ) : (
              <>
                <BookshelfSection groupId={groupId} projects={projects} />
                <LeaderboardSection leaderboard={leaderboard} />
                <MissedWordsSection
                  groupId={groupId}
                  missedWords={missedWords}
                  totalCount={missedWordsTotalCount}
                />
              </>
            )}
          </div>
        ))}
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


function GroupHeader({
  group,
  totalQuiz,
  onCopyInvite,
  onShare,
}: {
  group: StudyGroupSummary;
  totalQuiz: number;
  onCopyInvite: () => void;
  onShare: () => void;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[18px] border-2 border-[var(--solid-ink)] p-4 text-white"
      style={{ background: `linear-gradient(135deg, ${thumbColor(group.id)} 0%, var(--solid-ink) 160%)` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border-2 border-white/70 bg-white/15 font-display text-[26px] font-extrabold backdrop-blur-sm"
        >
          {group.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
            {group.visibility === 'public' ? '公開グループ' : 'プライベートグループ'}
          </div>
          <h1 className="mt-0.5 truncate font-display text-[22px] font-extrabold leading-tight">{group.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold text-white/85">
            <span className="inline-flex items-center gap-1"><Icon name="group" size={13} />{group.memberCount}人</span>
            <span className="inline-flex items-center gap-1"><Icon name="menu_book" size={13} />{group.projectCount}冊</span>
            <span className="inline-flex items-center gap-1"><Icon name="bolt" size={13} />{totalQuiz}問</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <button
          type="button"
          onClick={onCopyInvite}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[12px] border-2 border-white/40 bg-white/15 px-3 py-2 text-left backdrop-blur-sm transition-all duration-100 active:translate-y-px"
        >
          <div className="min-w-0">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white/70">招待コード</div>
            <div className="truncate font-mono text-[14px] font-extrabold">{group.inviteCode}</div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-white/20 px-2 py-1 text-[11px] font-bold">
            <Icon name="content_copy" size={13} />コピー
          </span>
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="グループをシェア"
          className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] border-2 border-white bg-white px-4 py-2 font-display text-[11px] font-extrabold text-[var(--solid-ink)] shadow-[3px_3px_0_rgba(0,0,0,0.25)] transition-all duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <Icon name="ios_share" size={20} />
          シェア
        </button>
      </div>
    </section>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  accent = 'var(--color-accent)',
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-white p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] text-white"
          style={{ backgroundColor: accent }}
        >
          <Icon name={icon} size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">{title}</h2>
          {subtitle && <div className="text-[11px] font-bold text-[var(--color-muted)]">{subtitle}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

function LeaderboardSection({ leaderboard }: { leaderboard: StudyGroupLeaderboardEntry[] }) {
  const [showAll, setShowAll] = useState(false);

  if (leaderboard.length === 0) {
    return (
      <SectionCard icon="emoji_events" title="今週のランキング" subtitle="毎週月曜0時にリセット" accent="#FFC800">
        <EmptyRow message="まだランキングがありません" />
      </SectionCard>
    );
  }

  const podium = leaderboard.slice(0, 3);
  const restAll = leaderboard.slice(3);
  const maxVisible = 2; // ranks 4–5
  const visibleRest = showAll ? restAll : restAll.slice(0, maxVisible);
  const hiddenCount = restAll.length - maxVisible;
  const hiddenTotal = restAll.slice(maxVisible).reduce((s, e) => s + e.quizCount, 0);

  return (
    <SectionCard icon="emoji_events" title="今週のランキング" subtitle="毎週月曜0時にリセット" accent="#FFC800">
      <div className="mb-2 flex items-end justify-center gap-2">
        {podium[1] && <PodiumColumn entry={podium[1]} place={2} />}
        {podium[0] && <PodiumColumn entry={podium[0]} place={1} />}
        {podium[2] && <PodiumColumn entry={podium[2]} place={3} />}
      </div>

      {visibleRest.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {visibleRest.map((entry, index) => (
            <LeaderboardRow key={entry.userId} entry={entry} rank={index + 4} />
          ))}
          {!showAll && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-2 text-left"
            >
              <span className="w-5 shrink-0 text-center font-mono text-[13px] font-extrabold tabular-nums text-[var(--color-muted)]">…</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-extrabold text-[var(--color-muted)]">その他 {hiddenCount}人</div>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono text-[14px] font-extrabold tabular-nums text-[var(--color-muted)]">{hiddenTotal}</span>
                <span className="ml-0.5 text-[10px] font-bold text-[var(--color-muted)]">問</span>
              </div>
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function PodiumColumn({ entry, place }: { entry: StudyGroupLeaderboardEntry; place: number }) {
  const medal = MEDALS[place - 1];
  const size = place === 1 ? 'text-[26px]' : 'text-[20px]';
  const dimension = place === 1 ? { width: 64, height: 64 } : { width: 52, height: 52 };
  return (
    <ProfileTapTarget
      href={profileHref(entry)}
      label={memberLabel(entry)}
      className={`flex flex-1 flex-col items-center transition-transform duration-100 active:scale-95 ${place === 1 ? '-mt-2' : 'mt-2'}`}
    >
      <div className="relative">
        <div
          className={`flex items-center justify-center rounded-full border-2 border-[var(--solid-ink)] font-display font-extrabold text-white ${size}`}
          style={{ backgroundColor: thumbColor(entry.userId), ...dimension }}
        >
          {memberInitial(entry)}
        </div>
        <span
          className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] font-display text-[12px] font-extrabold text-[var(--solid-ink)]"
          style={{ backgroundColor: medal }}
        >
          {place}
        </span>
      </div>
      <div className={`mt-2 max-w-full truncate text-center text-[11px] font-extrabold ${entry.isViewer ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'}`}>
        {memberLabel(entry)}
      </div>
      <div className="font-mono text-[12px] font-extrabold tabular-nums text-[var(--solid-ink)]">{entry.quizCount}</div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-wide text-[var(--color-muted)]">問</div>
    </ProfileTapTarget>
  );
}

function LeaderboardRow({ entry, rank }: { entry: StudyGroupLeaderboardEntry; rank: number }) {
  return (
    <ProfileTapTarget
      href={profileHref(entry)}
      label={memberLabel(entry)}
      className={`flex items-center gap-3 rounded-[12px] border-2 px-3 py-2 transition-all duration-100 active:translate-x-px active:translate-y-px ${entry.isViewer ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-border)] bg-white'}`}
    >
      <span className="w-5 shrink-0 text-center font-mono text-[13px] font-extrabold tabular-nums text-[var(--color-muted)]">{rank}</span>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] font-display text-[14px] font-extrabold text-white"
        style={{ backgroundColor: thumbColor(entry.userId) }}
      >
        {memberInitial(entry)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-extrabold text-[var(--solid-ink)]">{memberLabel(entry)}</div>
        {entry.masteredCount > 0 && (
          <div className="text-[10px] font-bold text-[var(--color-muted)]">マスター {entry.masteredCount}語</div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="font-mono text-[14px] font-extrabold tabular-nums text-[var(--solid-ink)]">{entry.quizCount}</span>
        <span className="ml-0.5 text-[10px] font-bold text-[var(--color-muted)]">問</span>
      </div>
    </ProfileTapTarget>
  );
}

function MissedWordsSection({
  groupId,
  missedWords,
  totalCount,
}: {
  groupId: string;
  missedWords: StudyGroupMissedWord[];
  totalCount: number;
}) {
  const max = missedWords[0]?.missCount ?? 1;
  const hasMore = totalCount > missedWords.length;
  return (
    <SectionCard icon="local_fire_department" title="みんなが苦戦中" subtitle="2人以上が間違えた単語・上位5件" accent="#CC4D59">
      {missedWords.length === 0 ? (
        <EmptyRow message="2人以上が間違えた単語がまだありません" />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {missedWords.map((word, index) => (
              <div key={word.englishKey} className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-2">
                <span className="w-5 shrink-0 text-center font-mono text-[13px] font-extrabold tabular-nums text-[#CC4D59]">{index + 1}</span>
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
          </div>
          {hasMore && (
            <Link
              href={`/groups/${encodeURIComponent(groupId)}/struggling`}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-4 py-2.5 font-display text-[13px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              もっと見る
              <Icon name="chevron_right" size={16} />
            </Link>
          )}
        </>
      )}
    </SectionCard>
  );
}

// デスクトップ用: 本棚ティザーに格納せず、グループの単語帳をそのまま
// グリッドで表示する。共有・解除の管理は従来どおり本棚ページで行う。
function GroupWordbooksSection({ groupId, projects }: { groupId: string; projects: SharedProjectCard[] }) {
  return (
    <section className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-white p-4">
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
          className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-white px-3 py-1.5 font-display text-[12px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
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
      className="block overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-white transition-all duration-100 hover:-translate-y-0.5 active:translate-y-0"
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
        <span className="absolute bottom-1.5 right-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-2 py-0.5 font-mono text-[10px] font-extrabold tabular-nums text-[var(--solid-ink)]">
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

// Bookshelf teaser: sits right below the header so members immediately see the
// group's shared wordbooks. Renders the newest books as colorful spines on a
// shelf; tapping anywhere opens the full bookshelf page.
function BookshelfSection({ groupId, projects }: { groupId: string; projects: SharedProjectCard[] }) {
  const spines = projects.slice(0, 5);
  const overflow = projects.length - spines.length;
  // Deterministic per-slot variation so the shelf looks hand-arranged.
  const heights = [72, 62, 78, 58, 68];
  const tilts = [0, -4, 0, 5, 0];

  return (
    <Link
      href={`/groups/${encodeURIComponent(groupId)}/bookshelf`}
      onClick={() => triggerHaptic()}
      aria-label="本棚をひらく"
      className="relative block overflow-hidden rounded-[18px] border-2 border-[var(--solid-ink)] p-4"
      style={{ background: 'linear-gradient(150deg, #FFF6DE 0%, #FFE7BC 100%)' }}
    >
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[#F5A623] text-white">
          <Icon name="auto_stories" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">本棚</h2>
          <div className="text-[11px] font-bold text-[var(--color-muted)]">
            {projects.length > 0 ? `みんなの単語帳 ${projects.length}冊` : 'みんなの単語帳が並ぶ場所'}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-white px-3 py-1.5 font-display text-[12px] font-extrabold text-[var(--solid-ink)]">
          ひらく
          <Icon name="chevron_right" size={14} />
        </span>
      </div>

      <div className="mt-3">
        {spines.length === 0 ? (
          <div className="flex items-end justify-center gap-1.5 px-2">
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="w-[34px] rounded-t-[6px] rounded-b-[2px] border-2 border-dashed border-[rgba(26,26,26,0.35)] bg-white/40"
                style={{ height: heights[slot] }}
              />
            ))}
            <div className="ml-2 self-center text-[12px] font-extrabold text-[var(--solid-ink)]">
              まだ空っぽ。最初の1冊を置こう！
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 px-2">
            {spines.map((card, index) => (
              <div
                key={card.project.id}
                className="flex items-start justify-center overflow-hidden rounded-t-[6px] rounded-b-[2px] border-2 border-[var(--solid-ink)] pt-1.5 shadow-[2px_0_0_rgba(26,26,26,0.18)]"
                style={{
                  backgroundColor: thumbColor(card.project.id),
                  width: 34,
                  height: heights[index],
                  transform: tilts[index] ? `rotate(${tilts[index]}deg)` : undefined,
                  transformOrigin: 'bottom center',
                }}
              >
                <span
                  className="max-h-full overflow-hidden font-display text-[10px] font-extrabold leading-none text-white"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  {card.project.title.slice(0, 6)}
                </span>
              </div>
            ))}
            {overflow > 0 && (
              <div className="flex h-[56px] w-[34px] items-center justify-center rounded-t-[6px] rounded-b-[2px] border-2 border-[var(--solid-ink)] bg-white font-display text-[11px] font-extrabold text-[var(--solid-ink)]">
                +{overflow}
              </div>
            )}
          </div>
        )}
        <div className="mt-0 h-2.5 rounded-[3px] border-2 border-[var(--solid-ink)] bg-[#C08A52]" />
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
    <div className="flex items-center justify-center py-24 text-[var(--color-muted)]">
      <Icon name="progress_activity" className="animate-spin" size={22} />
      <span className="ml-2 text-sm font-bold">読み込み中...</span>
    </div>
  );
}

function CenteredCard({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-[18px] py-20">
      <div className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-6 text-center">
        <Icon name={icon} size={30} className="mx-auto text-[var(--color-muted)]" />
        <div className="mt-3 font-display text-lg font-bold text-[var(--solid-ink)]">{title}</div>
        {children}
      </div>
    </div>
  );
}
