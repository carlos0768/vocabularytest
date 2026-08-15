'use client';

/**
 * グループの固定ヘッダ（LINE のトークルーム風）。
 * 左から 戻る / グループアイコン＋ルーム名、右端にメンバーのアイコンを重ねて置く。
 * 全員は載らないので、はみ出したぶんは「+N」と矢印にまとめ、押すとメンバー
 * 一覧ページへ遷移する。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';
import type { StudyGroupMember, StudyGroupSummary } from '@/lib/shared-projects/types';

/** ヘッダに並べるアイコンの最大数。これを超えたら +N に丸める。 */
const MAX_VISIBLE_MEMBERS = 4;

function memberInitial(member: StudyGroupMember): string {
  return (member.username?.trim() || member.accountId || 'U').charAt(0).toUpperCase();
}

export function GroupRoomHeader({
  group,
  members,
  membersHref,
}: {
  group: StudyGroupSummary | null;
  members: StudyGroupMember[];
  membersHref: string;
}) {
  const router = useRouter();

  // 自分を先頭に寄せると「誰がいるか」が読み取りにくいので、並びはAPIの
  // 順（オーナー→名前順）のまま先頭から詰める。
  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = members.length - visible.length;

  return (
    <header
      className="shrink-0 border-b-2 border-[var(--color-border)] bg-[var(--color-background)] px-[14px] pb-2.5"
      style={{ paddingTop: 'max(10px, calc(env(safe-area-inset-top) + 10px))' }}
    >
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-2">
        <button
          type="button"
          onClick={() => {
            triggerHaptic();
            // 直接開かれた（履歴が無い）ときに back() は何も起きず戻れなくなる
            // ので、そのときだけ共有ライブラリへ抜ける。
            if (typeof window !== 'undefined' && window.history.length > 1) router.back();
            else router.push('/shared');
          }}
          aria-label="戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="arrow_back" size={16} />
        </button>

        {group ? (
          <>
            <GroupAvatar group={group} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
                {group.name}
              </div>
              <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                MEMBERS {group.memberCount}
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="h-[15px] w-32 animate-pulse rounded bg-[var(--color-surface-secondary)]" />
          </div>
        )}

        {members.length > 0 && (
          <Link
            href={membersHref}
            onClick={() => triggerHaptic()}
            aria-label={`メンバー一覧（${members.length}人）`}
            className="flex shrink-0 items-center gap-1 rounded-full py-1 pl-1 transition-transform duration-100 active:scale-95"
          >
            <span className="flex items-center">
              {visible.map((member, index) => (
                <span
                  key={member.userId}
                  className={index === 0 ? '' : '-ml-2.5'}
                  style={{ zIndex: MAX_VISIBLE_MEMBERS - index }}
                >
                  <ProfileAvatar
                    avatarUrl={member.avatarUrl}
                    initial={memberInitial(member)}
                    color={profileAvatarColor(member.accountId ?? member.userId)}
                    size={28}
                    radius={14}
                    fontSize={12}
                    style={{ boxShadow: '0 0 0 2px var(--color-background)' }}
                  />
                </span>
              ))}
              {overflow > 0 && (
                <span
                  className="-ml-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-mono text-[10px] font-extrabold tabular-nums text-[var(--solid-ink)]"
                  style={{ boxShadow: '0 0 0 2px var(--color-background)' }}
                >
                  +{overflow}
                </span>
              )}
            </span>
            <Icon name="chevron_right" size={16} className="text-[var(--color-muted)]" />
          </Link>
        )}
      </div>
    </header>
  );
}
