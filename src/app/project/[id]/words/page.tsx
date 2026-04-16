'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  flushAllPendingStatusWrites,
  scheduleWordStatusWrite,
} from '@/lib/db/debounced-status-write';
import { useParams, useRouter } from 'next/navigation';
import { DeleteConfirmModal, Icon } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { WordList } from '@/components/home';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { invalidateHomeCache } from '@/lib/home-cache';
import { getNextVocabularyType } from '@/lib/vocabulary-type';
import type { Project, Word, SubscriptionStatus } from '@/types';

export default function WordListPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, loading: authLoading } = useAuth();
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
  const [manualWordPartOfSpeech, setManualWordPartOfSpeech] = useState('');
  const [manualWordExampleSentence, setManualWordExampleSentence] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);
  const [manualWordSavingMessage, setManualWordSavingMessage] = useState<string | undefined>(undefined);

  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  // Flush any debounced checkbox status writes before the tab unloads or
  // the user navigates away.
  useEffect(() => {
    const flush = () => { flushAllPendingStatusWrites(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  // Load project and words
  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      try {
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
      await repository.updateWord(wordId, { english, japanese });
      setWords(prev => prev.map(w => (
        w.id === wordId
          ? {
              ...w,
              english,
              japanese,
            }
          : w
      )));
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

  const handleCycleVocabularyType = async (wordId: string) => {
    const word = words.find((item) => item.id === wordId);
    if (!word) return;

    const nextVocabularyType = getNextVocabularyType(word.vocabularyType);

    setWords((prev) =>
      prev.map((item) => (
        item.id === wordId
          ? { ...item, vocabularyType: nextVocabularyType }
          : item
      ))
    );

    try {
      try {
        sessionStorage.removeItem(`quiz_state_${projectId}`);
      } catch {
        /* ignore */
      }
      await repository.updateWord(wordId, { vocabularyType: nextVocabularyType });
    } catch (error) {
      console.error('Failed to update vocabulary type:', error);
      setWords((prev) =>
        prev.map((item) => (
          item.id === wordId
            ? { ...item, vocabularyType: word.vocabularyType }
            : item
        ))
      );
      showToast({ message: '語彙モードの更新に失敗しました', type: 'error' });
    }
  };

  const handleStatusChange = async (wordId: string, newStatus: import('@/types').WordStatus) => {
    const current = words.find(w => w.id === wordId);
    if (!current) return;
    const currentStatus = current.status;
    setWords(prev => prev.map(w => w.id === wordId ? { ...w, status: newStatus } : w));
    scheduleWordStatusWrite({
      wordId,
      currentStatus,
      newStatus,
      writer: async (finalStatus, originalStatus) => {
        try {
          await repository.updateWord(wordId, { status: finalStatus });
        } catch (error) {
          console.error('Failed to update status:', error);
          setWords(prev => prev.map(w => w.id === wordId ? { ...w, status: originalStatus } : w));
        }
      },
    });
  };

  const handleSaveManualWord = async () => {
    const english = manualWordEnglish.trim();
    const japanese = manualWordJapanese.trim();
    if (!english || !japanese || !project) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    const userPos = manualWordPartOfSpeech.trim();
    const userExample = manualWordExampleSentence.trim();

    setManualWordSaving(true);
    setManualWordSavingMessage('情報を生成中...');

    let enrichedPronunciation = '';
    let enrichedPartOfSpeechTags: string[] = userPos ? [userPos] : [];
    let enrichedExampleSentence = userExample;
    let enrichedExampleSentenceJa = '';

    try {
      const enrichResponse = await fetch('/api/words/enrich-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          english,
          japanese,
          ...(userPos ? { partOfSpeechTags: [userPos] } : {}),
          ...(userExample ? { exampleSentence: userExample } : {}),
        }),
      });

      if (enrichResponse.ok) {
        const data = (await enrichResponse.json()) as {
          success?: boolean;
          enriched?: {
            pronunciation?: string;
            partOfSpeechTags?: string[];
            exampleSentence?: string;
            exampleSentenceJa?: string;
          };
        };
        if (data.success && data.enriched) {
          enrichedPronunciation = data.enriched.pronunciation ?? '';
          if (data.enriched.partOfSpeechTags && data.enriched.partOfSpeechTags.length > 0) {
            enrichedPartOfSpeechTags = data.enriched.partOfSpeechTags;
          }
          if (!enrichedExampleSentence && data.enriched.exampleSentence) {
            enrichedExampleSentence = data.enriched.exampleSentence;
          }
          enrichedExampleSentenceJa = data.enriched.exampleSentenceJa ?? '';
        }
      }
    } catch (enrichError) {
      console.warn('[manual-word] enrich error:', enrichError);
    }

    // enrich 結果が返った時点で即座に UI に反映し、モーダルを閉じる
    const optimisticWord: Word = {
      id: crypto.randomUUID(),
      projectId,
      english,
      japanese,
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      pronunciation: enrichedPronunciation || undefined,
      partOfSpeechTags: enrichedPartOfSpeechTags.length > 0 ? enrichedPartOfSpeechTags : undefined,
      exampleSentence: enrichedExampleSentence || undefined,
      exampleSentenceJa: enrichedExampleSentenceJa || undefined,
      status: 'new',
      createdAt: new Date().toISOString(),
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
      isFavorite: false,
    };

    setWords(prev => [optimisticWord, ...prev]);
    showToast({ message: '単語を追加しました', type: 'success' });
    setManualWordEnglish('');
    setManualWordJapanese('');
    setManualWordPartOfSpeech('');
    setManualWordExampleSentence('');
    setShowManualWordModal(false);
    setManualWordSaving(false);
    setManualWordSavingMessage(undefined);
    refreshWordCount();

    // バックグラウンドで DB に永続化
    repository.createWords([{
      projectId,
      english,
      japanese,
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      ...(enrichedPronunciation ? { pronunciation: enrichedPronunciation } : {}),
      ...(enrichedPartOfSpeechTags.length > 0 ? { partOfSpeechTags: enrichedPartOfSpeechTags } : {}),
      ...(enrichedExampleSentence ? { exampleSentence: enrichedExampleSentence } : {}),
      ...(enrichedExampleSentenceJa ? { exampleSentenceJa: enrichedExampleSentenceJa } : {}),
    }]).then((created) => {
      if (created && created.length > 0) {
        setWords(prev => prev.map(w => w.id === optimisticWord.id ? created[0]! : w));
      }
      invalidateHomeCache();
    }).catch((error) => {
      console.error('Failed to save word:', error);
      setWords(prev => prev.filter(w => w.id !== optimisticWord.id));
      showToast({ message: '単語の保存に失敗しました', type: 'error' });
      refreshWordCount();
    });
  };

  if (loading || authLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </>
    );
  }

  return (
    <>
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
          onCycleVocabularyType={handleCycleVocabularyType}
          onStatusChange={handleStatusChange}
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
          setManualWordPartOfSpeech('');
          setManualWordExampleSentence('');
        }}
        onConfirm={handleSaveManualWord}
        isLoading={manualWordSaving}
        loadingMessage={manualWordSavingMessage}
        english={manualWordEnglish}
        setEnglish={setManualWordEnglish}
        japanese={manualWordJapanese}
        setJapanese={setManualWordJapanese}
        partOfSpeech={manualWordPartOfSpeech}
        setPartOfSpeech={setManualWordPartOfSpeech}
        exampleSentence={manualWordExampleSentence}
        setExampleSentence={setManualWordExampleSentence}
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
    </>
  );
}
