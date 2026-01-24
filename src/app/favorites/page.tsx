'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import { getGuestUserId } from '@/lib/utils';
import type { Word, SubscriptionStatus } from '@/types';

interface FavoriteWord extends Word {
  projectTitle: string;
}

export default function FavoritesPage() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const [favorites, setFavorites] = useState<FavoriteWord[]>([]);
  const [loading, setLoading] = useState(true);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  useEffect(() => {
    if (authLoading) return;

    const loadFavorites = async () => {
      try {
        const userId = isPro && user ? user.id : getGuestUserId();
        const projects = await repository.getProjects(userId);
        const allFavorites: FavoriteWord[] = [];

        for (const project of projects) {
          const words = await repository.getWords(project.id);
          const favoriteWords = words
            .filter((w) => w.isFavorite)
            .map((w) => ({
              ...w,
              projectTitle: project.title,
            }));
          allFavorites.push(...favoriteWords);
        }

        setFavorites(allFavorites);
      } catch (error) {
        console.error('Failed to load favorites:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFavorites();
  }, [user, isPro, repository, authLoading]);

  const handleToggleFavorite = async (wordId: string) => {
    await repository.updateWord(wordId, { isFavorite: false });
    setFavorites((prev) => prev.filter((w) => w.id !== wordId));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 fill-red-500 text-red-500" />
              <h1 className="text-lg font-semibold">苦手な単語</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {favorites.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              苦手な単語はありません
            </h2>
            <p className="text-gray-500 mb-6">
              クイズ中にハートをタップして
              <br />
              苦手な単語をマークしましょう
            </p>
            <Link href="/">
              <Button variant="secondary">
                <BookOpen className="w-4 h-4 mr-2" />
                単語帳を見る
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-red-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-600 text-sm font-medium">苦手な単語</p>
                  <p className="text-2xl font-bold text-red-700">{favorites.length}語</p>
                </div>
                <Heart className="w-10 h-10 fill-red-200 text-red-200" />
              </div>
            </div>

            <div className="space-y-2">
              {favorites.map((word) => (
                <div
                  key={word.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 group hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900">{word.english}</p>
                        <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                      </div>
                      <p className="text-gray-600">{word.japanese}</p>
                      <Link
                        href={`/project/${word.projectId}`}
                        className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                      >
                        {word.projectTitle}
                      </Link>
                    </div>
                    <button
                      onClick={() => handleToggleFavorite(word.id)}
                      className="p-2 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="苦手を解除"
                    >
                      <Heart className="w-5 h-5 fill-red-500 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
