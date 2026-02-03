'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Share2, Loader2, Check, BarChart3, BookOpen, Sparkles } from 'lucide-react';
import { BottomNav, DeleteConfirmModal } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { StudyModeCard, WordList } from '@/components/home';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { Project, Word, SubscriptionStatus } from '@/types';

const tabs = [
  { id: 'study', label: '学習' },
  { id: 'words', label: '単語' },
  { id: 'stats', label: '統計' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function ProjectDetailPage() {
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
  const [activeTab, setActiveTab] = useState<TabId>('study');

  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [deleteWordTargetId, setDeleteWordTargetId] = useState<string | null>(null);
  const [deleteWordModalOpen, setDeleteWordModalOpen] = useState(false);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);

  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);

  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  const loadProject = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const userId = isPro && user ? user.id : getGuestUserId();
      const loadedProject = await repository.getProject(projectId);
      if (!loadedProject) {
        const projects = await repository.getProjects(userId);
        const found = projects.find((p) => p.id === projectId) || null;
        setProject(found);
      } else {
        setProject(loadedProject);
      }
      const loadedWords = await repository.getWords(projectId);
      setWords(loadedWords);
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isPro, user, repository, projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleDeleteWord = (wordId: string) => {
    setDeleteWordTargetId(wordId);
    setDeleteWordModalOpen(true);
  };

  const handleConfirmDeleteWord = async () => {
    if (!deleteWordTargetId) return;

    setDeleteWordLoading(true);
    try {
      await repository.deleteWord(deleteWordTargetId);
      setWords((prev) => prev.filter((w) => w.id !== deleteWordTargetId));
      showToast({ message: '単語を削除しました', type: 'success' });
      invalidateHomeCache();
      refreshWordCount();
    } catch (error) {
      console.error('Failed to delete word:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteWordLoading(false);
      setDeleteWordModalOpen(false);
      setDeleteWordTargetId(null);
    }
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    const originalWord = words.find((w) => w.id === wordId);
    const japaneseChanged = originalWord && originalWord.japanese !== japanese;

    await repository.updateWord(wordId, { english, japanese });
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w)));
    setEditingWordId(null);

    if (japaneseChanged) {
      try {
        const response = await fetch('/api/regenerate-distractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ english, japanese }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.distractors) {
            await repository.updateWord(wordId, { distractors: data.distractors });
            setWords((prev) =>
              prev.map((w) => (w.id === wordId ? { ...w, distractors: data.distractors } : w))
            );
          }
        }
      } catch (error) {
        console.error('Failed to regenerate distractors:', error);
      }
    }
  };

  const handleToggleFavorite = async (wordId: string) => {
    const word = words.find((w) => w.id === wordId);
    if (!word) return;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(wordId, { isFavorite: newFavorite });
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, isFavorite: newFavorite } : w)));
  };

  const handleSaveManualWord = async () => {
    if (!project) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    if (!manualWordEnglish.trim() || !manualWordJapanese.trim()) return;

    setManualWordSaving(true);
    try {
      const created = await repository.createWords([
        {
          projectId: project.id,
          english: manualWordEnglish.trim(),
          japanese: manualWordJapanese.trim(),
          distractors: ['選択肢1', '選択肢2', '選択肢3'],
        },
      ]);

      setWords((prev) => [...created, ...prev]);
      showToast({ message: '単語を追加しました', type: 'success' });
      setManualWordEnglish('');
      setManualWordJapanese('');
      setShowManualWordModal(false);
      invalidateHomeCache();
      refreshWordCount();
    } catch (error) {
      console.error('Failed to add word:', error);
      showToast({ message: '単語の追加に失敗しました', type: 'error' });
    } finally {
      setManualWordSaving(false);
    }
  };

  const handleShare = async () => {
    if (!project || !user || !isPro) return;

    setSharing(true);
    try {
      let shareId = project.shareId;
      if (!shareId) {
        shareId = await remoteRepository.generateShareId(project.id);
        setProject((prev) => (prev ? { ...prev, shareId } : prev));
      }
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error('Failed to share:', error);
      showToast({ message: '共有リンクの生成に失敗しました', type: 'error' });
    } finally {
      setSharing(false);
    }
  };

  const stats = useMemo(() => {
    const total = words.length;
    const mastered = words.filter((w) => w.status === 'mastered').length;
    const review = words.filter((w) => w.status === 'review').length;
    const newWords = words.filter((w) => w.status === 'new').length;
    return { total, mastered, review, newWords };
  }, [words]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="ml-2">読み込み中...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">プロジェクトが見つかりません</h1>
        <p className="text-sm text-[var(--color-muted)] mt-2">一覧から選び直してください。</p>
        <Link href="/projects" className="mt-4 px-4 py-2 rounded-full bg-gradient-to-br from-[#FF6B6B] to-[#FFB347] text-white font-semibold">
          プロジェクトへ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)]"
            aria-label="戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">{project.title}</h1>
            <p className="text-xs text-[var(--color-muted)]">{stats.total}語 / 習得 {stats.mastered}語</p>
          </div>
          <div className="flex items-center gap-2">
            {isPro && (
              <button
                onClick={handleShare}
                className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)]"
              >
                {sharing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--color-muted)]" />
                ) : shareCopied ? (
                  <Check className="w-4 h-4 text-[var(--color-success)]" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
              </button>
            )}
            {isPro && (
              <span className="chip chip-pro">
                <Sparkles className="w-3 h-3" />
                Pro
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'study' && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StudyModeCard
                title="クイズ"
                description="4択で意味を確認"
                icon={BookOpen}
                href={`/quiz/${project.id}`}
                variant="red"
                disabled={words.length === 0}
              />
              <StudyModeCard
                title="フラッシュカード"
                description="スワイプで復習"
                icon={BarChart3}
                href={isPro ? `/flashcard/${project.id}` : '/subscription'}
                variant="blue"
                disabled={words.length === 0}
                badge={!isPro ? 'Pro' : undefined}
              />
            </div>
            <StudyModeCard
              title="例文クイズ"
              description="例文で記憶を定着"
              icon={Sparkles}
              href={isPro ? `/sentence-quiz/${project.id}` : '/subscription'}
              variant="orange"
              disabled={words.length === 0}
              badge={!isPro ? 'Pro' : undefined}
            />
            <Link href="/favorites" className="card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">苦手な単語</p>
                <p className="text-xs text-[var(--color-muted)]">フラグ済みの単語を確認</p>
              </div>
              <span className="text-sm text-[var(--color-primary)] font-semibold">一覧へ</span>
            </Link>
          </section>
        )}

        {activeTab === 'words' && (
          <section>
            <WordList
              words={words}
              editingWordId={editingWordId}
              onEditStart={(wordId) => setEditingWordId(wordId)}
              onEditCancel={() => setEditingWordId(null)}
              onSave={(wordId, english, japanese) => handleUpdateWord(wordId, english, japanese)}
              onDelete={(wordId) => handleDeleteWord(wordId)}
              onToggleFavorite={(wordId) => handleToggleFavorite(wordId)}
              onAddClick={() => setShowManualWordModal(true)}
            />
          </section>
        )}

        {activeTab === 'stats' && (
          <section className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-xs text-[var(--color-muted)]">総単語</p>
              <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.total}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--color-muted)]">習得済み</p>
              <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.mastered}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--color-muted)]">復習中</p>
              <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.review}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-[var(--color-muted)]">未学習</p>
              <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.newWords}</p>
            </div>
          </section>
        )}
      </main>

      <BottomNav />

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
    </div>
  );
}
