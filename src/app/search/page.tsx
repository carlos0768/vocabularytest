'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Icon, AppShell } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { EMBEDDINGS_ENABLED } from '@/lib/embeddings/feature';
import type { SubscriptionStatus, Word } from '@/types';

interface SemanticResult {
  id: string;
  english: string;
  japanese: string;
  projectId: string;
  projectTitle: string;
  similarity: number;
}

export default function SearchPage() {
  const { user, subscription, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);
  const isSemanticSearchEnabled = EMBEDDINGS_ENABLED && subscriptionStatus === 'active';
  const authResolvingWithoutUser = authLoading && !user;

  // Semantic search state
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const buildLocalResults = useCallback((words: Word[], query: string, projectTitleMap: Map<string, string>): SemanticResult[] => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    const scored = words
      .map((word) => {
        const english = word.english.toLowerCase();
        const japanese = word.japanese.toLowerCase();

        let similarity = 0;
        if (english === trimmed || japanese === trimmed) {
          similarity = 100;
        } else if (english.startsWith(trimmed) || japanese.startsWith(trimmed)) {
          similarity = 92;
        } else if (english.includes(trimmed) || japanese.includes(trimmed)) {
          similarity = 82;
        }

        if (similarity === 0) return null;

        return {
          id: word.id,
          english: word.english,
          japanese: word.japanese,
          projectId: word.projectId,
          projectTitle: projectTitleMap.get(word.projectId) || '',
          similarity,
        };
      })
      .filter((result): result is SemanticResult => result !== null)
      .sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, 50);
  }, []);

  // Search with debounce
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !user) return;

    setSemanticLoading(true);
    setSemanticError(null);

    try {
      if (isSemanticSearchEnabled) {
        const response = await fetch('/api/search/semantic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim() }),
        });

        const data = await response.json();

        if (!response.ok) {
          setSemanticError(data.error || '検索に失敗しました');
          setSemanticResults([]);
          return;
        }

        setSemanticResults(data.results || []);
        return;
      }

      const projects = await repository.getProjects(user.id);
      const wordsByProject = await Promise.all(projects.map((project) => repository.getWords(project.id)));
      const allWords = wordsByProject.flat();
      const projectTitleMap = new Map(projects.map((project) => [project.id, project.title]));
      const localResults = buildLocalResults(allWords, query, projectTitleMap);
      setSemanticResults(localResults);
    } catch {
      setSemanticError('通信エラーが発生しました');
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  }, [user, isSemanticSearchEnabled, repository, buildLocalResults]);

  // Debounced semantic search trigger
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchQuery.trim()) {
      setSemanticResults([]);
      setSemanticError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  return (
    <AppShell>
    <div className="min-h-screen pb-24 lg:pb-6">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">検索</h1>
        </div>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        {/* Search input */}
        <div className="relative mb-6">
          <Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="英語・日本語で検索..."
            className="w-full pl-12 pr-4 py-3 bg-[var(--color-surface)] border-2 border-[var(--color-border)] rounded-2xl text-base focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            autoFocus
          />
        </div>

        {/* Results */}
        {!user && !authLoading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center">
              <Icon name="person" size={32} className="text-[var(--color-primary)]" />
            </div>
            <p className="text-[var(--color-muted)]">
              検索にはログインが必要です
            </p>
          </div>
        ) : !searchQuery.trim() || authResolvingWithoutUser ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center">
              <Icon name="auto_awesome" size={32} className="text-[var(--color-primary)]" />
            </div>
            <p className="text-[var(--color-muted)]">
              英語または日本語を入力すると
            </p>
            <p className="text-[var(--color-muted)]">
              一致する単語を検索できます
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-3">
              例: 「dog」, 「犬」
            </p>
          </div>
        ) : semanticLoading ? (
          <div className="text-center py-12">
            <Icon name="progress_activity" size={32} className="text-[var(--color-primary)] animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--color-muted)]">検索中...</p>
          </div>
        ) : semanticError ? (
          <div className="text-center py-12">
            <p className="text-[var(--color-error)] text-sm">{semanticError}</p>
          </div>
        ) : semanticResults.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--color-muted)]">
              「{searchQuery}」に一致する単語が見つかりません
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)] mb-2">
              {semanticResults.length}件の検索結果
            </p>
            {semanticResults.map((result) => (
              <div key={result.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--color-foreground)]">
                      {result.english}
                    </p>
                    <p className="text-sm text-[var(--color-muted)]">
                      {result.japanese}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-xs font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 rounded-full">
                      {result.similarity}%
                    </span>
                    <span className="text-xs text-[var(--color-muted)] bg-[var(--color-primary-light)] px-2 py-1 rounded-full">
                      {result.projectTitle}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
    </AppShell>
  );
}
