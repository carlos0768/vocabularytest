'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import type { PublicStudyGroupSummary, StudyGroupSummary } from '@/lib/shared-projects/types';

type PreviewResponse = {
  success?: boolean;
  group?: PublicStudyGroupSummary;
  error?: string;
};

type JoinResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  error?: string;
};

// Site-wide avatar palette (matches home, shared, group pages).
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

export default function GroupJoinPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [checking, setChecking] = useState(true);
  const [preview, setPreview] = useState<PublicStudyGroupSummary | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (authLoading || !groupId) return;
    if (!isAuthenticated) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      try {
        // If the viewer is already a member, skip the join step entirely.
        const overview = await fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}`, { cache: 'no-store' });
        if (overview.ok) {
          if (!cancelled) router.replace(`/groups/${groupId}`);
          return;
        }

        const response = await fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}/preview`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null) as PreviewResponse | null;
        if (!cancelled && response.ok && payload?.success && payload.group) {
          setPreview(payload.group);
        }
      } catch (error) {
        console.warn('Failed to load group preview:', error);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, groupId, router]);

  const handleJoin = useCallback(async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed || joining) return;
    triggerHaptic();
    setJoining(true);
    try {
      const response = await fetch('/api/shared-projects/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: trimmed }),
      });
      const payload = await response.json().catch(() => null) as JoinResponse | null;
      if (response.status === 404) {
        showToast({ message: '招待コードが見つかりません。', type: 'error' });
        return;
      }
      if (!response.ok || !payload?.success || !payload.group) {
        throw new Error(payload?.error || 'group_join_failed');
      }
      showToast({ message: `「${payload.group.name}」に参加しました`, type: 'success' });
      router.replace(`/groups/${payload.group.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'グループへの参加に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setJoining(false);
    }
  }, [inviteCode, joining, router, showToast]);

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] font-[var(--font-body)]"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center gap-2 px-[14px] pt-1">
        <Link
          href="/shared"
          aria-label="共有に戻る"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="arrow_back" size={16} />
        </Link>
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          JOIN GROUP
        </div>
      </div>

      {authLoading || checking ? (
        <div className="flex items-center justify-center py-24 text-[var(--color-muted)]">
          <Icon name="progress_activity" className="animate-spin" size={22} />
          <span className="ml-2 text-sm font-bold">読み込み中...</span>
        </div>
      ) : !isAuthenticated ? (
        <CenteredCard icon="lock" title="ログインが必要です">
          <Link
            href={`/login?redirect=/groups/${groupId}/join`}
            className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-3 font-display text-sm font-bold text-white"
          >
            ログイン
          </Link>
        </CenteredCard>
      ) : (
        <div className="flex flex-col gap-4 px-[14px] pt-4">
          <section
            className="relative overflow-hidden rounded-[18px] border-2 border-[var(--solid-ink)] p-4 text-white"
            style={{ background: `linear-gradient(135deg, ${thumbColor(preview?.id ?? groupId)} 0%, var(--solid-ink) 160%)` }}
          >
            <Icon name="groups" size={104} className="pointer-events-none absolute -right-4 -top-5 opacity-15" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border-2 border-white/70 bg-white/15 font-display text-[26px] font-extrabold backdrop-blur-sm">
                {(preview?.name ?? 'G').charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
                  公開グループ
                </div>
                <h1 className="mt-0.5 truncate font-display text-[22px] font-extrabold leading-tight">
                  {preview?.name ?? 'グループ'}
                </h1>
                {preview && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold text-white/85">
                    <span className="inline-flex items-center gap-1"><Icon name="group" size={13} />{preview.memberCount}人</span>
                    <span className="inline-flex items-center gap-1"><Icon name="menu_book" size={13} />{preview.projectCount}冊</span>
                    {preview.ownerUsername && (
                      <span className="inline-flex items-center gap-1 truncate"><Icon name="person" size={13} />@{preview.ownerUsername}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-white p-4">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white">
                <Icon name="key" size={18} />
              </span>
              <div>
                <h2 className="font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">招待コードで参加</h2>
                <div className="text-[11px] font-bold text-[var(--color-muted)]">グループのオーナーから招待コードを受け取ってください</div>
              </div>
            </div>

            <form
              onSubmit={(event) => { event.preventDefault(); void handleJoin(); }}
              className="mt-4 flex flex-col gap-3"
            >
              <label className="flex min-w-0 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-3">
                <Icon name="vpn_key" size={16} className="shrink-0 text-[var(--color-muted)]" />
                <span className="sr-only">招待コード</span>
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="招待コードを入力"
                  autoComplete="off"
                  autoCapitalize="none"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[15px] font-extrabold text-[var(--solid-ink)] outline-none placeholder:font-semibold placeholder:text-[var(--color-muted)]"
                />
              </label>
              <button
                type="submit"
                disabled={joining || !inviteCode.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 font-display text-[14px] font-extrabold text-white shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:shadow-none"
              >
                <Icon name={joining ? 'progress_activity' : 'login'} size={18} className={joining ? 'animate-spin' : undefined} />
                {joining ? '参加中...' : 'グループに参加'}
              </button>
            </form>
          </section>
        </div>
      )}
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
