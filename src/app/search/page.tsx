'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, BookOpen, Flag } from 'lucide-react';
import { BottomNav } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import type { Project, Word } from '@/types';

interface WordWithProject extends Word {
  projectTitle: string;
}

export default function SearchPage() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [allWords, setAllWords] = useState<WordWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all projects and words
  useEffect(() => {
    const loadData = async () => {
      if (authLoading) return;

      try {
        const repository = getRepository(subscription?.status ?? 'free');
        const userId = isPro && user ? user.id : getGuestUserId();
        const loadedProjects = await repository.getProjects(userId);
        setProjects(loadedProjects);

        // Load all words from all projects
        const wordsWithProjects: WordWithProject[] = [];
        for (const project of loadedProjects) {
          const words = await repository.getWords(project.id);
          words.forEach(word => {
            wordsWithProjects.push({
              ...word,
              projectTitle: project.title,
            });
          });
        }
        setAllWords(wordsWithProjects);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [subscription?.status, authLoading, isPro, user]);

  // Filter words by search query
  const filteredWords = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return allWords.filter(
      (word) =>
        word.english.toLowerCase().includes(query) ||
        word.japanese.toLowerCase().includes(query)
    );
  }, [allWords, searchQuery]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">検索</h1>
        </div>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        {/* Search input */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="単語を検索..."
            className="w-full pl-12 pr-4 py-3 bg-[var(--color-surface)] border-2 border-[var(--color-border)] rounded-2xl text-base focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            autoFocus
          />
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !searchQuery.trim() ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-[var(--color-primary)]" />
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
                      <Flag className="w-4 h-4 fill-[var(--color-peach)] text-[var(--color-peach)]" />
                    )}
                    <span className="text-xs text-[var(--color-muted)] bg-[var(--color-peach-light)] px-2 py-1 rounded-full">
                      {word.projectTitle}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
