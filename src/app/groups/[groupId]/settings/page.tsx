'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import type {
  SharedProjectCard,
  StudyGroupMember,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import { ProfileTapTarget, memberInitial, memberLabel, profileHref, thumbColor } from '../member-ui';

type OverviewResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  projects?: SharedProjectCard[];
  members?: StudyGroupMember[];
  error?: string;
};

export default function GroupSettingsPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [members, setMembers] = useState<StudyGroupMember[]>([]);
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

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
      setMembers(payload.members ?? []);
      setProjects(payload.projects ?? []);
      setName(payload.group.name);
    } catch (loadError) {
      console.warn('Failed to load group settings:', loadError);
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

  const isOwner = group?.role === 'owner';
  const trimmedName = name.trim();
  const nameChanged = Boolean(group) && trimmedName.length > 0 && trimmedName !== group?.name;

  const handleRename = useCallback(async () => {
    if (!group || !nameChanged || savingName) return;
    triggerHaptic();
    setSavingName(true);
    try {
      const response = await fetch(`/api/shared-projects/groups/${encodeURIComponent(group.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; group?: StudyGroupSummary; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'group_rename_failed');
      }
      setGroup((prev) => (prev ? { ...prev, name: trimmedName } : prev));
      showToast({ message: 'グループ名を変更しました', type: 'success' });
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : '変更に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setSavingName(false);
    }
  }, [group, nameChanged, savingName, trimmedName, showToast]);

  const handleRemoveMember = useCallback(async (member: StudyGroupMember) => {
    if (!group || pendingMemberId) return;
    const label = memberLabel(member);
    if (typeof window !== 'undefined' && !window.confirm(`${label}さんをグループから削除しますか？`)) return;
    triggerHaptic();
    setPendingMemberId(member.userId);
    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(member.userId)}`,
        { method: 'DELETE' },
      );
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'member_remove_failed');
      }
      setMembers((current) => current.filter((entry) => entry.userId !== member.userId));
      setGroup((current) => current ? { ...current, memberCount: Math.max(0, current.memberCount - 1) } : current);
      showToast({ message: `${label}さんを削除しました`, type: 'success' });
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : '削除に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setPendingMemberId(null);
    }
  }, [group, pendingMemberId, showToast]);

  const handleRemoveProject = useCallback(async (card: SharedProjectCard) => {
    if (!group || pendingProjectId) return;
    if (typeof window !== 'undefined' && !window.confirm(`「${card.project.title}」をグループから削除しますか？`)) return;
    triggerHaptic();
    setPendingProjectId(card.project.id);
    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(group.id)}/projects/${encodeURIComponent(card.project.id)}`,
        { method: 'DELETE' },
      );
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'project_remove_failed');
      }
      setProjects((current) => current.filter((entry) => entry.project.id !== card.project.id));
      setGroup((current) => current ? { ...current, projectCount: Math.max(0, current.projectCount - 1) } : current);
      showToast({ message: `「${card.project.title}」を削除しました`, type: 'success' });
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : '削除に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setPendingProjectId(null);
    }
  }, [group, pendingProjectId, showToast]);

  const backHref = `/groups/${encodeURIComponent(groupId)}`;

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] font-[var(--font-body)]"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="flex items-center gap-2.5 px-[14px] pb-1">
        <Link
          href={backHref}
          aria-label="グループに戻る"
          onClick={() => triggerHaptic()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="arrow_back" size={16} />
        </Link>
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">GROUP SETTINGS</div>
          <h1 className="truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">グループ設定</h1>
        </div>
      </header>

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
        <div className="flex flex-col gap-4 px-[14px] pt-3">
          {/* Group name */}
          <SectionCard icon="badge" title="グループ名" accent="#137FEC">
            {isOwner ? (
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  value={name}
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                  className="min-w-0 flex-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[14px] font-bold text-[var(--solid-ink)] outline-none"
                  placeholder="グループ名"
                />
                <button
                  type="button"
                  disabled={!nameChanged || savingName}
                  onClick={() => void handleRename()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2.5 font-display text-[13px] font-extrabold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-45"
                >
                  <Icon name={savingName ? 'progress_activity' : 'check'} size={15} className={savingName ? 'animate-spin' : ''} />
                  保存
                </button>
              </div>
            ) : (
              <div className="rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-2.5 font-display text-[14px] font-bold text-[var(--solid-ink)]">
                {group.name}
              </div>
            )}
          </SectionCard>

          {/* Members */}
          <SectionCard icon="group" title="メンバー" subtitle={`${members.length}人が参加中`} accent="#3DA1B8">
            {members.length === 0 ? (
              <EmptyRow message="まだメンバーがいません" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {members.map((member) => {
                  const href = profileHref(member);
                  const canRemove = isOwner && member.role !== 'owner';
                  return (
                    <div key={member.userId} className="flex items-center gap-2">
                      <ProfileTapTarget
                        href={href}
                        label={memberLabel(member)}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border-2 px-3 py-2 transition-all duration-100 active:translate-x-px active:translate-y-px ${member.isViewer ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-border)] bg-white'}`}
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] font-display text-[14px] font-extrabold text-white"
                          style={{ backgroundColor: thumbColor(member.userId) }}
                        >
                          {memberInitial(member)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-extrabold text-[var(--solid-ink)]">{memberLabel(member)}</span>
                            {member.role === 'owner' && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[#E29C57] bg-[#FFF6E8] px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wide text-[#B26A1F]">
                                <Icon name="workspace_premium" size={11} />オーナー
                              </span>
                            )}
                            {member.isViewer && (
                              <span className="shrink-0 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wide text-white">あなた</span>
                            )}
                          </div>
                          {member.accountId && (
                            <div className="truncate font-mono text-[11px] font-bold text-[var(--color-muted)]">@{member.accountId}</div>
                          )}
                        </div>
                        {href && !canRemove && <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />}
                      </ProfileTapTarget>
                      {canRemove && (
                        <button
                          type="button"
                          disabled={Boolean(pendingMemberId)}
                          onClick={() => void handleRemoveMember(member)}
                          aria-label={`${memberLabel(member)}を削除`}
                          className="inline-flex shrink-0 items-center justify-center rounded-[10px] border-2 border-[#CC4D59] bg-white p-2 text-[#CC4D59] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-45"
                        >
                          <Icon name={pendingMemberId === member.userId ? 'progress_activity' : 'person_remove'} size={16} className={pendingMemberId === member.userId ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Wordbooks */}
          <SectionCard icon="menu_book" title="共有単語帳" subtitle={`${projects.length}冊の単語帳`} accent="#664DB3">
            {projects.length === 0 ? (
              <EmptyRow message="共有中の単語帳はありません" />
            ) : (
              <div className="flex flex-col gap-2">
                {projects.map((card) => (
                  <div key={card.project.id} className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-2">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[16px] font-extrabold text-white"
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
                    {isOwner && (
                      <button
                        type="button"
                        disabled={Boolean(pendingProjectId)}
                        onClick={() => void handleRemoveProject(card)}
                        aria-label={`${card.project.title}を削除`}
                        className="inline-flex shrink-0 items-center justify-center rounded-[10px] border-2 border-[#CC4D59] bg-white p-2 text-[#CC4D59] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-45"
                      >
                        <Icon name={pendingProjectId === card.project.id ? 'progress_activity' : 'delete'} size={16} className={pendingProjectId === card.project.id ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {!isOwner && (
            <p className="px-1 pb-2 text-[11px] font-bold leading-relaxed text-[var(--color-muted)]">
              グループ名の変更・メンバーや単語帳の削除はオーナーのみ可能です。
            </p>
          )}
        </div>
      )}
    </div>
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
