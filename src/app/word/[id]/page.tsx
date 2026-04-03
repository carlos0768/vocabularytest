'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import type { Word, SubscriptionStatus } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  mastered: '習得',
  review: '学習中',
  learning: '学習中',
  new: '未学習',
};

const POS_LABELS: Record<string, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  phrase: '句',
  idiom: 'イディオム',
  phrasal_verb: '句動詞',
  preposition: '前置詞',
  conjunction: '接続詞',
};

export default function WordDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const wordId = params.id as string;
  const from = searchParams.get('from');

  const { subscription, loading: authLoading } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [word, setWord] = useState<Word | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    (async () => {
      try {
        const w = await repository.getWord(wordId);
        setWord(w ?? null);
      } catch (err) {
        console.error('Failed to load word:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [wordId, authLoading, repository]);

  const handleToggleFavorite = useCallback(async () => {
    if (!word) return;
    const newFav = !word.isFavorite;
    try {
      await repository.updateWord(word.id, { isFavorite: newFav });
      setWord((prev) => prev ? { ...prev, isFavorite: newFav } : prev);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [word, repository]);

  const handleSpeak = useCallback(() => {
    if (!word) return;
    const utterance = new SpeechSynthesisUtterance(word.english);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }, [word]);

  const statusLabel = word?.status ? (STATUS_LABELS[word.status] ?? '未学習') : '未学習';
  const posDisplay = word?.partOfSpeechTags?.length
    ? word.partOfSpeechTags.map(p => POS_LABELS[p] ?? p).join('・')
    : null;

  const highlightWord = (sentence: string, target: string) => {
    if (!sentence || !target) return sentence;
    const regex = new RegExp(`(${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = sentence.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <strong key={i} className="font-bold underline decoration-2">{part}</strong> : part
    );
  };

  if (loading) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </>
    );
  }

  if (!word) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語が見つかりません</h1>
          <button onClick={() => router.back()} className="mt-4 px-6 py-2.5 rounded-xl bg-[var(--color-foreground)] text-white font-semibold">
            戻る
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen pb-24">
        {/* Header - iOS style */}
        <header className="px-5 pt-4 pb-2 flex items-center justify-between">
          <button
            onClick={() => from ? router.replace(decodeURIComponent(from)) : router.back()}
            className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center"
          >
            <Icon name="chevron_left" size={24} className="text-[var(--color-foreground)]" />
          </button>
          <button className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center">
            <Icon name="edit" size={18} className="text-[var(--color-foreground)]" />
          </button>
        </header>

        <main className="max-w-lg mx-auto px-5 pt-4 space-y-6">
          {/* Word title + status */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-[var(--color-foreground)]">{word.english}</h1>
              <span className="px-3 py-1 rounded-full bg-[var(--color-surface-secondary)] text-xs font-semibold text-[var(--color-muted)]">
                {statusLabel}
              </span>
            </div>

            {/* Pronunciation + bookmark */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-muted)]">{word.pronunciation || '——'}</span>
                <button onClick={handleSpeak} className="w-8 h-8 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center">
                  <Icon name="volume_up" size={16} className="text-[var(--color-foreground)]" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleToggleFavorite}>
                  <Icon
                    name="bookmark"
                    size={24}
                    filled={word.isFavorite}
                    className={word.isFavorite ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Part of speech + Japanese */}
          <div className="border-t border-[var(--color-border-light)] pt-4">
            <p className="text-base text-[var(--color-foreground)]">
              {posDisplay && <span className="text-[var(--color-muted)]">({posDisplay}) </span>}
              {word.japanese}
            </p>
          </div>

          {/* Example sentence - iOS style */}
          {word.exampleSentence && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--color-foreground)]">例文</h3>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-base text-[var(--color-foreground)] leading-relaxed">
                    {highlightWord(word.exampleSentence, word.english)}
                  </p>
                </div>
                <button onClick={() => {
                  if (!word.exampleSentence) return;
                  const u = new SpeechSynthesisUtterance(word.exampleSentence);
                  u.lang = 'en-US';
                  u.rate = 0.85;
                  speechSynthesis.speak(u);
                }} className="shrink-0 mt-1">
                  <Icon name="volume_up" size={20} className="text-[var(--color-muted)]" />
                </button>
              </div>
              {word.exampleSentenceJa && (
                <p className="text-sm text-[var(--color-muted)]">{word.exampleSentenceJa}</p>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
