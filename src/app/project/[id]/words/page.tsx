'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, DeleteConfirmModal, Icon } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { WordList } from '@/components/home';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import { createBrowserClient } from '@/lib/supabase';
import type { Project, Word, SubscriptionStatus } from '@/types';

type WordInsightResult = {
  wordId: string;
  partOfSpeechTags?: string[];
  relatedWords?: Word['relatedWords'];
  usagePatterns?: Word['usagePatterns'];
  insightsGeneratedAt?: string;
  insightsVersion?: number;
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export default function WordListPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { count: totalWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const [deleteWordTargetId, setDeleteWordTargetId] = useState<string | null>(null);
  const [deleteWordModalOpen, setDeleteWordModalOpen] = useState(false);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);

  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);

  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  // Load project and words
  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      try {
        const userId = user ? user.id : getGuestUserId();

        // Try local first
        let proj = await repository.getProject(projectId);
        if (!proj && user) {
          proj = await remoteRepository.getProject(projectId);
        }
        if (!proj) {
          router.push('/');
          return;
        }
        setProject(proj);

        let wordList = await repository.getWords(projectId);
        if (wordList.length === 0 && user) {
          try {
            wordList = await remoteRepository.getWords(projectId);
          } catch (e) {
            console.error('Remote fallback failed:', e);
          }
        }
        setWords(wordList);
      } catch (error) {
        console.error('Failed to load:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId, repository, router, authLoading, user]);

  const handleDeleteWord = (wordId: string) => {
    setDeleteWordTargetId(wordId);
    setDeleteWordModalOpen(true);
  };

  const handleConfirmDeleteWord = async () => {
    if (!deleteWordTargetId) return;
    setDeleteWordLoading(true);
    try {
      await repository.deleteWord(deleteWordTargetId);
      setWords(prev => prev.filter(w => w.id !== deleteWordTargetId));
      invalidateHomeCache();
      refreshWordCount();
    } catch (error) {
      console.error('Failed to delete word:', error);
    } finally {
      setDeleteWordLoading(false);
      setDeleteWordModalOpen(false);
      setDeleteWordTargetId(null);
    }
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    try {
      const current = words.find((word) => word.id === wordId);
      const englishChanged = Boolean(current && current.english !== english);
      const resetInsightPatch: Partial<Word> = englishChanged
        ? {
            partOfSpeechTags: [],
            relatedWords: [],
            usagePatterns: [],
            insightsVersion: 0,
          }
        : {};

      await repository.updateWord(wordId, { english, japanese, ...resetInsightPatch });
      setWords(prev => prev.map(w => (
        w.id === wordId
          ? {
              ...w,
              english,
              japanese,
              ...(englishChanged
                ? {
                    partOfSpeechTags: [],
                    relatedWords: [],
                    usagePatterns: [],
                    insightsGeneratedAt: undefined,
                    insightsVersion: 0,
                  }
                : {}),
            }
          : w
      )));

      if (englishChanged && isPro) {
        void (async () => {
          try {
            const headers = await getAuthHeaders();
            const response = await fetch('/api/generate-word-insights', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                words: [{ id: wordId, english, japanese }],
                force: true,
              }),
            });

            if (!response.ok) return;
            const data = await response.json() as { success?: boolean; results?: WordInsightResult[] };
            if (!data.success || !Array.isArray(data.results) || data.results.length === 0) return;

            const result = data.results.find((item) => item.wordId === wordId);
            if (!result) return;

            await repository.updateWord(wordId, {
              partOfSpeechTags: result.partOfSpeechTags,
              relatedWords: result.relatedWords,
              usagePatterns: result.usagePatterns,
              insightsGeneratedAt: result.insightsGeneratedAt,
              insightsVersion: result.insightsVersion,
            });

            setWords(prev => prev.map(word =>
              word.id === wordId
                ? {
                    ...word,
                    partOfSpeechTags: result.partOfSpeechTags,
                    relatedWords: result.relatedWords,
                    usagePatterns: result.usagePatterns,
                    insightsGeneratedAt: result.insightsGeneratedAt,
                    insightsVersion: result.insightsVersion,
                  }
                : word
            ));
          } catch (error) {
            console.error('Failed to regenerate word insights:', error);
          }
        })();
      }
    } catch (error) {
      console.error('Failed to update word:', error);
    }
  };

  const handleToggleFavorite = async (wordId: string) => {
    const word = words.find(w => w.id === wordId);
    if (!word) return;
    try {
      await repository.updateWord(wordId, { isFavorite: !word.isFavorite });
      setWords(prev => prev.map(w => w.id === wordId ? { ...w, isFavorite: !w.isFavorite } : w));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleSaveManualWord = async () => {
    if (!manualWordEnglish.trim() || !manualWordJapanese.trim() || !project) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    setManualWordSaving(true);
    try {
      const created = await repository.createWords([{
        projectId,
        english: manualWordEnglish.trim(),
        japanese: manualWordJapanese.trim(),
        distractors: ['選択肢1', '選択肢2', '選択肢3'],
      }]);
      if (created && created.length > 0) {
        setWords(prev => [...created, ...prev]);
        invalidateHomeCache();
        refreshWordCount();
        showToast({ message: '単語を追加しました', type: 'success' });

        if (isPro) {
          void (async () => {
            try {
              const headers = await getAuthHeaders();
              const response = await fetch('/api/generate-word-insights', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  words: created.map((word) => ({
                    id: word.id,
                    english: word.english,
                    japanese: word.japanese,
                  })),
                }),
              });

              if (!response.ok) return;
              const data = await response.json() as { success?: boolean; results?: WordInsightResult[] };
              if (!data.success || !Array.isArray(data.results) || data.results.length === 0) return;

              await Promise.all(data.results.map((result) =>
                repository.updateWord(result.wordId, {
                  partOfSpeechTags: result.partOfSpeechTags,
                  relatedWords: result.relatedWords,
                  usagePatterns: result.usagePatterns,
                  insightsGeneratedAt: result.insightsGeneratedAt,
                  insightsVersion: result.insightsVersion,
                })
              ));

              const insightMap = new Map(data.results.map((result) => [result.wordId, result]));
              setWords(prev => prev.map((word) => {
                const insight = insightMap.get(word.id);
                if (!insight) return word;
                return {
                  ...word,
                  partOfSpeechTags: insight.partOfSpeechTags,
                  relatedWords: insight.relatedWords,
                  usagePatterns: insight.usagePatterns,
                  insightsGeneratedAt: insight.insightsGeneratedAt,
                  insightsVersion: insight.insightsVersion,
                };
              }));
            } catch (error) {
              console.error('Failed to generate word insights:', error);
            }
          })();
        }
      }
      setManualWordEnglish('');
      setManualWordJapanese('');
      setShowManualWordModal(false);
    } catch (error) {
      console.error('Failed to save word:', error);
      showToast({ message: '単語の追加に失敗しました', type: 'error' });
    } finally {
      setManualWordSaving(false);
    }
  };

  if (loading || authLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
          >
            <Icon name="arrow_back" size={20} className="text-[var(--color-foreground)]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">
              {project?.title ?? '単語一覧'}
            </h1>
            <p className="text-xs text-[var(--color-muted)]">{words.length}語</p>
          </div>
          <button
            onClick={() => setShowManualWordModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 rounded-lg hover:bg-[var(--color-primary)]/20 transition-colors"
          >
            <Icon name="add" size={16} />
            追加
          </button>
        </div>

        {/* Word List */}
        <WordList
          words={words}
          editingWordId={editingWordId}
          onEditStart={(wordId) => setEditingWordId(wordId)}
          onEditCancel={() => setEditingWordId(null)}
          onSave={(wordId, english, japanese) => {
            handleUpdateWord(wordId, english, japanese);
            setEditingWordId(null);
          }}
          onDelete={(wordId) => handleDeleteWord(wordId)}
          onToggleFavorite={(wordId) => handleToggleFavorite(wordId)}
          onAddClick={() => setShowManualWordModal(true)}
          onScanClick={() => router.push(`/project/${projectId}`)}
        />
      </div>

      <ManualWordInputModal
        isOpen={showManualWordModal}
        onClose={() => {
          setShowManualWordModal(false);
          setManualWordEnglish('');
          setManualWordJapanese('');
        }}
        onConfirm={handleSaveManualWord}
        isLoading={manualWordSaving}
        english={manualWordEnglish}
        setEnglish={setManualWordEnglish}
        japanese={manualWordJapanese}
        setJapanese={setManualWordJapanese}
      />

      <DeleteConfirmModal
        isOpen={deleteWordModalOpen}
        onClose={() => {
          setDeleteWordModalOpen(false);
          setDeleteWordTargetId(null);
        }}
        onConfirm={handleConfirmDeleteWord}
        title="単語を削除"
        message="この単語を削除します。この操作は取り消せません。"
        isLoading={deleteWordLoading}
      />

      <WordLimitModal
        isOpen={showWordLimitModal}
        onClose={() => setShowWordLimitModal(false)}
        currentCount={totalWordCount}
      />
    </AppShell>
  );
}
