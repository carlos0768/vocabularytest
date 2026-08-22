'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesktopSidebar } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import type { PublicGrammarBookCard } from '@/lib/grammar/types';

// 共有ページ (/shared) に語法問題集を公開する画面。
// 単語帳の /shared/share-wordbook と同じ操作感で、選択 → 公開 → 一覧に載る。
// 公開すると共有リンク (/grammar/share/[shareId]) も同時に有効になる。

type MyGrammarBook = {
  id: string;
  title: string;
  questionCount: number;
  updatedAt: string;
};

type MyBooksResponse = {
  success?: boolean;
  books?: MyGrammarBook[];
  error?: string;
  code?: string;
};

type PublishedResponse = {
  success?: boolean;
  books?: PublicGrammarBookCard[];
  error?: string;
};

type PublishResponse = {
  success?: boolean;
  shareId?: string;
  error?: string;
};

export default function ShareGrammarClient() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [books, setBooks] = useState<MyGrammarBook[]>([]);
  const [publishedBooks, setPublishedBooks] = useState<PublicGrammarBookCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const publishedIds = useMemo(
    () => new Set(publishedBooks.map((book) => book.id)),
    [publishedBooks],
  );
  // 公開済みの問題集は下の「公開中」セクションに出るので選択リストからは外す。
  const selectableBooks = useMemo(
    () => books.filter((book) => !publishedIds.has(book.id)),
    [books, publishedIds],
  );
  const selectedBook = useMemo(
    () => selectableBooks.find((book) => book.id === selectedId) ?? null,
    [selectableBooks, selectedId],
  );

  const loadBooks = useCallback(async () => {
    if (!user || !isPro) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [mineResponse, publishedResponse] = await Promise.all([
        fetch('/api/chatgpt/grammar-books?limit=50', { cache: 'no-store' })
          .then((response) => response.json().catch(() => null) as Promise<MyBooksResponse | null>)
          .catch(() => null),
        fetch('/api/grammar/share', { cache: 'no-store' })
          .then((response) => response.json().catch(() => null) as Promise<PublishedResponse | null>)
          .catch(() => null),
      ]);

      if (!mineResponse?.success) {
        throw new Error(mineResponse?.error || 'grammar_books_load_failed');
      }
      setBooks(mineResponse.books ?? []);
      if (publishedResponse?.success) {
        setPublishedBooks(publishedResponse.books ?? []);
      }
    } catch (error) {
      console.error('Failed to load grammar books for sharing:', error);
      setLoadError('語法問題集を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [isPro, user]);

  useEffect(() => {
    if (authLoading || !user || !isPro) return;
    void loadBooks();
  }, [authLoading, isPro, loadBooks, user]);

  const handlePublish = async () => {
    if (!selectedBook || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/grammar/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: selectedBook.id, publish: true }),
      });
      const payload = await response.json().catch(() => null) as PublishResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'publish_failed');
      }
      showToast({ message: '語法問題集を共有しました', type: 'success' });
      setSelectedId(null);
      router.push('/shared');
    } catch (error) {
      const message = error instanceof Error && error.message !== 'publish_failed'
        ? error.message
        : '共有に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleStopShare = async (book: PublicGrammarBookCard) => {
    if (stoppingId) return;
    if (confirmingStopId !== book.id) {
      triggerHaptic();
      setConfirmingStopId(book.id);
      return;
    }
    setStoppingId(book.id);
    try {
      const response = await fetch(`/api/grammar/share?bookId=${encodeURIComponent(book.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'unpublish_failed');
      }
      setPublishedBooks((current) => current.filter((item) => item.id !== book.id));
      setConfirmingStopId(null);
      showToast({ message: '共有を停止しました', type: 'success' });
    } catch (error) {
      const message = error instanceof Error && error.message !== 'unpublish_failed'
        ? error.message
        : '共有の停止に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setStoppingId(null);
    }
  };

  const publishedSection = user && isPro && publishedBooks.length > 0 ? (
    <div>
      <div className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <Icon name="public" size={13} />
        共有中の語法問題集
        <span className="tabular-nums">{publishedBooks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {publishedBooks.map((book) => (
          <PublishedGrammarRow
            key={book.id}
            book={book}
            confirming={confirmingStopId === book.id}
            stopping={stoppingId === book.id}
            onStop={() => void handleStopShare(book)}
            onCancel={() => setConfirmingStopId(null)}
          />
        ))}
      </div>
    </div>
  ) : null;

  // ログイン/Pro/読込などのゲート状態。null なら選択リストを表示できる。
  const gateState = authLoading ? (
    <CenterState icon="progress_activity" spin message="確認中..." />
  ) : !user ? (
    <ActionState
      icon="login"
      message="ログインすると語法問題集を共有できます。"
      actionLabel="ログイン"
      onAction={() => router.push('/login?redirect=/shared/share-grammar')}
    />
  ) : !isPro ? (
    <ActionState
      icon="auto_awesome"
      message="語法問題集の共有はProプラン限定です。"
      actionLabel="Proを見る"
      onAction={() => router.push('/subscription')}
    />
  ) : loading ? (
    <CenterState icon="progress_activity" spin message="読み込み中..." />
  ) : loadError ? (
    <div className="px-[18px] pt-6">
      <div className="rounded-[12px] border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
        {loadError}
        <button type="button" className="ml-2 underline" onClick={() => void loadBooks()}>再読み込み</button>
      </div>
    </div>
  ) : selectableBooks.length === 0 ? (
    <div className="px-[18px] pt-10 text-center text-sm font-bold text-[var(--color-muted)]">
      {books.length === 0 ? '共有できる語法問題集がありません' : 'すべての問題集を共有済みです'}
    </div>
  ) : null;

  const selectionList = gateState === null ? (
    <div className="flex flex-col gap-2.5">
      {publishedBooks.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          <Icon name="add" size={13} />
          新しく共有する
        </div>
      )}
      {selectableBooks.map((book) => {
        const selected = selectedId === book.id;
        return (
          <button
            key={book.id}
            type="button"
            onClick={() => setSelectedId(book.id)}
            className="flex items-center gap-3 rounded-[14px] border-2 bg-white px-3 py-3 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
            style={{ borderColor: selected ? 'var(--color-accent)' : 'var(--solid-ink)' }}
          >
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] bg-[var(--color-paper)] text-[var(--solid-ink)]">
              <Icon name="rule" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{book.title}</span>
              <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                {book.questionCount}問
              </span>
            </span>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
              style={{
                borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
                background: selected ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {selected && <Icon name="check" size={14} className="text-white" />}
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  const publishForm = (
    <>
      <p className="mb-2.5 m-0 text-[11px] leading-[1.7] text-[var(--color-muted)]">
        共有すると、共有ページの「語法」から誰でも見つけて取り込めるようになります。
      </p>
      <button
        type="button"
        onClick={() => void handlePublish()}
        disabled={!selectedBook || saving}
        className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-45"
      >
        <Icon name={saving ? 'progress_activity' : 'ios_share'} size={17} className={saving ? 'animate-spin' : undefined} />
        {saving ? '共有中...' : selectedBook ? `「${selectedBook.title}」を共有` : '問題集を選択'}
      </button>
    </>
  );

  const showPublishPanel = Boolean(user && isPro && selectableBooks.length > 0 && gateState === null);

  return (
    <>
      {/* Desktop: サイドバー付きの標準シェル。公開フォームは右カラムに常設 */}
      <div className="hidden h-screen lg:block">
        <div className="ds-app">
          <DesktopSidebar />
          <div className="ds-main">
            <div className="ds-top">
              <button
                type="button"
                className="ds-iconbtn"
                onClick={() => router.back()}
                style={{ width: 38, height: 38 }}
                aria-label="戻る"
              >
                <Icon name="arrow_back" />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="crumb">共有ライブラリ / 共有</div>
                <h1>共有する語法問題集を選ぶ</h1>
              </div>
            </div>
            <div
              className="ds-scroll"
              style={{
                display: 'grid',
                gridTemplateColumns: showPublishPanel ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
                gap: 26,
                alignItems: 'start',
                width: 'min(100%, 940px)',
                margin: '0 auto',
              }}
            >
              <div className="flex flex-col gap-5">
                {publishedSection}
                {gateState}
                {selectionList}
              </div>
              {showPublishPanel && (
                <div className="ds-card" style={{ position: 'sticky', top: 0, padding: '18px 20px' }}>
                  {publishForm}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[150px] font-[var(--font-body)] lg:hidden">
        <div className="flex items-center gap-3 px-[18px] pb-2 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="戻る"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="chevron_left" size={18} />
          </button>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">SHARE</div>
            <div className="font-display text-[20px] font-extrabold leading-[1.1] text-[var(--solid-ink)]">共有する語法問題集を選ぶ</div>
          </div>
        </div>

        {publishedSection && <div className="px-[14px] pt-2">{publishedSection}</div>}
        {gateState}
        {selectionList && <div className="px-[14px] pt-3">{selectionList}</div>}

        {showPublishPanel && (
          <div
            className="fixed bottom-0 left-0 right-0 z-30 border-t-2 border-[var(--solid-ink)] bg-[var(--color-paper)] px-4 pt-3"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            {publishForm}
          </div>
        )}
      </div>
    </>
  );
}

function PublishedGrammarRow({
  book,
  confirming,
  stopping,
  onStop,
  onCancel,
}: {
  book: PublicGrammarBookCard;
  confirming: boolean;
  stopping: boolean;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-paper)] text-[var(--solid-ink)]">
        <Icon name="rule" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[14px] font-bold text-[var(--solid-ink)]">{book.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-0.5"><Icon name="quiz" size={12} />{book.questionCount}問</span>
          {book.importCount > 0 && (
            <span className="inline-flex items-center gap-0.5"><Icon name="download" size={12} />{book.importCount}</span>
          )}
        </span>
      </span>

      {stopping ? (
        <span className="inline-flex h-8 items-center gap-1 rounded-[9px] border-2 border-[var(--color-border)] px-2.5 text-[12px] font-bold text-[var(--color-muted)]">
          <Icon name="progress_activity" size={14} className="animate-spin" />
        </span>
      ) : confirming ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded-[9px] border-2 border-[var(--color-border)] bg-white px-2.5 text-[12px] font-bold text-[var(--color-muted)]"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-8 items-center gap-1 rounded-[9px] border-2 border-red-700 bg-red-700 px-2.5 text-[12px] font-extrabold text-white"
          >
            <Icon name="link_off" size={14} />
            停止する
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] border-2 border-red-700 bg-white px-2.5 text-[12px] font-bold text-red-700 transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="link_off" size={14} />
          共有停止
        </button>
      )}
    </div>
  );
}

function CenterState({ icon, message, spin = false }: { icon: string; message: string; spin?: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 px-6 py-16 text-sm font-bold text-[var(--color-muted)]">
      <Icon name={icon} size={18} className={spin ? 'animate-spin' : undefined} />
      {message}
    </div>
  );
}

function ActionState({
  icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="px-[18px] pt-10">
      <div className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-6 text-center">
        <Icon name={icon} size={30} className="text-[var(--solid-ink)]" />
        <div className="mt-3 text-[14px] font-bold text-[var(--solid-ink)]">{message}</div>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-2.5 text-[13px] font-extrabold text-white"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
