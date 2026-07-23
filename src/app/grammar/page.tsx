'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// 語法コーナー: ChatGPT連携で作成した文法・語法問題集(Vintage型)の一覧。
// データ取得は Pro ゲート付きの /api/chatgpt/grammar-books を cookie セッションで
// そのまま利用する(このアプリからの fetch は同一オリジンで cookie が付く)。

const GPT_URL = process.env.NEXT_PUBLIC_CHATGPT_GPT_URL ?? '';

type GrammarBook = {
  id: string;
  title: string;
  updatedAt: string;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; books: GrammarBook[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function GrammarBooksPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/chatgpt/grammar-books?limit=50', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          books?: GrammarBook[];
          error?: string;
          code?: string;
        };

        if (cancelled) return;

        if (response.status === 403 && payload.code === 'PRO_REQUIRED') {
          setState({ kind: 'pro-required' });
          return;
        }
        if (!response.ok || !payload.success) {
          setState({ kind: 'error', message: payload.error || '問題集の取得に失敗しました' });
          return;
        }
        setState({ kind: 'ready', books: payload.books ?? [] });
      } catch {
        if (!cancelled) {
          setState({ kind: 'error', message: '通信に失敗しました' });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const gptCta = GPT_URL ? (
    <a
      href={GPT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <Icon name="smart_toy" size={18} />
      ChatGPTで問題を作る
    </a>
  ) : (
    <Link
      href="/tips/chatgpt"
      className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <Icon name="smart_toy" size={18} />
      ChatGPT連携の使い方を見る
    </Link>
  );

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-32 pt-[calc(env(safe-area-inset-top,0px)+12px)] font-[var(--font-body)]">
      {/* Header */}
      <div className="pb-3.5 pt-1">
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">GRAMMAR / USAGE</div>
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">
          語法問題集
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-[var(--color-muted)]">
          空欄補充・英語4択・解説つき。問題はChatGPTとの会話で作成します
        </div>
      </div>

      {state.kind === 'loading' && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl border-2 border-[var(--color-border)] bg-white" />
          ))}
        </div>
      )}

      {state.kind === 'pro-required' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-[3px] border border-[var(--solid-ink)] bg-white px-[6px] py-[2px] font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
              PRO
            </span>
            <span className="font-display text-[15px] font-bold text-[var(--solid-ink)]">Pro限定機能です</span>
          </div>
          <p className="m-0 mt-2 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
            語法問題集はProプラン限定です。アップグレードすると、ChatGPTとの会話でVintage風の語法問題を作成・演習できます。
          </p>
          <Link
            href="/subscription"
            className="mt-4 flex h-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white"
          >
            Proプランを見る
          </Link>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
          <p className="m-0 text-[13px] text-[var(--solid-ink)]">{state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 h-10 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-5 text-[13px] font-bold text-[var(--solid-ink)]"
          >
            再読み込み
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.books.length === 0 && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <div className="font-display text-[15px] font-bold text-[var(--solid-ink)]">まだ問題集がありません</div>
          <p className="m-0 mt-2 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
            ChatGPTのMERKEN GPTに「仮定法の語法問題を10問作って」のように頼むと、ここに問題集が保存されます。
          </p>
          <div className="mt-4">{gptCta}</div>
        </div>
      )}

      {state.kind === 'ready' && state.books.length > 0 && (
        <>
          <div className="flex flex-col gap-2.5">
            {state.books.map((book) => (
              <Link
                key={book.id}
                href={`/grammar/${book.id}`}
                className="flex items-center gap-3 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-3.5 no-underline transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] bg-[#faf7f1] text-[var(--solid-ink)]">
                  <Icon name="menu_book" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[14.5px] font-bold text-[var(--solid-ink)]">{book.title}</span>
                  <span className="mt-0.5 block font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
                    更新 {formatDate(book.updatedAt)}
                  </span>
                </span>
                <Icon name="chevron_right" size={16} className="shrink-0 text-[var(--color-muted)]" />
              </Link>
            ))}
          </div>
          <div className="mt-5">{gptCta}</div>
        </>
      )}
    </div>
  );
}
