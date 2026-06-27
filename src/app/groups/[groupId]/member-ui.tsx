'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { triggerHaptic } from '@/lib/haptics';

// Site-wide avatar palette (matches home, shared, feed).
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

export function thumbColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

export type MemberLike = { username: string | null; accountId: string | null; isViewer?: boolean };

export function memberLabel(entry: MemberLike): string {
  return entry.username?.trim() || (entry.accountId ? `@${entry.accountId}` : 'ユーザー');
}

export function memberInitial(entry: MemberLike): string {
  return (entry.username?.trim() || entry.accountId || 'U').charAt(0).toUpperCase();
}

// Resolves the profile route for a group member. The viewer lands on their own
// profile; others route by account ID. Members without an account ID (older
// accounts that never picked a handle) are not linkable.
export function profileHref(entry: MemberLike): string | null {
  if (entry.isViewer) return '/profile';
  if (entry.accountId) return `/profile/${encodeURIComponent(entry.accountId)}`;
  return null;
}

// Wraps member-facing content so a tap opens the profile when one is available,
// gracefully degrading to a plain container otherwise.
export function ProfileTapTarget({
  href,
  label,
  className,
  children,
}: {
  href: string | null;
  label: string;
  className: string;
  children: ReactNode;
}) {
  if (!href) {
    return <div className={className}>{children}</div>;
  }
  return (
    <Link
      href={href}
      aria-label={`${label}のプロフィールを見る`}
      onClick={() => triggerHaptic()}
      className={className}
    >
      {children}
    </Link>
  );
}
