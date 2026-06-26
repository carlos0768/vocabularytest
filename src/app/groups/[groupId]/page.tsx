'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import type {
  SharedProjectCard,
  StudyGroupLeaderboardEntry,
  StudyGroupMissedWord,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';

type OverviewResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  projects?: SharedProjectCard[];
  leaderboard?: StudyGroupLeaderboardEntry[];
  missedWords?: StudyGroupMissedWord[];
  viewerUserId?: string;
  error?: string;
};

// Site-wide avatar palette (matches home, shared, feed).
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

// Duolingo-style podium medal colors for the top three.
const MEDALS = ['#FFC800', '#C3CDD6', '#E29C57'];

function memberLabel(entry: StudyGroupLeaderboardEntry): string {
  return entry.username?.trim() || (entry.accountId ? `@${entry.accountId}` : 'ユーザー');
}

function memberInitial(entry: StudyGroupLeaderboardEntry): string {
  return (entry.username?.trim() || entry.accountId || 'U').charAt(0).toUpperCase();
}

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [leaderboard, setLeaderboard] = useState<StudyGroupLeaderboardEntry[]>([]);
  const [missedWords, setMissedWords] = useState<StudyGroupMissedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] pb-[120px] pt-3 font-[var(--font-body)]">
      <div className="flex items-center gap-2 px-[18px] pb-1 pt-1">
        <Link
          href="/shared"
          aria-label="共有に戻る"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="arrow_back" size={16} />
        </Link>
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          STUDY GROUP
        </div>
      </div>

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
          <GroupHeader group={group} totalQuiz={totalQuiz} onCopyInvite={() => void copyInvite()} />
          <LeaderboardSection leaderboard={leaderboard} />
          <MissedWordsSection missedWords={missedWords} />
          <WordbooksSection projects={projects} />
        </div>
      )}
    </div>
  );
}

function GroupHeader({
  group,
  totalQuiz,
  onCopyInvite,
}: {
  group: StudyGroupSummary;
  totalQuiz: number;
  onCopyInvite: () => void;
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

      <button
        type="button"
        onClick={onCopyInvite}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-[12px] border-2 border-white/40 bg-white/15 px-3 py-2 text-left backdrop-blur-sm transition-all duration-100 active:translate-y-px"
      >
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white/70">招待コード</div>
          <div className="truncate font-mono text-[14px] font-extrabold">{group.inviteCode}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-[8px] bg-white/20 px-2 py-1 text-[11px] font-bold">
          <Icon name="content_copy" size={13} />コピー
        </span>
      </button>
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
    <div className={`flex flex-1 flex-col items-center ${place === 1 ? '-mt-2' : 'mt-2'}`}>
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
    </div>
  );
}

function LeaderboardRow({ entry, rank }: { entry: StudyGroupLeaderboardEntry; rank: number }) {
  return (
    <div className={`flex items-center gap-3 rounded-[12px] border-2 px-3 py-2 ${entry.isViewer ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-border)] bg-white'}`}>
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
    </div>
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

function WordbooksSection({ projects }: { projects: SharedProjectCard[] }) {
  return (
    <SectionCard icon="menu_book" title="共有単語帳" subtitle={`${projects.length}冊の単語帳`} accent="#137FEC">
      {projects.length === 0 ? (
        <EmptyRow message="まだ単語帳が共有されていません" />
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((card) => {
            const href = card.project.shareId ? `/share/${card.project.shareId}` : '#';
            return (
              <Link key={card.project.id} href={href} className="block">
                <div className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--color-border)] bg-white p-2.5 transition-all duration-100 active:translate-x-px active:translate-y-px">
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
                  <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
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
