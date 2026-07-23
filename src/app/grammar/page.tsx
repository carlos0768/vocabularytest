'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopGrammarBooksView,
  type GrammarBook,
  type GrammarBooksLoadState,
} from '@/components/desktop/DesktopGrammar';

// 語法コーナー: ChatGPT連携で作成した文法・語法問題集(Vintage型)の一覧。
// データ取得は Pro ゲート付きの /api/chatgpt/grammar-books を cookie セッションで
// そのまま利用する(このアプリからの fetch は同一オリジンで cookie が付く)。
// デスクトップは DesktopGrammarBooksView、モバイルは本ファイル内のUIを使う。

const GPT_URL = process.env.NEXT_PUBLIC_CHATGPT_GPT_URL ?? '';

type LoadState = GrammarBooksLoadState;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function GrammarBooksPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [sharingBookId, setSharingBookId] = useState<string | null>(null);
  const [sharedBookId, setSharedBookId] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);

  // 確認のうえ問題集を削除する (問題・誤答ログはDB側のCASCADEで一緒に消える)
  const handleDelete = async (bookId: string, title: string) => {
    if (deletingBookId) return;
    if (!window.confirm(`「${title}」を削除しますか？\n中の問題もすべて削除されます。`)) return;
    setDeletingBookId(bookId);
    try {
      const response = await fetch(`/api/grammar/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        window.alert(payload.error || '問題集の削除に失敗しました');
        return;
      }
      setState((prev) =>
        prev.kind === 'ready' ? { kind: 'ready', books: prev.books.filter((book) => book.id !== bookId) } : prev,
      );
    } catch {
      window.alert('通信に失敗しました');
    } finally {
      setDeletingBookId(null);
    }
  };

  // 手動で問題集を作成し、問題追加ができる一覧ページへ移動する
  const [creatingBook, setCreatingBook] = useState(false);
  const handleCreateManual = async () => {
    if (creatingBook) return;
    const title = window.prompt('問題集のタイトルを入力してください', '')?.trim();
    if (!title) return;
    setCreatingBook(true);
    try {
      const response = await fetch('/api/chatgpt/grammar-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        book?: { id: string };
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.book) {
        window.alert(payload.error || '問題集の作成に失敗しました');
        return;
      }
      router.push(`/grammar/${payload.book.id}/list`);
    } catch {
      window.alert('通信に失敗しました');
    } finally {
      setCreatingBook(false);
    }
  };

  // 共有リンクを発行してクリップボードにコピーする
  const handleShare = async (bookId: string) => {
    if (sharingBookId) return;
    setSharingBookId(bookId);
    try {
      const response = await fetch('/api/grammar/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        sharePath?: string;
      };
      if (!response.ok || !payload.success || !payload.sharePath) {
        setSharedBookId(null);
        return;
      }
      await navigator.clipboard.writeText(`${window.location.origin}${payload.sharePath}`);
      setSharedBookId(bookId);
      window.setTimeout(() => setSharedBookId((prev) => (prev === bookId ? null : prev)), 2000);
    } catch {
      setSharedBookId(null);
    } finally {
      setSharingBookId(null);
    }
  };

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

  const manualCta = (
    <button
      type="button"
      onClick={() => void handleCreateManual()}
      disabled={creatingBook}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-white font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-60"
    >
      <Icon name="edit" size={18} />
      手動で問題集を作る
    </button>
  );

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
    <>
      <DesktopGrammarBooksView
        state={state}
        gptUrl={GPT_URL}
        sharingBookId={sharingBookId}
        sharedBookId={sharedBookId}
        deletingBookId={deletingBookId}
        onShare={(bookId) => void handleShare(bookId)}
        onDelete={(bookId, title) => void handleDelete(bookId, title)}
        onCreateManual={() => void handleCreateManual()}
      />

      <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-32 pt-3 font-[var(--font-body)] lg:hidden">
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
          <div className="mt-4 flex flex-col gap-2.5">
            {gptCta}
            {manualCta}
          </div>
        </div>
      )}

      {state.kind === 'ready' && state.books.length > 0 && (
        <>
          <div className="flex flex-col gap-2.5">
            {state.books.map((book) => (
              <div
                key={book.id}
                className="flex items-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3 py-3.5"
              >
                {/* カード本体のタップは問題一覧へ (演習は右のボタンから) */}
                <Link
                  href={`/grammar/${book.id}/list`}
                  className="flex min-w-0 flex-1 items-center gap-3 no-underline"
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
                </Link>
                <button
                  type="button"
                  onClick={() => void handleShare(book.id)}
                  disabled={sharingBookId !== null}
                  aria-label="共有リンクをコピー"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
                >
                  <Icon name={sharedBookId === book.id ? 'check' : 'ios_share'} size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(book.id, book.title)}
                  disabled={deletingBookId !== null}
                  aria-label="問題集を削除"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[#d33] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
                >
                  <Icon name="delete" size={15} />
                </button>
                <Link
                  href={`/grammar/${book.id}`}
                  aria-label="演習を開く"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
                >
                  <Icon name="play_arrow" size={16} />
                </Link>
              </div>
            ))}
          </div>
          {sharedBookId && (
            <p className="mt-2 text-center text-[11px] font-bold text-[var(--color-accent)]">共有リンクをコピーしました</p>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            {gptCta}
            {manualCta}
          </div>
        </>
      )}
      </div>
    </>
  );
}
