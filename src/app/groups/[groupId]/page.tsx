'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { remoteRepository } from '@/lib/db/remote-repository';
import {
  buildGroupShareMessages,
  buildGroupShareUrl,
  buildLineShareUrl,
  buildXIntentUrl,
} from '@/lib/shared-projects/group-share';
import type { Project } from '@/types';
import type {
  SharedProjectCard,
  StudyGroupLeaderboardEntry,
  StudyGroupMissedWord,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import { ProfileTapTarget, memberInitial, memberLabel, profileHref, thumbColor } from './member-ui';

type OverviewResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  projects?: SharedProjectCard[];
  leaderboard?: StudyGroupLeaderboardEntry[];
  missedWords?: StudyGroupMissedWord[];
  viewerUserId?: string;
  error?: string;
};

// Duolingo-style podium medal colors for the top three.
const MEDALS = ['#FFC800', '#C3CDD6', '#E29C57'];

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const { user, isPro, loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [leaderboard, setLeaderboard] = useState<StudyGroupLeaderboardEntry[]>([]);
  const [missedWords, setMissedWords] = useState<StudyGroupMissedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [inviteShareOpen, setInviteShareOpen] = useState(false);
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as OverviewResponse | null;
      if (!response.ok || !payload?.success || !payload.group) {
        throw new Error(payload?.error || 'group_overview_failed');
      }
      setGroup(payload.group);
      setProjects(payload.projects ?? []);
      setLeaderboard(payload.leaderboard ?? []);
      setMissedWords(payload.missedWords ?? []);
    } catch (loadError) {
      console.warn('Failed to load group overview:', loadError);
      setError('グループ情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load]);

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

  const handleRemoveProject = useCallback(async (project: SharedProjectCard) => {
    if (!groupId || removingProjectId) return;
    triggerHaptic();
    setRemovingProjectId(project.project.id);
    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(groupId)}/projects/${encodeURIComponent(project.project.id)}`,
        { method: 'DELETE' },
      );
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'remove_group_project_failed');
      }

      setProjects((current) => current.filter((card) => card.project.id !== project.project.id));
      setGroup((current) => current ? {
        ...current,
        projectCount: Math.max(0, current.projectCount - 1),
      } : current);
      showToast({ message: 'グループ共有を解除しました', type: 'success' });
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'グループ共有の解除に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setRemovingProjectId(null);
    }
  }, [groupId, removingProjectId, showToast]);

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] font-[var(--font-body)]"
      style={{
        // The <body> already pads by env(safe-area-inset-top) (globals.css), so
        // the header sits just below the notch with no extra gap. Adding more
        // padding here would double-count the inset and leave a dead band.
        paddingTop: 0,
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      {authLoading || loading ? (
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
      ) : (
        <div className="flex flex-col gap-4 px-[14px]">
          <GroupHeader
            group={group}
            totalQuiz={totalQuiz}
            onCopyInvite={() => void copyInvite()}
            onShare={() => { triggerHaptic(); setInviteShareOpen(true); }}
            settingsHref={`/groups/${encodeURIComponent(groupId)}/settings`}
          />
          <LeaderboardSection leaderboard={leaderboard} />
          <MissedWordsSection missedWords={missedWords} />
          <WordbooksSection
            projects={projects}
            removingProjectId={removingProjectId}
            onShare={() => { triggerHaptic(); setShareSheetOpen(true); }}
            onRemove={(project) => void handleRemoveProject(project)}
          />
        </div>
      )}

      <ShareToGroupSheet
        open={shareSheetOpen}
        groupId={groupId}
        groupName={group?.name ?? ''}
        userId={user?.id ?? null}
        isPro={isPro}
        sharedProjectIds={projects.map((card) => card.project.id)}
        onClose={() => setShareSheetOpen(false)}
        onShared={() => { setShareSheetOpen(false); void load(); }}
      />

      {group && (
        <GroupInviteShareSheet
          open={inviteShareOpen}
          group={group}
          onClose={() => setInviteShareOpen(false)}
        />
      )}
    </div>
  );
}

function GroupHeader({
  group,
  totalQuiz,
  onCopyInvite,
  onShare,
  settingsHref,
}: {
  group: StudyGroupSummary;
  totalQuiz: number;
  onCopyInvite: () => void;
  onShare: () => void;
  settingsHref: string;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[18px] border-2 border-[var(--solid-ink)] p-4 text-white"
      style={{ background: `linear-gradient(135deg, ${thumbColor(group.id)} 0%, var(--solid-ink) 160%)` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/shared"
          aria-label="共有に戻る"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white/50 bg-white/15 text-white backdrop-blur-sm transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="arrow_back" size={16} />
        </Link>
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-white/70">
          STUDY GROUP
        </div>
        <Link
          href={settingsHref}
          aria-label="グループ設定"
          onClick={() => triggerHaptic()}
          className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white/50 bg-white/15 text-white backdrop-blur-sm transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="settings" size={16} />
        </Link>
      </div>

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
  if (leaderboard.length === 0) {
    return (
      <SectionCard icon="emoji_events" title="ランキング" subtitle="解いたクイズ数で競おう" accent="#FFC800">
        <EmptyRow message="まだランキングがありません" />
      </SectionCard>
    );
  }

  const podium = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <SectionCard icon="emoji_events" title="ランキング" subtitle="解いたクイズ数で競おう" accent="#FFC800">
      <div className="mb-2 flex items-end justify-center gap-2">
        {podium[1] && <PodiumColumn entry={podium[1]} place={2} />}
        {podium[0] && <PodiumColumn entry={podium[0]} place={1} />}
        {podium[2] && <PodiumColumn entry={podium[2]} place={3} />}
      </div>

      {rest.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {rest.map((entry, index) => (
            <LeaderboardRow key={entry.userId} entry={entry} rank={index + 4} />
          ))}
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

function MissedWordsSection({ missedWords }: { missedWords: StudyGroupMissedWord[] }) {
  const max = missedWords[0]?.missCount ?? 1;
  return (
    <SectionCard icon="local_fire_department" title="みんなが苦戦中" subtitle="グループでよく間違える単語" accent="#CC4D59">
      {missedWords.length === 0 ? (
        <EmptyRow message="まだデータがありません。クイズを解くと集計されます" />
      ) : (
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
      )}
    </SectionCard>
  );
}

function WordbooksSection({
  projects,
  removingProjectId,
  onShare,
  onRemove,
}: {
  projects: SharedProjectCard[];
  removingProjectId: string | null;
  onShare: () => void;
  onRemove: (project: SharedProjectCard) => void;
}) {
  return (
    <SectionCard icon="menu_book" title="共有単語帳" subtitle={`${projects.length}冊の単語帳`} accent="#137FEC">
      {projects.length === 0 ? (
        <EmptyRow message="まだ単語帳が共有されていません。最初の1冊を共有しよう！" />
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((card) => {
            const href = card.project.shareId ? `/share/${card.project.shareId}` : '#';
            const canRemove = Boolean(card.canRemoveFromGroup);
            const removing = removingProjectId === card.project.id;
            return (
              <div key={card.project.id} className="flex items-center gap-2 rounded-[12px] border-2 border-[var(--color-border)] bg-white p-2.5">
                <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[18px] font-extrabold text-white"
                    style={{
                      backgroundColor: thumbColor(card.project.id),
                      backgroundImage: card.project.iconImage ? `url(${card.project.iconImage})` : undefined,
                    }}
                  >
                    {!card.project.iconImage && card.project.title.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[14px] font-bold text-[var(--solid-ink)]">{card.project.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
                      <span className="truncate">{card.ownerUsername ? `@${card.ownerUsername}` : '共有ユーザー'}</span>
                      <span className="opacity-50">·</span>
                      <span className="font-mono tabular-nums">{card.wordCount ?? 0} 語</span>
                    </div>
                  </div>
                </Link>
                {canRemove ? (
                  <button
                    type="button"
                    aria-label={`「${card.project.title}」のグループ共有を解除`}
                    disabled={removingProjectId !== null}
                    onClick={() => onRemove(card)}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-white px-2 text-[11px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
                  >
                    <Icon name={removing ? 'progress_activity' : 'remove_circle'} size={15} className={removing ? 'animate-spin' : undefined} />
                    共有解除
                  </button>
                ) : (
                  <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onShare}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 font-display text-[14px] font-extrabold text-white shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        <Icon name="library_add" size={18} />
        単語帳を共有
      </button>
    </SectionCard>
  );
}

function ShareToGroupSheet({
  open,
  groupId,
  groupName,
  userId,
  isPro,
  sharedProjectIds,
  onClose,
  onShared,
}: {
  open: boolean;
  groupId: string;
  groupName: string;
  userId: string | null;
  isPro: boolean;
  sharedProjectIds: string[];
  onClose: () => void;
  onShared: () => void;
}) {
  const { showToast } = useToast();
  const [ownProjects, setOwnProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sharedSet = useMemo(() => new Set(sharedProjectIds), [sharedProjectIds]);

  useEffect(() => {
    if (!open || !userId || !isPro) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    remoteRepository.getProjects(userId)
      .then((projects) => {
        if (!cancelled) setOwnProjects(projects);
      })
      .catch((error) => {
        console.warn('Failed to load own projects for group share:', error);
        if (!cancelled) setLoadError('単語帳を読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId, isPro]);

  if (!open) return null;

  const handleShare = async (project: Project) => {
    if (savingId) return;
    triggerHaptic();
    setSavingId(project.id);
    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(groupId)}/projects/${encodeURIComponent(project.id)}`,
        { method: 'POST' },
      );
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; code?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'share_to_group_failed');
      }
      showToast({ message: `「${project.title}」を共有しました`, type: 'success' });
      onShared();
    } catch (error) {
      const message = error instanceof Error ? error.message : '共有に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 cursor-default" style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 520,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(82vh, 680px)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">SHARE TO GROUP</div>
              <div className="mt-0.5 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">{groupName}に共有</div>
            </div>
            <button type="button" onClick={onClose} aria-label="閉じる" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]">
              <Icon name="close" size={14} />
            </button>
          </div>

          {!userId ? (
            <SheetNote icon="login" message="ログインが必要です。" />
          ) : !isPro ? (
            <div className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white p-4 text-center">
              <Icon name="auto_awesome" size={28} className="text-[var(--solid-ink)]" />
              <div className="mt-2 text-[13px] font-bold text-[var(--solid-ink)]">グループへの単語帳共有はPro限定です。</div>
              <Link href="/subscription" className="mt-3 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 text-[12px] font-extrabold text-white">Proを見る</Link>
            </div>
          ) : loading ? (
            <SheetNote icon="progress_activity" spin message="単語帳を読み込み中..." />
          ) : loadError ? (
            <SheetNote icon="error" message={loadError} />
          ) : ownProjects.length === 0 ? (
            <SheetNote icon="menu_book" message="共有できる単語帳がありません。" />
          ) : (
            <div className="flex flex-col gap-2">
              {ownProjects.map((project) => {
                const alreadyShared = sharedSet.has(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    disabled={alreadyShared || Boolean(savingId)}
                    onClick={() => void handleShare(project)}
                    className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-55"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
                      style={{ backgroundColor: thumbColor(project.id) }}
                    >
                      {project.title.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold text-[var(--solid-ink)]">{project.title}</span>
                    {alreadyShared ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-accent)]"><Icon name="check_circle" size={15} />共有済み</span>
                    ) : (
                      <Icon name={savingId === project.id ? 'progress_activity' : 'add_circle'} size={20} className={`shrink-0 text-[var(--solid-ink)] ${savingId === project.id ? 'animate-spin' : ''}`} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupInviteShareSheet({
  open,
  group,
  onClose,
}: {
  open: boolean;
  group: StudyGroupSummary;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.merken.jp';
    return buildGroupShareUrl(origin, group.id);
  }, [group.id]);

  const messages = useMemo(
    () => buildGroupShareMessages({ name: group.name }, shareUrl),
    [group.name, shareUrl],
  );

  if (!open) return null;

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ message, type: 'success' });
    } catch {
      showToast({ message: 'コピーに失敗しました', type: 'error' });
    }
  };

  const openIntent = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = async () => {
    triggerHaptic();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: group.name, text: messages.native, url: shareUrl });
        return;
      } catch (error) {
        const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
        if (name === 'AbortError') return;
      }
    }
    await copy(`${messages.native}\n${shareUrl}`, 'シェア文をコピーしました');
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 cursor-default" style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 520,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(82vh, 680px)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">SHARE GROUP</div>
              <div className="mt-0.5 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">{group.name}を友達に広めよう</div>
            </div>
            <button type="button" onClick={onClose} aria-label="閉じる" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]">
              <Icon name="close" size={14} />
            </button>
          </div>

          <p className="mb-3 text-[12px] font-bold leading-relaxed text-[var(--color-muted)]">
            リンクをシェアすると、グループ名とテーマカラーのサムネが表示されます。タップした友達はそのまま参加できます。
          </p>

          {/* Native share — primary CTA, reaches every installed app incl. Instagram. */}
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 font-display text-[14px] font-extrabold text-white shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            <Icon name="ios_share" size={18} />
            シェアする
          </button>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <ShareChannelButton
              label="X"
              bg="#000000"
              onClick={() => { triggerHaptic(); openIntent(buildXIntentUrl(shareUrl, messages.x)); }}
              icon={<XBrandIcon />}
            />
            <ShareChannelButton
              label="LINE"
              bg="#06C755"
              onClick={() => { triggerHaptic(); openIntent(buildLineShareUrl(shareUrl, messages.line)); }}
              icon={<LineBrandIcon />}
            />
            <ShareChannelButton
              label="Instagram"
              bg="linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)"
              onClick={() => { triggerHaptic(); void copy(messages.instagram, 'キャプションをコピーしました。Instagramに貼り付けてね'); }}
              icon={<InstagramBrandIcon />}
            />
            <ShareChannelButton
              label="Discord"
              bg="#5865F2"
              onClick={() => { triggerHaptic(); void copy(messages.discord, 'メッセージをコピーしました。Discordに貼り付けてね'); }}
              icon={<DiscordBrandIcon />}
            />
          </div>

          {/* Copy link */}
          <button
            type="button"
            onClick={() => { triggerHaptic(); void copy(shareUrl, '共有リンクをコピーしました'); }}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-bold text-[var(--color-muted)]">{shareUrl}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-[var(--solid-ink)] px-2.5 py-1.5 text-[11px] font-extrabold text-white">
              <Icon name="content_copy" size={13} />リンク
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareChannelButton({
  label,
  bg,
  icon,
  onClick,
}: {
  label: string;
  bg: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-1 py-2.5 transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] text-white"
        style={{ background: bg }}
      >
        {icon}
      </span>
      <span className="truncate text-[10px] font-extrabold text-[var(--solid-ink)]">{label}</span>
    </button>
  );
}

function XBrandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function LineBrandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 5.69 2 10.243c0 4.08 3.548 7.496 8.34 8.143.325.07.767.214.879.492.1.252.066.647.032.902l-.142.853c-.043.252-.2.987.864.538 1.064-.449 5.74-3.38 7.832-5.788C21.36 13.715 22 12.06 22 10.243 22 5.69 17.523 2 12 2ZM8.07 12.79H6.083a.526.526 0 0 1-.526-.525V8.287a.526.526 0 0 1 1.052 0v3.452H8.07a.526.526 0 0 1 0 1.051Zm2.06-.525a.526.526 0 0 1-1.052 0V8.287a.526.526 0 0 1 1.052 0v3.978Zm4.793 0a.526.526 0 0 1-.36.498.53.53 0 0 1-.166.027.524.524 0 0 1-.425-.21l-2.037-2.773v2.458a.526.526 0 0 1-1.052 0V8.287a.525.525 0 0 1 .948-.31l2.037 2.774V8.287a.526.526 0 0 1 1.052 0v3.978Zm3.218-2.515a.526.526 0 0 1 0 1.052h-1.46v.937h1.46a.526.526 0 0 1 0 1.051h-1.986a.527.527 0 0 1-.526-.525V8.287a.526.526 0 0 1 .526-.525h1.986a.526.526 0 0 1 0 1.051h-1.46v.937h1.46Z" />
    </svg>
  );
}

function InstagramBrandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.94c-3.15 0-3.52.01-4.76.07-1.15.05-1.77.24-2.19.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.42-.35 1.04-.4 2.19-.06 1.24-.07 1.61-.07 4.76s.01 3.52.07 4.76c.05 1.15.24 1.77.4 2.19.22.55.47.94.88 1.35.41.41.8.66 1.35.88.42.16 1.04.35 2.19.4 1.24.06 1.61.07 4.76.07s3.52-.01 4.76-.07c1.15-.05 1.77-.24 2.19-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.42.35-1.04.4-2.19.06-1.24.07-1.61.07-4.76s-.01-3.52-.07-4.76c-.05-1.15-.24-1.77-.4-2.19a3.64 3.64 0 0 0-.88-1.35 3.64 3.64 0 0 0-1.35-.88c-.42-.16-1.04-.35-2.19-.4-1.24-.06-1.61-.07-4.76-.07Zm0 3.3a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Zm0 7.59a2.99 2.99 0 1 0 0-5.98 2.99 2.99 0 0 0 0 5.98Zm5.86-7.81a1.08 1.08 0 1 1-2.15 0 1.08 1.08 0 0 1 2.15 0Z" />
    </svg>
  );
}

function DiscordBrandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.27 5.33A16.6 16.6 0 0 0 15.16 4c-.18.32-.39.75-.53 1.09a15.4 15.4 0 0 0-4.27 0C10.22 4.75 10 4.32 9.83 4a16.5 16.5 0 0 0-4.11 1.33C2.93 9.4 2.18 13.37 2.55 17.28a16.7 16.7 0 0 0 5.04 2.56c.41-.55.77-1.14 1.08-1.76-.59-.22-1.15-.49-1.69-.81.14-.1.28-.21.41-.32a11.9 11.9 0 0 0 10.22 0c.13.11.27.22.41.32-.54.32-1.1.59-1.69.81.31.62.67 1.21 1.08 1.76a16.6 16.6 0 0 0 5.04-2.56c.43-4.53-.73-8.46-3.18-11.95ZM9.68 14.87c-.99 0-1.8-.91-1.8-2.02 0-1.12.79-2.03 1.8-2.03 1.01 0 1.82.91 1.8 2.03 0 1.11-.8 2.02-1.8 2.02Zm6.64 0c-.99 0-1.8-.91-1.8-2.02 0-1.12.79-2.03 1.8-2.03 1.01 0 1.82.91 1.8 2.03 0 1.11-.79 2.02-1.8 2.02Z" />
    </svg>
  );
}

function SheetNote({ icon, message, spin = false }: { icon: string; message: string; spin?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-3 text-[12px] font-bold text-[var(--color-muted)]">
      <Icon name={icon} size={15} className={spin ? 'animate-spin' : undefined} />
      {message}
    </div>
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
