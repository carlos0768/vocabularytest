'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

// 共有された語法問題集の閲覧・取り込みページ。
// 閲覧はログイン必須(プラン不問)、取り込みはPro限定。

type SharedBook = {
  title: string;
  questionCount: number;
  preview: { sentence: string; grammarPoint: string | null }[];
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; book: SharedBook }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export default function GrammarSharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params);
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [proRequired, setProRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/grammar/share/${encodeURIComponent(shareId)}`, { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          book?: SharedBook;
          error?: string;
        };

        if (cancelled) return;

        if (response.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!response.ok || !payload.success || !payload.book) {
          setState({ kind: 'error', message: payload.error || '共有された問題集の取得に失敗しました' });
          return;
        }
        setState({ kind: 'ready', book: payload.book });
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
  }, [shareId]);

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    setImportError(null);
    setProRequired(false);

    try {
      const response = await fetch(`/api/grammar/share/${encodeURIComponent(shareId)}`, { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        book?: { id: string };
        error?: string;
        code?: string;
      };

      if (response.status === 403 && payload.code === 'PRO_REQUIRED') {
        setProRequired(true);
        setImporting(false);
        return;
      }
      if (!response.ok || !payload.success || !payload.book) {
        setImportError(payload.error || '取り込みに失敗しました');
        setImporting(false);
        return;
      }

      router.push(`/grammar/${payload.book.id}`);
    } catch {
      setImportError('通信に失敗しました');
      setImporting(false);
    }
  };

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-12 pt-[calc(env(safe-area-inset-top,0px)+12px)] font-[var(--font-body)] lg:max-w-[720px] lg:px-8 lg:pt-10">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 pt-1">
        <button
          type="button"
          onClick={() => router.push('/grammar')}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="語法問題集へ"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">SHARED GRAMMAR BOOK</div>
      </div>

      {state.kind === 'loading' && (
        <div className="h-[260px] animate-pulse rounded-xl border-2 border-[var(--color-border)] bg-white" />
      )}

      {state.kind === 'not-found' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
            共有された問題集が見つかりません。リンクが無効になっている可能性があります。
          </p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
          <p className="m-0 text-[13px] text-[var(--solid-ink)]">{state.message}</p>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[#faf7f1] text-[var(--solid-ink)]">
              <Icon name="menu_book" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-extrabold leading-[1.3] text-[var(--solid-ink)]">{state.book.title}</div>
              <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[var(--color-muted)]">
                全{state.book.questionCount}問 · 空欄補充 · 英語4択 · 解説つき
              </div>
            </div>
          </div>

          {state.book.preview.length > 0 && (
            <div className="mt-4">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">Preview</div>
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                {state.book.preview.map((question, index) => (
                  <li key={index} className="rounded-lg bg-[#faf7f1] p-3 text-[12px] leading-[1.7] text-[var(--solid-ink)]">
                    {question.sentence}
                    {question.grammarPoint && (
                      <span className="ml-2 rounded-[3px] border border-[var(--solid-ink)] bg-white px-1.5 py-[1px] font-mono text-[9px] font-bold">
                        {question.grammarPoint}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proRequired ? (
            <div className="mt-5">
              <p className="m-0 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
                取り込みはPro限定です。アップグレードすると、この問題集を自分のアカウントに保存して演習できます。
              </p>
              <Link
                href="/subscription"
                className="mt-3 flex h-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white"
              >
                Proプランを見る
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || state.book.questionCount === 0}
              className="mt-5 h-12 w-full rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
            >
              {importing ? '取り込み中...' : '自分の問題集に取り込む'}
            </button>
          )}
          {importError && (
            <p className="m-0 mt-2 text-center text-[11px] text-[#d33]">{importError}</p>
          )}
        </div>
      )}
    </div>
  );
}
