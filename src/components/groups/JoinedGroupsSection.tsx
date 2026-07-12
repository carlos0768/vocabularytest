'use client';

/**
 * 参加中のグループ表示（共通コンポーネント）。
 * 元は /shared（SharedPageClient / DesktopShared）のローカル実装だったが、
 * ホームのマイ単語帳直下へ移設するにあたり共通化した。
 * - JoinedGroupsSection: モバイル向け縦リスト
 * - JoinedGroupGrid: デスクトップ向けカードグリッド
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

export function JoinedGroupsSection({ groups }: { groups: StudyGroupSummary[] }) {
  if (groups.length === 0) return null;

  return (
    <div className="px-[14px] pb-1 pt-3">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name="groups" size={20} className="text-[var(--solid-ink)]" />
        <h2 className="font-display text-[18px] font-black tracking-tight text-[var(--solid-ink)]">参加中のグループ</h2>
        <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[var(--solid-ink)] px-1.5 font-mono text-[11px] font-extrabold tabular-nums text-white">
          {groups.length}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {groups.map((group) => (
          <JoinedGroupCard key={group.id} group={group} />
        ))}
      </div>
    </div>
  );
}

export function JoinedGroupCard({ group }: { group: StudyGroupSummary }) {
  const color = thumbColor(group.id);
  return (
    <Link
      href={`/groups/${group.id}`}
      onPointerDown={() => triggerHaptic()}
      aria-label={`${group.name}のグループを開く`}
      className="block focus:outline-none"
    >
      <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
        <div className="flex items-center gap-[11px]">
          <div
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[22px] font-extrabold text-white"
            style={{ backgroundColor: color }}
          >
            {group.name.charAt(0)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-display text-[14px] font-bold text-[var(--solid-ink)]">{group.name}</span>
              {group.role === 'owner' && (
                <span className="shrink-0 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[var(--color-muted)]">owner</span>
              )}
            </div>
            <div className="mt-[3px] flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
              <span className="flex items-center gap-0.5">
                <Icon name="group" size={12} />
                {group.memberCount}人
              </span>
              <span className="flex items-center gap-0.5">
                <Icon name="menu_book" size={12} />
                {group.projectCount}冊
              </span>
            </div>
          </div>

          <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
        </div>
      </div>
    </Link>
  );
}

/** デスクトップ向けカードグリッド（元 DesktopShared のローカル実装）。 */
export function JoinedGroupGrid({
  groups,
  columns = 3,
  title = '参加中のグループ',
}: {
  groups: StudyGroupSummary[];
  columns?: number;
  title?: string;
}) {
  if (groups.length === 0) return null;
  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>{title}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 999,
            background: 'var(--solid-ink)',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {groups.length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16 }}>
        {groups.map((group) => (
          <Link
            key={group.id}
            href={`/groups/${encodeURIComponent(group.id)}`}
            className="ds-card"
            style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
          >
            <div
              className="ds-project-icon ds-project-icon--lg"
              style={{ background: thumbColor(group.id) }}
            >
              {group.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.name}
                </span>
                {group.role === 'owner' && <span className="ds-tag plain">owner</span>}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="group" style={{ fontSize: 14 }} />{group.memberCount}人
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="menu_book" style={{ fontSize: 14 }} />{group.projectCount}冊
                </span>
              </div>
            </div>
            <Icon name="chevron_right" style={{ fontSize: 20, color: 'var(--color-muted)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </section>
  );
}
