'use client';

/**
 * ホームに表示する語法問題集(Vintage型)一覧を取得するフック。
 * 語法問題集はPro限定機能のため、Pro以外はフェッチせず常に空を返す。
 * useMyGroups と同様にモジュールレベルのキャッシュで二重フェッチを防ぐ。
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { GrammarBook } from '@/components/desktop/DesktopGrammar';

type GrammarBooksApiResponse = {
  success?: boolean;
  books?: GrammarBook[];
};

let cachedBooks: GrammarBook[] | null = null;

export function useHomeGrammarBooks(): { books: GrammarBook[] } {
  const { isAuthenticated, isPro, loading: authLoading } = useAuth();
  const [books, setBooks] = useState<GrammarBook[]>(cachedBooks ?? []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !isPro) return;

    let cancelled = false;
    const load: Promise<GrammarBook[] | null> =
      cachedBooks !== null
        ? Promise.resolve(cachedBooks)
        : fetch('/api/chatgpt/grammar-books?limit=20', { cache: 'no-store' }).then(async (response) => {
            const payload = (await response.json().catch(() => null)) as GrammarBooksApiResponse | null;
            if (!response.ok || !payload?.success) return null;
            cachedBooks = payload.books ?? [];
            return cachedBooks;
          });

    load
      .then((next) => {
        if (!cancelled && next !== null) setBooks(next);
      })
      .catch(() => {
        // best-effort: ホームの語法レールは取得失敗時は単に出さない
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, isPro]);

  return { books: !authLoading && isAuthenticated && isPro ? books : [] };
}
