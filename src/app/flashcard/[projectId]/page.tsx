'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { X, ChevronLeft, ChevronRight, RotateCcw, Flag, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { shuffleArray } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

export default function FlashcardPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, isPro } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

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

    const loadWords = async () => {
      try {
        const wordsData = await repository.getWords(projectId);
        if (wordsData.length === 0) {
          router.push(`/project/${projectId}`);
          return;
        }
        setWords(shuffleArray(wordsData));
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, authLoading, isPro]);

  const currentWord = words[currentIndex];

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleShuffle = () => {
    setWords(shuffleArray([...words]));
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setWords(prev =>
      prev.map((w, i) =>
        i === currentIndex ? { ...w, isFavorite: newFavorite } : w
      )
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">フラッシュカードを準備中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-indigo-50 to-white">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="p-2 hover:bg-white/50 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} / {words.length}
          </span>
        </div>

        <button
          onClick={handleShuffle}
          className="p-2 hover:bg-white/50 rounded-full transition-colors"
          title="シャッフル"
        >
          <RotateCcw className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      {/* Card area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Flashcard */}
        <div
          onClick={handleFlip}
          className="w-full max-w-sm aspect-[3/4] cursor-pointer perspective-1000"
        >
          <div
            className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Front (English) */}
            <div
              className="absolute inset-0 bg-white rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center backface-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <p className="text-3xl font-bold text-gray-900 text-center">
                {currentWord?.english}
              </p>
              <div className="absolute bottom-6 flex items-center gap-2 text-gray-400">
                <Eye className="w-4 h-4" />
                <span className="text-sm">タップで意味を見る</span>
              </div>
            </div>

            {/* Back (Japanese) */}
            <div
              className="absolute inset-0 bg-indigo-600 rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <p className="text-2xl font-bold text-white text-center mb-4">
                {currentWord?.japanese}
              </p>
              {currentWord?.exampleSentence && (
                <div className="mt-4 p-4 bg-white/10 rounded-xl">
                  <p className="text-white/90 text-sm italic text-center">
                    {currentWord.exampleSentence}
                  </p>
                  {currentWord.exampleSentenceJa && (
                    <p className="text-white/70 text-xs text-center mt-1">
                      {currentWord.exampleSentenceJa}
                    </p>
                  )}
                </div>
              )}
              <div className="absolute bottom-6 flex items-center gap-2 text-white/60">
                <EyeOff className="w-4 h-4" />
                <span className="text-sm">タップで戻る</span>
              </div>
            </div>
          </div>
        </div>

        {/* Favorite button */}
        <button
          onClick={handleToggleFavorite}
          className="mt-6 p-3 rounded-full hover:bg-gray-100 transition-colors"
          aria-label={currentWord?.isFavorite ? '苦手を解除' : '苦手にマーク'}
        >
          <Flag
            className={`w-6 h-6 transition-colors ${
              currentWord?.isFavorite
                ? 'fill-orange-500 text-orange-500'
                : 'text-gray-400'
            }`}
          />
        </button>
      </main>

      {/* Navigation */}
      <div className="p-6 flex items-center justify-center gap-8">
        <Button
          variant="secondary"
          size="lg"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="rounded-full w-14 h-14 p-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <Button
          variant="secondary"
          size="lg"
          onClick={handleNext}
          disabled={currentIndex === words.length - 1}
          className="rounded-full w-14 h-14 p-0"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
