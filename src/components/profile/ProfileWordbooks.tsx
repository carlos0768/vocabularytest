'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { profileAvatarColor } from '@/lib/profile/avatar-color';
import type { ProfileWordbook, ProfileWordbookList } from '@/lib/profile/wordbooks';

type WordbooksLoadState = { accountId: string; wordbooks: ProfileWordbookList | null };

/** /api/users/[accountId]/wordbooks を読む。enabled が false の間(未ログイン・ID未確定)は読まない。 */
export function useProfileWordbooks(accountId: string | null, enabled: boolean) {
  const [state, setState] = useState<WordbooksLoadState | null>(null);

  useEffect(() => {
    if (!enabled || !accountId) return;

    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(accountId)}/wordbooks`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((payload: { success?: boolean; wordbooks?: ProfileWordbookList } | null) => {
        if (cancelled) return;
        setState({ accountId, wordbooks: payload?.success && payload.wordbooks ? payload.wordbooks : null });
      })
      .catch(() => {
        if (!cancelled) setState({ accountId, wordbooks: null });
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, enabled]);

  const current = state?.accountId === accountId ? state : null;
  return {
    wordbooks: current?.wordbooks ?? null,
    loading: enabled && !!accountId && !current,
  };
}

/**
 * プロフィールの「単語帳」欄。その人が持っている単語帳を並べる。
 * 他人のプロフィールでは一覧だけで中身は開けない(カードはリンクにしない)。
 * 自分のプロフィールのときだけ wordbookHref を渡し、タップで単語帳を開けるようにする。
 */
export function ProfileWordbooks({
  wordbooks,
  loading,
  wordbookHref,
  isSelf,
}: {
  wordbooks: ProfileWordbookList | null;
  loading: boolean;
  wordbookHref?: (id: string) => string;
  isSelf: boolean;
}) {
  const total = wordbooks?.total ?? 0;
  const items = wordbooks?.items ?? [];
  // 上限で返ってこなかった分(一覧には出せないので件数だけ出す)
  const notLoaded = Math.max(0, total - items.length);

  return (
    <section>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            WORDBOOKS
          </div>
          <div className="mt-0.5 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            単語帳
            {wordbooks && (
              <span className="ml-1.5 font-mono text-[12px] font-bold tabular-nums text-[var(--color-muted)]">
                {total.toLocaleString()}冊
              </span>
            )}
          </div>
        </div>
        {!isSelf && wordbooks && total > 0 && (
          <div className="flex items-center gap-1 pb-0.5 text-[11px] font-bold text-[var(--color-muted)]">
            <Icon name="lock" size={12} />
            中身は本人だけが見られます
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="ml-2 text-sm">読み込み中...</span>
        </div>
      ) : !wordbooks ? (
        <div className="mt-3 rounded-[14px] border-2 border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
          単語帳を読み込めませんでした
        </div>
      ) : wordbooks.items.length === 0 ? (
        <div className="mt-3 rounded-[14px] border-2 border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
          まだ単語帳がありません
        </div>
      ) : (
        <>
          {/* 横スクロール。ページの左右余白(18px)ぶんはみ出させて、画面の端までスクロールできるようにする */}
          <div className="-mx-[18px] mt-3 flex snap-x snap-mandatory scroll-px-[18px] gap-2.5 overflow-x-auto px-[18px] pb-2 [scrollbar-width:none] lg:mx-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
            {items.map((wordbook) => (
              <WordbookCard key={wordbook.id} wordbook={wordbook} href={wordbookHref?.(wordbook.id)} />
            ))}
            {notLoaded > 0 && (
              <div className="flex w-[112px] shrink-0 snap-start items-center justify-center rounded-[14px] border-2 border-dashed border-[var(--color-border)] text-[12px] font-bold text-[var(--color-muted)]">
                ほか {notLoaded.toLocaleString()}冊
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function WordbookCard({ wordbook, href }: { wordbook: ProfileWordbook; href?: string }) {
  const body = (
    <>
      <div
        className="flex aspect-square w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[26px] font-extrabold text-white"
        style={{
          background: wordbook.iconImage
            ? `center / cover no-repeat url(${wordbook.iconImage})`
            : profileAvatarColor(wordbook.id),
        }}
      >
        {!wordbook.iconImage && Array.from(wordbook.title)[0]}
      </div>
      <div className="mt-1.5 line-clamp-2 min-h-[2.5em] text-[12px] font-bold leading-[1.25] text-[var(--solid-ink)]">
        {wordbook.title}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--color-muted)]">
          {wordbook.wordCount.toLocaleString()}語
        </span>
        {wordbook.kind === 'classical' && (
          <span className="rounded-[4px] border border-[var(--solid-ink)] px-1 text-[9px] font-bold leading-[13px] text-[var(--solid-ink)]">
            古文
          </span>
        )}
      </div>
    </>
  );

  const className =
    'block w-[112px] shrink-0 snap-start rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-2';

  if (href) {
    return (
      <Link href={href} className={`${className} active:translate-x-px active:translate-y-px`}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
