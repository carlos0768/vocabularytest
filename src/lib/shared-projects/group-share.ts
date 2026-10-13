// Helpers for sharing a study group across social platforms (X / Instagram /
// LINE / Discord). These are pure functions so they can be unit-tested and
// reused by both the client share sheet and the dynamic OGP image route.

import { THUMBS, thumbColor } from '@/lib/ui/thumb-color';

// Same palette as the in-app cards, so share thumbnails match them.
export const GROUP_THUMB_COLORS = THUMBS;

// Deterministic theme color for a group id. Same id -> same color everywhere.
export function groupThumbColor(id: string): string {
  return thumbColor(id);
}

// Deterministic theme color for a shared wordbook (project) id, drawn from the
// same palette so wordbook OGP cards feel consistent with group ones.
export function wordbookThumbColor(id: string): string {
  return thumbColor(id);
}

export type GroupShareInfo = {
  name: string;
  memberCount?: number;
  projectCount?: number;
};

export type GroupShareMessages = {
  // Plain message for the Web Share API (the url is passed separately).
  native: string;
  // Tweet body. The url is passed to the intent separately.
  x: string;
  // LINE chat message (url appended by buildLineShareUrl).
  line: string;
  // Full Discord message including the url (Discord has no share intent, so
  // this is copied to the clipboard ready to paste).
  discord: string;
  // Instagram caption (copied to the clipboard for stories / DMs / bio link).
  instagram: string;
};

// Build the public, preview-able join URL for a group. Non-members can open
// this link, see the group thumbnail/name and join — the social funnel target.
export function buildGroupShareUrl(origin: string, groupId: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  return `${base}/groups/${encodeURIComponent(groupId)}/join`;
}

// Per-platform share copy. Tuned to make someone seeing it in a chat or story
// want to tap in: names the group, frames it as studying together + ranking.
export function buildGroupShareMessages(
  info: GroupShareInfo,
  url: string,
): GroupShareMessages {
  const name = info.name?.trim() || '学習グループ';

  const native = `「${name}」で一緒に英単語を覚えよう！MERKENの学習グループでランキングを競い合おう🔥`;

  const x = [
    `「${name}」で一緒に英単語を覚えよう！📚`,
    'MERKENの学習グループに参加してランキングで競い合おう🔥',
    '#MERKEN #英語学習 #英単語',
  ].join('\n');

  const line = `「${name}」で一緒に英単語を覚えよう！📚 MERKENの学習グループはこちら👇`;

  const discord = [
    `**📚「${name}」で英単語を覚えよう！**`,
    'MERKENの学習グループに参加してランキングで競い合おう🔥',
    url,
  ].join('\n');

  const instagram = [
    `「${name}」で一緒に英単語を覚えよう！📚🔥`,
    'MERKENの学習グループに参加してね✨',
    `👉 ${url}`,
    '#MERKEN #英語学習 #英単語 #勉強垢',
  ].join('\n');

  return { native, x, line, discord, instagram };
}

// X (Twitter) web intent — opens the composer prefilled with text + url.
export function buildXIntentUrl(url: string, text: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

// LINE — open the app/web composer with a prefilled message so it can be sent
// straight into a chat. The url is appended to the message body.
export function buildLineShareUrl(url: string, text: string): string {
  const body = `${text}\n${url}`;
  return `https://line.me/R/msg/text/?${encodeURIComponent(body)}`;
}
