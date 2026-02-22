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
import type { Project, Word, SubscriptionStatus } from '@/types';

export default function WordListPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { count: totalWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

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
      await repository.updateWord(wordId, { english, japanese });
      setWords(prev => prev.map(w => w.id === wordId ? { ...w, english, japanese } : w));
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

    if (!canAddWords && !isPro) {
      setShowManualWordModal(false);
      setShowWordLimitModal(true);
      return;
    }

    setManualWordSaving(true);
    try {
      const newWord = await repository.createWords(projectId, [{
        english: manualWordEnglish.trim(),
        japanese: manualWordJapanese.trim(),
      }]);
      if (newWord && newWord.length > 0) {
        setWords(prev => [...prev, ...newWord]);
        invalidateHomeCache();
        refreshWordCount();
        showToast('単語を追加しました', 'success');
      }
      setManualWordEnglish('');
      setManualWordJapanese('');
      setShowManualWordModal(false);
    } catch (error) {
      console.error('Failed to save word:', error);
      showToast('単語の追加に失敗しました', 'error');
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
