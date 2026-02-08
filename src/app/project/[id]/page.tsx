'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { DeleteConfirmModal, AppShell, Icon, type ProgressStep } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { StudyModeCard, WordList } from '@/components/home';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import { processImageFile } from '@/lib/image-utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { Project, Word, SubscriptionStatus } from '@/types';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';

const ScanModeModal = dynamic(
  () => import('@/components/home/ScanModeModal').then(mod => ({ default: mod.ScanModeModal })),
  { ssr: false }
);

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
  const defaultRepository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which repository the project was loaded from
  const [activeRepository, setActiveRepository] = useState<typeof defaultRepository>(defaultRepository);
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

  // Delete project state
  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  // Project name edit state
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editNameSaving, setEditNameSaving] = useState(false);

  // Scan-to-add state
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [selectedScanMode, setSelectedScanMode] = useState<ExtractMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  // Load from local IndexedDB immediately (no auth needed), then update from remote
  const hasLocalLoadedRef = useRef(false);

  // Phase 1: Instant local load (runs once, no auth dependency)
  useEffect(() => {
    if (hasLocalLoadedRef.current) return;
    hasLocalLoadedRef.current = true;

    (async () => {
      try {
        let loadedProject = await localRepository.getProject(projectId);
        if (!loadedProject) {
          // Try listing all local projects to find it
          const guestId = getGuestUserId();
          const allLocal = await localRepository.getProjects(guestId);
          loadedProject = allLocal.find((p) => p.id === projectId);
        }

        if (loadedProject) {
          setProject(loadedProject);
          setActiveRepository(localRepository);
          const localWords = await localRepository.getWords(projectId);
          setWords(localWords);
          setLoading(false);
        }
      } catch (e) {
        console.error('Local load failed:', e);
      }
    })();
  }, [projectId]);

  // Phase 2: Remote update after auth resolves (Pro users)
  useEffect(() => {
    if (authLoading) return;

    (async () => {
      try {
        const userId = isPro && user ? user.id : getGuestUserId();

        // For non-Pro users, if local already loaded, we're done
        if (!user) {
          // Still need to handle case where local didn't find anything
          if (!project) {
            const localProject = await localRepository.getProject(projectId);
            if (localProject) {
              setProject(localProject);
              setActiveRepository(localRepository);
              const localWords = await localRepository.getWords(projectId);
              setWords(localWords);
            }
          }
          setLoading(false);
          return;
        }

        // Pro user: try remote for latest data
        let remoteProject: Project | undefined;
        try {
          remoteProject = await remoteRepository.getProject(projectId);
        } catch (e) {
          console.error('Remote lookup failed:', e);
        }

        if (remoteProject) {
          setProject(remoteProject);
          setActiveRepository(remoteRepository);
          const remoteWords = await remoteRepository.getWords(projectId);
          setWords(remoteWords);
        } else if (!project) {
          // Remote didn't have it either, try default repository as last resort
          const fallback = await defaultRepository.getProject(projectId);
          if (fallback) {
            setProject(fallback);
            setActiveRepository(defaultRepository);
            const fallbackWords = await defaultRepository.getWords(projectId);
            setWords(fallbackWords);
          }
        }
      } catch (error) {
        console.error('Failed to load project from remote:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, isPro, user, defaultRepository, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan-to-add handlers
  const handleScanModeSelect = (mode: ExtractMode, eikenLevel: EikenLevel) => {
    if ((mode === 'circled' || mode === 'highlighted' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      setShowScanModeModal(false);
      router.push('/subscription');
      return;
    }
    setSelectedScanMode(mode);
    setSelectedEikenLevel(eikenLevel);
    scanFileInputRef.current?.click();
  };

  const handleScanFiles = async (files: File[]) => {
    setShowScanModeModal(false);
    if (!files.length || !project) return;

    // Set existing project id so /scan/confirm adds to this project
    sessionStorage.setItem('scanvocab_existing_project_id', project.id);
    sessionStorage.removeItem('scanvocab_project_name');

    const totalFiles = files.length;
    setProcessing(true);

    if (totalFiles === 1) {
      // Single file flow
      setProcessingSteps([
        { id: 'upload', label: '画像をアップロード中...', status: 'active' },
        { id: 'analyze', label: '文字を解析中...', status: 'pending' },
      ]);

      try {
        const processedFile = await processImageFile(files[0]);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            if (!result || !result.includes(',')) {
              reject(new Error('画像データの読み取りに失敗しました'));
              return;
            }
            resolve(result);
          };
          reader.onerror = () => reject(new Error('ファイルの読み取りに失敗しました'));
          reader.readAsDataURL(processedFile);
        });

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'analyze', label: '文字を解析中...', status: 'active' },
        ]);

        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mode: selectedScanMode, eikenLevel: selectedEikenLevel }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || '解析に失敗しました');
        }

        sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(result.words));
        router.push('/scan/confirm');
        setProcessing(false);
      } catch (error) {
        console.error('Scan error:', error);
        setProcessingSteps(prev => prev.map(s =>
          s.status === 'active' || s.status === 'pending'
            ? { ...s, status: 'error', label: error instanceof Error ? error.message : '予期しないエラー' }
            : s
        ));
      }
    } else {
      // Multi-file flow
      const initialSteps: ProgressStep[] = files.map((_, i) => ({
        id: `file-${i}`,
        label: `画像 ${i + 1}/${totalFiles} を処理中...`,
        status: i === 0 ? 'active' : 'pending',
      }));
      setProcessingSteps(initialSteps);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allWords: any[] = [];

        for (let i = 0; i < files.length; i++) {
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx < i ? 'complete' : idx === i ? 'active' : 'pending',
            label: idx === i ? `画像 ${i + 1}/${totalFiles} を処理中...` : s.label,
          })));

          let processedFile: File;
          try {
            processedFile = await processImageFile(files[i]);
          } catch {
            setProcessingSteps(prev => prev.map((s, idx) => ({
              ...s,
              status: idx === i ? 'error' : s.status,
              label: idx === i ? `画像 ${i + 1}: 処理エラー` : s.label,
            })));
            continue;
          }

          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              if (!result || !result.includes(',')) {
                reject(new Error('読み取り失敗'));
                return;
              }
              resolve(result);
            };
            reader.onerror = () => reject(new Error('読み取り失敗'));
            reader.readAsDataURL(processedFile);
          });

          const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mode: selectedScanMode, eikenLevel: selectedEikenLevel }),
          });
          const result = await response.json();

          if (!response.ok || !result.success) {
            setProcessingSteps(prev => prev.map((s, idx) => ({
              ...s,
              status: idx === i ? 'error' : s.status,
              label: idx === i ? `画像 ${i + 1}: エラー` : s.label,
            })));
            continue;
          }

          allWords.push(...result.words);
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx === i ? 'complete' : s.status,
            label: idx === i ? `画像 ${i + 1}/${totalFiles} 完了` : s.label,
          })));
        }

        if (allWords.length === 0) {
          throw new Error('画像から単語を読み取れませんでした');
        }

        sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(allWords));
        router.push('/scan/confirm');
        setProcessing(false);
      } catch (error) {
        console.error('Scan error:', error);
        setProcessingSteps(prev => prev.map(s =>
          s.status === 'active' || s.status === 'pending'
            ? { ...s, status: 'error', label: error instanceof Error ? error.message : '予期しないエラー' }
            : s
        ));
      }
    }
  };

  const handleDeleteWord = (wordId: string) => {
    setDeleteWordTargetId(wordId);
    setDeleteWordModalOpen(true);
  };

  const handleConfirmDeleteWord = async () => {
    if (!deleteWordTargetId) return;

    setDeleteWordLoading(true);
    try {
      await activeRepository.deleteWord(deleteWordTargetId);
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

    await activeRepository.updateWord(wordId, { english, japanese });
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
            await activeRepository.updateWord(wordId, { distractors: data.distractors });
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
    await activeRepository.updateWord(wordId, { isFavorite: newFavorite });
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
      const created = await activeRepository.createWords([
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

  const copyToClipboard = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to legacy copy
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
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
      const copied = await copyToClipboard(shareUrl);
      if (copied) {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
        showToast({ message: '共有リンクをコピーしました', type: 'success' });
      } else {
        window.prompt('共有リンクをコピーしてください', shareUrl);
        showToast({ message: '共有リンクを作成しました', type: 'success' });
      }
    } catch (error) {
      console.error('Failed to share:', error);
      showToast({ message: '共有リンクの生成に失敗しました', type: 'error' });
    } finally {
      setSharing(false);
    }
  };

  // Open edit name modal
  const handleOpenEditNameModal = () => {
    if (project) {
      setEditingName(project.title);
      setShowEditNameModal(true);
    }
  };

  // Save edited project name
  const handleSaveProjectName = async () => {
    if (!project || !editingName.trim()) return;

    setEditNameSaving(true);
    try {
      await activeRepository.updateProject(project.id, { title: editingName.trim() });
      setProject((prev) => (prev ? { ...prev, title: editingName.trim() } : prev));
      showToast({ message: '単語帳名を変更しました', type: 'success' });
      setShowEditNameModal(false);
      invalidateHomeCache();
    } catch (error) {
      console.error('Failed to update project name:', error);
      showToast({ message: '名前の変更に失敗しました', type: 'error' });
    } finally {
      setEditNameSaving(false);
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!project) return;

    setDeleteProjectLoading(true);
    try {
      await activeRepository.deleteProject(project.id);
      invalidateHomeCache();
      refreshWordCount();
      showToast({ message: '単語帳を削除しました', type: 'success' });
      router.push('/');
    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteProjectLoading(false);
      setDeleteProjectModalOpen(false);
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
        <Icon name="progress_activity" size={20} className="animate-spin" />
        <span className="ml-2">読み込み中...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語帳が見つかりません</h1>
        <p className="text-sm text-[var(--color-muted)] mt-2">一覧から選び直してください。</p>
        <Link href="/projects" className="mt-4 px-4 py-2 rounded-full bg-primary text-white font-semibold shadow-lg shadow-primary/20">
          単語帳へ戻る
        </Link>
      </div>
    );
  }

  const returnToProject = encodeURIComponent(`/project/${project.id}`);

  return (
    <AppShell>
      <div className="pb-28 lg:pb-8">
        <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
          <div className="max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">{project.title}</h1>
                <button
                  onClick={handleOpenEditNameModal}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-[var(--color-surface)] transition-colors text-[var(--color-muted)]"
                  aria-label="単語帳名を編集"
                >
                  <Icon name="edit" size={16} />
                </button>
                {isPro && (
                  <span className="chip chip-pro px-2 py-1 text-xs">
                    <Icon name="auto_awesome" size={12} />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-muted)]">{stats.total}語 / 習得 {stats.mastered}語</p>
            </div>
            <div className="flex items-center gap-2">
              {isPro && (
                <button
                  onClick={handleShare}
                  className="w-9 h-9 rounded-full border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)]"
                >
                  {sharing ? (
                    <Icon name="progress_activity" size={16} className="animate-spin text-[var(--color-muted)]" />
                  ) : shareCopied ? (
                    <Icon name="check" size={18} className="text-[var(--color-success)]" />
                  ) : (
                    <Icon name="share" size={18} />
                  )}
                </button>
              )}
              <button
                onClick={() => setDeleteProjectModalOpen(true)}
                className="w-9 h-9 rounded-full border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-error)] hover:border-[var(--color-error)] transition-colors"
                aria-label="単語帳を削除"
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 py-6 space-y-6">
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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StudyModeCard
                  title="クイズ"
                  description="4択で意味を確認"
                  icon="quiz"
                  href={`/quiz/${project.id}?from=${returnToProject}`}
                  variant="primary"
                  disabled={words.length === 0}
                />
                <StudyModeCard
                  title="カード"
                  description="スワイプで復習"
                  icon="style"
                  href={isPro ? `/flashcard/${project.id}?from=${returnToProject}` : '/subscription'}
                  variant="blue"
                  disabled={words.length === 0}
                  badge={!isPro ? 'Pro' : undefined}
                />
                <StudyModeCard
                  title="例文クイズ"
                  description="例文で記憶を定着"
                  icon="auto_awesome"
                  href={isPro ? `/sentence-quiz/${project.id}?from=${returnToProject}` : '/subscription'}
                  variant="orange"
                  disabled={words.length === 0}
                  badge={!isPro ? 'Pro' : undefined}
                />
                <StudyModeCard
                  title="音声クイズ"
                  description="聞いて書く練習"
                  icon="headphones"
                  href={isPro ? `/dictation?projectId=${project.id}` : '/subscription'}
                  variant="purple"
                  disabled={words.length < 10}
                  badge={!isPro ? 'Pro' : undefined}
                />
              </div>
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
                onScanClick={() => setShowScanModeModal(true)}
              />
            </section>
          )}

          {activeTab === 'stats' && (
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <DeleteConfirmModal
        isOpen={deleteProjectModalOpen}
        onClose={() => setDeleteProjectModalOpen(false)}
        onConfirm={handleConfirmDeleteProject}
        title="単語帳を削除"
        message="この単語帳とすべての単語が削除されます。この操作は取り消せません。"
        isLoading={deleteProjectLoading}
      />

      <WordLimitModal
        isOpen={showWordLimitModal}
        onClose={() => setShowWordLimitModal(false)}
        currentCount={totalWordCount}
      />

      {/* Edit Project Name Modal */}
      {showEditNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-[var(--color-background)] rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-4">単語帳名を編集</h2>

            <div>
              <label className="block text-sm font-medium text-[var(--color-muted)] mb-1">
                単語帳名
              </label>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="単語帳名"
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditNameModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold hover:bg-[var(--color-surface)] transition-colors"
                disabled={editNameSaving}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveProjectName}
                disabled={editNameSaving || !editingName.trim()}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {editNameSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hidden file input for scan-to-add */}
      <input
        ref={scanFileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.pdf,application/pdf"
        multiple
        onChange={(e) => {
          setShowScanModeModal(false);
          const files = e.target.files;
          if (files && files.length > 0) {
            handleScanFiles(Array.from(files));
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      <ScanModeModal
        isOpen={showScanModeModal}
        onClose={() => setShowScanModeModal(false)}
        onSelectMode={handleScanModeSelect}
        isPro={isPro}
      />

      {/* Processing modal */}
      {processing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="text-base font-bold text-center text-[var(--color-foreground)] mb-4">
              スキャン中...
            </h2>
            <div className="space-y-3">
              {processingSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-3">
                  {step.status === 'active' && (
                    <Icon name="progress_activity" size={18} className="animate-spin text-[var(--color-primary)]" />
                  )}
                  {step.status === 'complete' && (
                    <Icon name="check_circle" size={18} className="text-[var(--color-success)]" />
                  )}
                  {step.status === 'pending' && (
                    <Icon name="radio_button_unchecked" size={18} className="text-[var(--color-muted)]" />
                  )}
                  {step.status === 'error' && (
                    <Icon name="error" size={18} className="text-[var(--color-error)]" />
                  )}
                  <span className={`text-sm ${
                    step.status === 'error' ? 'text-[var(--color-error)]' :
                    step.status === 'active' ? 'text-[var(--color-foreground)] font-medium' :
                    'text-[var(--color-muted)]'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
            {processingSteps.some(s => s.status === 'error') && (
              <button
                onClick={() => { setProcessing(false); setProcessingSteps([]); }}
                className="mt-4 w-full px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-muted)] hover:bg-[var(--color-surface)] transition-colors"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </AppShell>
  );
}
