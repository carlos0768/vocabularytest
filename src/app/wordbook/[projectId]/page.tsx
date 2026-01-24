'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Search, Flag, BookOpen, X } from 'lucide-react';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

export default function WordbookPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, isPro } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Load words
  useEffect(() => {
    if (authLoading) return;

    // Redirect non-Pro users
    if (!isPro) {
      router.push('/subscription');
      return;
    }

    const loadData = async () => {
      try {
        const [project, wordsData] = await Promise.all([
          repository.getProject(projectId),
          repository.getWords(projectId),
        ]);

        if (!project) {
          router.push('/');
          return;
        }

        setProjectTitle(project.title);
        // Sort alphabetically
        setWords(wordsData.sort((a, b) => a.english.localeCompare(b.english)));
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, repository, router, authLoading, isPro]);

  const handleToggleFavorite = async (wordId: string) => {
    const word = words.find(w => w.id === wordId);
    if (!word) return;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(wordId, { isFavorite: newFavorite });
    setWords(prev =>
      prev.map(w => (w.id === wordId ? { ...w, isFavorite: newFavorite } : w))
    );
  };

  // Filter words
  const filteredWords = words.filter(word => {
    const matchesSearch =
      searchQuery === '' ||
      word.english.toLowerCase().includes(searchQuery.toLowerCase()) ||
      word.japanese.includes(searchQuery);
    const matchesFavorite = !showFavoritesOnly || word.isFavorite;
    return matchesSearch && matchesFavorite;
  });

  // Group by first letter
  const groupedWords = filteredWords.reduce((acc, word) => {
    const letter = word.english[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(word);
    return acc;
  }, {} as Record<string, Word[]>);

  const letters = Object.keys(groupedWords).sort();
  const favoriteCount = words.filter(w => w.isFavorite).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">単語帳を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-200 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold truncate">{projectTitle}</h1>
              <p className="text-xs text-gray-500">単語帳モード</p>
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <BookOpen className="w-4 h-4" />
              <span>{words.length}語</span>
            </div>
          </div>
        </div>
      </header>

      {/* Search and filter */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="単語を検索..."
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          {favoriteCount > 0 && (
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                showFavoritesOnly
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Flag className={`w-4 h-4 ${showFavoritesOnly ? 'fill-orange-500' : ''}`} />
              {favoriteCount}
            </button>
          )}
        </div>
      </div>

      {/* Word list */}
      <main className="max-w-2xl mx-auto px-4 pb-8">
        {letters.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchQuery ? '検索結果がありません' : '単語がありません'}
          </div>
        ) : (
          <div className="space-y-6">
            {letters.map(letter => (
              <div key={letter}>
                {/* Letter header */}
                <div className="sticky top-[73px] bg-emerald-100/80 backdrop-blur-sm px-3 py-1.5 rounded-lg mb-2 z-30">
                  <span className="text-sm font-bold text-emerald-700">{letter}</span>
                </div>

                {/* Words */}
                <div className="space-y-1">
                  {groupedWords[letter].map(word => (
                    <div
                      key={word.id}
                      className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">{word.english}</p>
                            {word.isFavorite && (
                              <Flag className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                            )}
                          </div>
                          <p className="text-gray-600 mt-0.5">{word.japanese}</p>
                          {word.exampleSentence && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-sm text-gray-500 italic">{word.exampleSentence}</p>
                              {word.exampleSentenceJa && (
                                <p className="text-xs text-gray-400 mt-0.5">{word.exampleSentenceJa}</p>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleToggleFavorite(word.id)}
                          className="p-2 hover:bg-orange-50 rounded-full transition-colors ml-2"
                        >
                          <Flag
                            className={`w-4 h-4 ${
                              word.isFavorite
                                ? 'fill-orange-500 text-orange-500'
                                : 'text-gray-300'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
