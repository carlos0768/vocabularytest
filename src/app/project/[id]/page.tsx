'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { DeleteConfirmModal, AppShell, Icon, type ProgressStep } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { ProjectSourceLabels } from '@/components/project/ProjectSourceLabels';
import { VocabularyTab } from '@/components/project/VocabularyTab';
import { StudyModeCard, WordList } from '@/components/home';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import { markProjectVisited } from '@/lib/project-visit';
import { cacheProjectForOffline } from '@/lib/offline/recent-project-offline';
import { expandFilesForScan, isPdfFile, processImageFile, type ImageProcessingProfile } from '@/lib/image-utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { Project, Word, SubscriptionStatus } from '@/types';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';
import { mergeSourceLabels } from '../../../../shared/source-labels';

const ScanModeModal = dynamic(
  () => import('@/components/home/ScanModeModal').then(mod => ({ default: mod.ScanModeModal })),
  { ssr: false }
);

function isOwnedBy(project: Project | undefined | null, expectedUserId: string): project is Project {
  return Boolean(project && project.userId === expectedUserId);
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { aiEnabled } = useUserPreferences();
  const { showToast } = useToast();
  const { count: totalWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const defaultRepository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeRepository, setActiveRepository] = useState<typeof defaultRepository>(defaultRepository);

  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [deleteWordTargetId, setDeleteWordTargetId] = useState<string | null>(null);
  const [deleteWordModalOpen, setDeleteWordModalOpen] = useState(false);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);

  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);

  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editNameSaving, setEditNameSaving] = useState(false);

  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [selectedScanMode, setSelectedScanMode] = useState<ExtractMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  const hasLocalLoadedRef = useRef(false);

  useEffect(() => {
    setWordsLoaded(false);
  }, [projectId]);

  // Phase 1: Local preload after auth resolves to avoid cross-account leakage
  useEffect(() => {
    if (authLoading) return;
    if (hasLocalLoadedRef.current) return;
    hasLocalLoadedRef.current = true;

    (async () => {
      try {
        const expectedUserId = user ? user.id : getGuestUserId();
        const loadedProject = await localRepository.getProject(projectId);

        if (isOwnedBy(loadedProject, expectedUserId)) {
          setProject(loadedProject);
          setActiveRepository(localRepository);
          setLoading(false);
          void (async () => {
            try {
              const localWords = await localRepository.getWords(projectId);
              setWords(localWords);
            } catch (error) {
              console.error('Initial local words load failed:', error);
            } finally {
              setWordsLoaded(true);
            }
          })();
        }
      } catch (e) {
        console.error('Local load failed:', e);
      }
    })();
  }, [authLoading, projectId, user]);

  // Phase 2: Remote update after auth resolves (Pro users)
  useEffect(() => {
    if (authLoading) return;

    (async () => {
      try {
        if (!user) {
          if (!project) {
            const guestUserId = getGuestUserId();
            const localProject = await localRepository.getProject(projectId);
            if (isOwnedBy(localProject, guestUserId)) {
              setProject(localProject);
              setActiveRepository(localRepository);
              const localWords = await localRepository.getWords(projectId);
              setWords(localWords);
              setWordsLoaded(true);
            }
          }
          setLoading(false);
          return;
        }

        let showedLocalProject = false;
        try {
          const localProject = await localRepository.getProject(projectId);
          if (isOwnedBy(localProject, user.id)) {
            setProject(localProject);
            setActiveRepository(localRepository);
            setLoading(false);
            showedLocalProject = true;
            void (async () => {
              try {
                const localWords = await localRepository.getWords(projectId);
                setWords(localWords);
              } catch (error) {
                console.error('Local Pro words preload failed:', error);
              } finally {
                setWordsLoaded(true);
              }
            })();
          }
        } catch (e) {
          console.error('Local Pro project preload failed:', e);
        }

        let remoteProject: Project | undefined;
        if (navigator.onLine) {
          try {
            remoteProject = await remoteRepository.getProject(projectId);
          } catch (e) {
            console.error('Remote lookup failed:', e);
          }
        }

        if (isOwnedBy(remoteProject, user.id)) {
          setProject(remoteProject);
          setActiveRepository(remoteRepository);
          setLoading(false);
          void (async () => {
            try {
              const remoteWords = await remoteRepository.getWords(projectId);
              setWords(remoteWords);
            } catch (error) {
              console.error('Remote words load failed:', error);
            } finally {
              setWordsLoaded(true);
            }
          })();
        } else if (!showedLocalProject) {
          const expectedUserId = user.id;
          const fallback = await defaultRepository.getProject(projectId);
          if (isOwnedBy(fallback, expectedUserId)) {
            setProject(fallback);
            setActiveRepository(defaultRepository);
            setLoading(false);
            void (async () => {
              try {
                const fallbackWords = await defaultRepository.getWords(projectId);
                setWords(fallbackWords);
              } catch (error) {
                console.error('Fallback words load failed:', error);
              } finally {
                setWordsLoaded(true);
              }
            })();
          }
        }
      } catch (error) {
        console.error('Failed to load project from remote:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, isPro, user, defaultRepository, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (project?.id) {
      markProjectVisited(project.id);
      if (user?.id) {
        cacheProjectForOffline(user.id, project.id).catch((error) => {
          console.error('Failed to cache recent project for offline use:', error);
        });
      }
    }
  }, [project?.id, user?.id]);

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

    let scanFiles = files;
    if (files.some((file) => isPdfFile(file))) {
      try {
        scanFiles = await expandFilesForScan(files);
      } catch (error) {
        showToast({
          message: error instanceof Error ? error.message : 'PDFの処理に失敗しました',
          type: 'error',
        });
        return;
      }
    }

    sessionStorage.setItem('scanvocab_existing_project_id', project.id);
    sessionStorage.removeItem('scanvocab_project_name');
    sessionStorage.removeItem('scanvocab_source_labels');

    const totalFiles = scanFiles.length;
    setProcessing(true);

    const extractionProfile: ImageProcessingProfile = selectedScanMode === 'highlighted'
      ? 'highlighted'
      : 'default';

    if (totalFiles === 1) {
      setProcessingSteps([
        { id: 'upload', label: '画像をアップロード中...', status: 'active' },
        { id: 'analyze', label: '文字を解析中...', status: 'pending' },
      ]);

      try {
        const processedFile = await processImageFile(scanFiles[0], extractionProfile);
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
        sessionStorage.setItem('scanvocab_source_labels', JSON.stringify(mergeSourceLabels(result.sourceLabels)));
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
      const initialSteps: ProgressStep[] = scanFiles.map((_, i) => ({
        id: `file-${i}`,
        label: `画像 ${i + 1}/${totalFiles} を処理中...`,
        status: i === 0 ? 'active' : 'pending',
      }));
      setProcessingSteps(initialSteps);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allWords: any[] = [];
        let allSourceLabels: string[] = [];

        for (let i = 0; i < scanFiles.length; i++) {
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx < i ? 'complete' : idx === i ? 'active' : 'pending',
            label: idx === i ? `画像 ${i + 1}/${totalFiles} を処理中...` : s.label,
          })));

          let processedFile: File;
          try {
            processedFile = await processImageFile(scanFiles[i], extractionProfile);
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
          allSourceLabels = mergeSourceLabels(allSourceLabels, result.sourceLabels);
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
        sessionStorage.setItem('scanvocab_source_labels', JSON.stringify(allSourceLabels));
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
    setWords((prev) => prev.map((w) => (
      w.id === wordId
        ? {
            ...w,
            english,
            japanese,
          }
        : w
    )));

    if (japaneseChanged && canUseAiFeatures) {
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

  const handleOpenEditNameModal = () => {
    if (project) {
      setEditingName(project.title);
      setShowEditNameModal(true);
    }
  };

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
    return { total, mastered };
  }, [words]);

  const returnPath = project ? encodeURIComponent(`/project/${project.id}`) : '';
  const canUseAiFeatures = aiEnabled !== false;

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

  const safeProjectIcon =
    typeof project.iconImage === 'string' && project.iconImage.startsWith('data:image/')
      ? project.iconImage
      : null;

  return (
    <AppShell>
      <div className="pb-28 lg:pb-8">
        <header className="sticky top-0 z-40 bg-[var(--color-background)]/95">
          <div className="max-w-lg lg:max-w-xl mx-auto px-6 py-4 flex items-center justify-between gap-3 border-b border-[var(--color-border-light)]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center shrink-0">
                  {safeProjectIcon ? (
                    <span
                      className="w-full h-full bg-center bg-cover"
                      style={{ backgroundImage: `url(${safeProjectIcon})` }}
                    />
                  ) : (
                    <Icon name="menu_book" size={18} className="text-[var(--color-muted)]" />
                  )}
                </div>
                <div className="min-w-0 flex flex-1 items-center gap-2">
                  <h1 className="min-w-0 shrink text-lg font-bold text-[var(--color-foreground)] truncate">
                    {project.title}
                  </h1>
                  <ProjectSourceLabels
                    labels={project.sourceLabels}
                    maxRows={1}
                    className="min-w-0 flex-1"
                  />
                </div>
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

        <main className="max-w-lg lg:max-w-2xl mx-auto px-5 lg:px-6 py-5 lg:py-6 space-y-5 lg:space-y-6">
          {/* Vocabulary card view (replaces the blue recommended mode widget) */}
          <section>
            {!wordsLoaded ? (
              <div className="card p-6 border-2 border-[var(--color-border)] border-b-4">
                <div className="flex items-center gap-3 text-[var(--color-muted)]">
                  <Icon name="progress_activity" size={18} className="animate-spin" />
                  <span className="text-sm font-medium">単語データを読み込み中...</span>
                </div>
              </div>
            ) : words.length > 0 ? (
              <VocabularyTab
                words={words}
                repository={activeRepository}
                onWordsUpdate={setWords}
              />
            ) : (
              <div className="text-center py-12 card border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt,var(--color-surface))]">
                <div className="w-16 h-16 mx-auto bg-[var(--color-surface)] rounded-full flex items-center justify-center border-2 border-[var(--color-border)] mb-4">
                  <Icon name="auto_awesome" size={32} className="text-[var(--color-primary)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2">単語を追加して始めましょう</h3>
                <p className="text-sm text-[var(--color-muted)] mb-8 max-w-[240px] mx-auto">
                  カメラでノートをスキャンするか、手動で単語を追加できます
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center px-6">
                  <button onClick={() => setShowScanModeModal(true)} className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--color-primary)] text-white font-bold shadow-glow hover:opacity-90 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    <Icon name="document_scanner" size={20} /> カメラでスキャン
                  </button>
                  <button onClick={() => setShowManualWordModal(true)} className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--color-surface)] border-2 border-[var(--color-border)] text-[var(--color-foreground)] font-bold hover:bg-[var(--color-surface-hover)] flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    <Icon name="edit" size={20} /> 手動で追加
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 学習モード */}
          {words.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--color-foreground)] px-1">学習モード</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {canUseAiFeatures && (
                  <StudyModeCard
                    title="クイズ"
                    description="4択で確認"
                    icon="quiz"
                    href={`/quiz/${project.id}?from=${returnPath}`}
                    variant="primary"
                    disabled={words.length === 0}
                    layout="vertical"
                    styleMode="home"
                  />
                )}
                <StudyModeCard
                  title="即答"
                  description="音声で即答"
                  icon="mic"
                  href={`/quick-response/${project.id}?from=${returnPath}`}
                  variant="red"
                  disabled={words.length === 0}
                  layout="vertical"
                  styleMode="home"
                />
                <StudyModeCard
                  title="クイズ２"
                  description="思い出して評価"
                  icon="psychology"
                  href={isPro ? `/quiz2/${project.id}?from=${returnPath}` : '/subscription'}
                  variant="green"
                  disabled={words.length === 0}
                  badge={!isPro ? 'Pro' : undefined}
                  layout="vertical"
                  styleMode="home"
                />
                <StudyModeCard
                  title="カード"
                  description="スワイプ復習"
                  icon="style"
                  href={isPro ? `/flashcard/${project.id}?from=${returnPath}` : '/subscription'}
                  variant="blue"
                  disabled={words.length === 0}
                  badge={!isPro ? 'Pro' : undefined}
                  layout="vertical"
                  styleMode="home"
                />
              </div>
            </section>
          )}

          {/* 単語一覧: モバイルはリンク、PC/iPadはインライン表示 */}
          {/* Mobile: link to separate page */}
          <section className="lg:hidden pt-2.5 border-t border-[var(--color-border-light)]">
            <Link
              href={`/project/${projectId}/words`}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-light)] hover:border-[var(--color-border)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon name="list" size={20} className="text-[var(--color-primary)]" />
                <span className="text-sm font-semibold text-[var(--color-foreground)]">単語一覧</span>
                <span className="text-sm text-[var(--color-muted)]">{words.length}語</span>
              </div>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>
          </section>

          {/* Desktop/iPad: inline word list */}
          <section className="hidden lg:block space-y-2.5 lg:space-y-3 pt-2.5 lg:pt-3 border-t border-[var(--color-border-light)]">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-[var(--color-foreground)]">
                単語一覧 <span className="text-sm font-medium text-[var(--color-muted)] ml-2">{words.length}語</span>
              </h2>
            </div>

            {wordsLoaded ? (
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
                onScanClick={() => setShowScanModeModal(true)}
                listMaxHeightClassName="max-h-[48vh] lg:max-h-[56vh]"
              />
            ) : (
              <div className="card p-4 text-sm text-[var(--color-muted)] flex items-center gap-2">
                <Icon name="progress_activity" size={16} className="animate-spin" />
                単語一覧を読み込み中...
              </div>
            )}
          </section>
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

      {processing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm border-2 border-[var(--color-border)] border-b-4">
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
