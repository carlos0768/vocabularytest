'use client';

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

export function GroupCard({ group }: { group: StudyGroupSummary }) {
  const color = thumbColor(group.id);

  return (
    <Link
      href={`/groups/${group.id}`}
      onPointerDown={() => triggerHaptic()}
      aria-label={`${group.name}のグループを開く`}
      className="block focus:outline-none"
    >
      <div className="overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] shadow-[3px_4px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-ink)]">
        {/* Colored header band — same gradient as GroupHeader on the detail page */}
        <div
          className="px-3.5 py-2.5"
          style={{ background: `linear-gradient(135deg, ${color} 0%, var(--solid-ink) 160%)` }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-white/60 bg-white/15 font-display text-[16px] font-extrabold text-white backdrop-blur-sm">
              {group.name.charAt(0)}
            </div>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-white/70">
              STUDY GROUP
            </span>
            <div className="ml-auto flex items-center gap-1 text-white/60">
              <Icon name="emoji_events" size={13} />
              <span className="font-mono text-[9px] font-bold tracking-wide">ランキング</span>
            </div>
          </div>
        </div>

        {/* White content area */}
        <div className="bg-[var(--color-surface)] px-3.5 py-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
                  {group.name}
                </span>
                {group.role === 'owner' && (
                  <span className="shrink-0 rounded-full bg-[var(--solid-ink)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                    owner
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] font-bold text-[var(--color-muted)]">
                <span className="inline-flex items-center gap-0.5">
                  <Icon name="group" size={13} />
                  {group.memberCount}人
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Icon name="menu_book" size={13} />
                  {group.projectCount}冊
                </span>
              </div>
            </div>
            <Icon name="chevron_right" size={18} className="shrink-0 text-[var(--color-muted)]" />
          </div>
        </div>
      </div>
    </Link>
  );
}
