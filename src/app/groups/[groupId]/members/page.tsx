'use client';

/**
 * グループのメンバー一覧。
 * ヘッダのアイコン列に収まりきらないメンバーもここで全員見られる。
 * LINE の「トークルーム情報」と同じ位置づけなので、招待とグループ設定への
 * 導線もこのページに置く。
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import {
  GroupPageEmpty,
  GroupPageLoading,
  GroupPageShell,
} from '@/components/groups/GroupPageShell';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { loadGroupOverview } from '@/lib/shared-projects/group-overview-cache';
import type { StudyGroupMember, StudyGroupSummary } from '@/lib/shared-projects/types';
import { ProfileTapTarget, memberInitial, memberLabel, profileHref } from '../member-ui';

const GroupInviteShareSheet = dynamic(
  () => import('../invite-share-sheet').then((mod) => mod.GroupInviteShareSheet),
  { ssr: false },
);

export default function GroupMembersPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const { showToast } = useToast();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [members, setMembers] = useState<StudyGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;

    // ハブと同じキャッシュを共有（stale-while-revalidate）。
    loadGroupOverview(groupId, (payload) => {
      if (cancelled) return;
      setGroup(payload.group);
      setMembers(payload.members);
      setLoading(false);
    })
      .catch(() => {
        if (!cancelled) setError('メンバーを読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [groupId]);

  const inviteCode = group?.inviteCode ?? null;
  const copyInvite = useCallback(async () => {
    if (!inviteCode) return;
    triggerHaptic();
    try {
      await navigator.clipboard.writeText(inviteCode);
      showToast({ message: '招待コードをコピーしました', type: 'success' });
    } catch {
      showToast({ message: 'コピーに失敗しました', type: 'error' });
    }
  }, [inviteCode, showToast]);

  const groupPath = `/groups/${encodeURIComponent(groupId)}`;

  return (
    <>
      <GroupPageShell
        eyebrow="MEMBERS"
        title={group ? `${group.name} のメンバー` : 'メンバー'}
        backHref={groupPath}
        right={
          group ? (
            <Link
              href={`${groupPath}/settings`}
              aria-label="グループ設定"
              onClick={() => triggerHaptic()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="settings" size={16} />
            </Link>
          ) : undefined
        }
      >
        {loading && members.length === 0 ? (
          <GroupPageLoading />
        ) : error ? (
          <GroupPageEmpty icon="error" message={error} />
        ) : (
          <>
            {group && (
              <div className="mb-3 flex items-center gap-3 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-3">
                <GroupAvatar group={group} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
                    {group.name}
                  </div>
                  <div className="font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                    {group.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'} · {members.length}人
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {members.map((member) => (
                <ProfileTapTarget
                  key={member.userId}
                  href={profileHref(member)}
                  label={memberLabel(member)}
                  className={`flex items-center gap-3 rounded-[12px] border-2 px-3 py-2.5 transition-all duration-100 active:translate-x-px active:translate-y-px ${member.isViewer ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}
                >
                  <ProfileAvatar
                    avatarUrl={member.avatarUrl}
                    initial={memberInitial(member)}
                    color={profileAvatarColor(member.accountId ?? member.userId)}
                    size={40}
                    radius={20}
                    fontSize={16}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-extrabold text-[var(--solid-ink)]">
                      {memberLabel(member)}
                      {member.isViewer && (
                        <span className="ml-1.5 font-mono text-[10px] font-bold text-[var(--color-accent)]">あなた</span>
                      )}
                    </div>
                    {member.accountId && (
                      <div className="truncate font-mono text-[10.5px] font-bold text-[var(--color-muted)]">
                        @{member.accountId}
                      </div>
                    )}
                  </div>
                  {member.role === 'owner' && (
                    <span className="shrink-0 rounded-full border-2 border-[var(--solid-ink)] bg-[#FFC800] px-2 py-0.5 font-display text-[10px] font-extrabold text-[var(--solid-ink)]">
                      オーナー
                    </span>
                  )}
                </ProfileTapTarget>
              ))}
            </div>

            {group && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void copyInvite()}
                  className="flex h-[46px] items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[13px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
                >
                  <Icon name="content_copy" size={16} />
                  招待コード
                </button>
                <button
                  type="button"
                  onClick={() => { triggerHaptic(); setShareOpen(true); }}
                  className="flex h-[46px] items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[13px] font-extrabold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
                >
                  <Icon name="person_add" size={16} />
                  メンバーを招待
                </button>
              </div>
            )}
          </>
        )}
      </GroupPageShell>

      {group && (
        <GroupInviteShareSheet open={shareOpen} group={group} onClose={() => setShareOpen(false)} />
      )}
    </>
  );
}
