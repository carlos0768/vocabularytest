'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon, AppShell } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import type { Word } from '@/types';

interface WordWithProject extends Word {
  projectTitle: string;
}

interface SemanticResult {
  id: string;
  english: string;
  japanese: string;
  projectId: string;
  projectTitle: string;
  similarity: number;
}

type SearchMode = 'text' | 'semantic';

export default function SearchPage() {
  const { user, subscription, isPro } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('text');
  const [allWords, setAllWords] = useState<WordWithProject[]>([]);
  const loadingRef = useRef(false);

  // Semantic search state
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load all projects and words on mount (for text search)
  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    (async () => {
      try {
        const repository = getRepository(subscription?.status ?? 'free');
        const userId = isPro && user ? user.id : getGuestUserId();
        const loadedProjects = await repository.getProjects(userId);

        const wordsArrays = await Promise.all(
          loadedProjects.map(async (project) => {
            const words = await repository.getWords(project.id);
            return words.map(word => ({ ...word, projectTitle: project.title }));
          })
        );

        setAllWords(wordsArrays.flat());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        loadingRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Text search filter
  const filteredWords = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return allWords.filter(
      (word) =>
        word.english.toLowerCase().includes(query) ||
        word.japanese.toLowerCase().includes(query)
    );
  }, [allWords, searchQuery]);

  // Semantic search with debounce
  const performSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim() || !user) return;

    setSemanticLoading(true);
    setSemanticError(null);

    try {
      const response = await fetch('/api/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), userId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSemanticError(data.error || '検索に失敗しました');
        setSemanticResults([]);
        return;
      }

      setSemanticResults(data.results || []);
    } catch {
      setSemanticError('通信エラーが発生しました');
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  }, [user]);

  // Debounced semantic search trigger
  useEffect(() => {
    if (searchMode !== 'semantic') return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchQuery.trim()) {
      setSemanticResults([]);
      setSemanticError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSemanticSearch(searchQuery);
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, searchMode, performSemanticSearch]);

  // Clear results when switching modes
  const handleModeChange = (mode: SearchMode) => {
    if (mode === 'semantic' && !isPro) return;
    setSearchMode(mode);
    setSemanticResults([]);
    setSemanticError(null);
  };

  return (
    <AppShell>
    <div className="min-h-screen bg-[var(--color-background)] pb-24 lg:pb-6">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">検索</h1>
        </div>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        {/* Mode tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleModeChange('text')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              searchMode === 'text'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]'
            }`}
          >
            <Icon name="search" size={16} className="inline-block mr-1.5 -mt-0.5" />
            テキスト検索
          </button>
          <button
            onClick={() => handleModeChange('semantic')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
              searchMode === 'semantic'
                ? 'bg-[var(--color-primary)] text-white'
                : isPro
                  ? 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] opacity-60 cursor-not-allowed'
            }`}
          >
            {isPro ? (
              <Icon name="auto_awesome" size={16} className="inline-block mr-1.5 -mt-0.5" />
            ) : (
              <Icon name="lock" size={16} className="inline-block mr-1.5 -mt-0.5" />
            )}
            意味検索
            {!isPro && (
              <span className="ml-1.5 text-[10px] bg-[var(--color-primary)] text-white px-1.5 py-0.5 rounded-full">
                Pro
              </span>
            )}
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-6">
          <Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchMode === 'text' ? '単語を検索...' : '日本語で意味を検索...'}
            className="w-full pl-12 pr-4 py-3 bg-[var(--color-surface)] border-2 border-[var(--color-border)] rounded-2xl text-base focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            autoFocus
          />
        </div>

        {/* Results */}
        {searchMode === 'text' ? (
          // Text search results
          <>
            {!searchQuery.trim() ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center">
                  <Icon name="search" size={32} className="text-[var(--color-primary)]" />
                </div>
                <p className="text-[var(--color-muted)]">
                  全プロジェクトの単語を横断検索できます
                </p>
                <p className="text-sm text-[var(--color-muted)] mt-1">
                  {allWords.length}語が登録されています
                </p>
              </div>
            ) : filteredWords.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[var(--color-muted)]">
                  「{searchQuery}」に一致する単語がありません
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-muted)] mb-2">
                  {filteredWords.length}件の検索結果
                </p>
                {filteredWords.map((word) => (
                  <div key={word.id} className="card p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--color-foreground)]">
                          {word.english}
                        </p>
                        <p className="text-sm text-[var(--color-muted)]">
                          {word.japanese}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {word.isFavorite && (
                          <Icon name="flag" size={16} filled className="text-[var(--color-primary)]" />
                        )}
                        <span className="text-xs text-[var(--color-muted)] bg-[var(--color-primary-light)] px-2 py-1 rounded-full">
                          {word.projectTitle}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          // Semantic search results
          <>
            {!searchQuery.trim() ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center">
                  <Icon name="auto_awesome" size={32} className="text-[var(--color-primary)]" />
                </div>
                <p className="text-[var(--color-muted)]">
                  日本語で意味を入力すると
                </p>
                <p className="text-[var(--color-muted)]">
                  関連する英単語を見つけます
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-3">
                  例: 「子犬」→ puppy, dog, pet...
                </p>
              </div>
            ) : semanticLoading ? (
              <div className="text-center py-12">
                <Icon name="progress_activity" size={32} className="text-[var(--color-primary)] animate-spin mx-auto mb-3" />
                <p className="text-sm text-[var(--color-muted)]">意味を検索中...</p>
              </div>
            ) : semanticError ? (
              <div className="text-center py-12">
                <p className="text-[var(--color-error)] text-sm">{semanticError}</p>
              </div>
            ) : semanticResults.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[var(--color-muted)]">
                  「{searchQuery}」に関連する単語が見つかりません
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-muted)] mb-2">
                  {semanticResults.length}件の関連単語
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
          </>
        )}
      </main>
    </div>
    </AppShell>
  );
}
