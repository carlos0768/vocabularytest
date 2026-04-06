'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { DeleteConfirmModal, Icon, type ProgressStep } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { NotionCheckbox } from '@/components/home/WordList';
import { getProjectColor } from '@/components/project/ProjectCard';
import { ProjectShareSheet } from '@/components/project/ProjectShareSheet';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository, hybridRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import { markProjectVisited } from '@/lib/project-visit';
import { cacheProjectForOffline } from '@/lib/offline/recent-project-offline';
import { expandFilesForScan, isPdfFile, processImageFile, type ImageProcessingProfile } from '@/lib/image-utils';
import { invalidateHomeCache, getCachedProjects, getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import { getNextVocabularyType } from '@/lib/vocabulary-type';
import type { LexiconEntry, Project, ProjectShareScope, Word, WordStatus, SubscriptionStatus } from '@/types';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';
import { mergeSourceLabels } from '../../../../shared/source-labels';
import { mergeLexiconEntries } from '../../../../shared/lexicon';

const ScanModeModal = dynamic(
  () => import('@/components/home/ScanModeModal').then(mod => ({ default: mod.ScanModeModal })),
  { ssr: false }
);

function isOwnedBy(project: Project | undefined | null, expectedUserId: string): project is Project {
  return Boolean(project && project.userId === expectedUserId);
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
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

  /** Pro ではクイズ等が IndexedDB（ハイブリッド）を読むため、リモートのみへの書き込みだとローカルが古いままになる。変更は常にハイブリッドへ。 */
  const mutationRepository = useMemo(() => {
    if (subscriptionStatus === 'active') {
      return hybridRepository;
    }
    return activeRepository;
  }, [subscriptionStatus, activeRepository]);

  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const [showShareSheet, setShowShareSheet] = useState(false);
  const [sharePrepareLoading, setSharePrepareLoading] = useState(false);
  const [shareScopeUpdating, setShareScopeUpdating] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);

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

  // Word list toolbar: search, filter, sort
  const [wordSearchText, setWordSearchText] = useState('');
  const [wordShowSearch, setWordShowSearch] = useState(false);
  const [wordSortOrder, setWordSortOrder] = useState<'createdAsc' | 'alphabetical'>('createdAsc');
  const [wordFilterBookmark, setWordFilterBookmark] = useState(false);
  const [wordFilterActiveness, setWordFilterActiveness] = useState<'all' | 'active' | 'passive'>('all');
  const [wordFilterPos, setWordFilterPos] = useState<string | null>(null);
  const [wordShowFilterSheet, setWordShowFilterSheet] = useState(false);

  const hasLocalLoadedRef = useRef(false);
  const cacheRestoredRef = useRef(false);

  // Phase 0: Instant restore from home-cache (no async, no auth wait)
  useLayoutEffect(() => {
    if (cacheRestoredRef.current) return;
    cacheRestoredRef.current = true;
    if (!getHasLoaded()) return;
    const cached = getCachedProjects().find(p => p.id === projectId);
    if (cached) {
      setProject(cached);
      setLoading(false);
      const cachedWords = getCachedProjectWords()[projectId];
      if (cachedWords) {
        setWords(cachedWords);
        setWordsLoaded(true);
        hasLocalLoadedRef.current = true;
      }
    }
  }, [projectId]);

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
    if ((mode === 'circled' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      setShowScanModeModal(false);
      startTransition(() => { router.push('/subscription'); });
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
    sessionStorage.removeItem('scanvocab_lexicon_entries');

    const totalFiles = scanFiles.length;
    setProcessing(true);

    const extractionProfile: ImageProcessingProfile = 'default';

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
        sessionStorage.setItem('scanvocab_lexicon_entries', JSON.stringify(mergeLexiconEntries(result.lexiconEntries)));
        startTransition(() => { router.push('/scan/confirm'); });
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
        let allLexiconEntries: LexiconEntry[] = [];

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
          allLexiconEntries = mergeLexiconEntries(allLexiconEntries, result.lexiconEntries);
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
        sessionStorage.setItem('scanvocab_lexicon_entries', JSON.stringify(allLexiconEntries));
        startTransition(() => { router.push('/scan/confirm'); });
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
      await mutationRepository.deleteWord(deleteWordTargetId);
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
    await mutationRepository.updateWord(wordId, { english, japanese });
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
            await mutationRepository.updateWord(wordId, { distractors: data.distractors });
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
    await mutationRepository.updateWord(wordId, { isFavorite: newFavorite });
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, isFavorite: newFavorite } : w)));
  };

  const handleCycleVocabularyType = async (wordId: string) => {
    const word = words.find((item) => item.id === wordId);
    if (!word) return;

    const nextVocabularyType = getNextVocabularyType(word.vocabularyType);
    const previousVocabularyType = word.vocabularyType;

    setWords((prev) => prev.map((item) => (
      item.id === wordId
        ? { ...item, vocabularyType: nextVocabularyType }
        : item
    )));

    try {
      try {
        sessionStorage.removeItem(`quiz_state_${projectId}`);
      } catch {
        /* ignore */
      }
      await mutationRepository.updateWord(wordId, { vocabularyType: nextVocabularyType });
    } catch (error) {
      console.error('Failed to update vocabulary type:', error);
      setWords((prev) => prev.map((item) => (
        item.id === wordId
          ? { ...item, vocabularyType: previousVocabularyType }
          : item
      )));
      showToast({ message: '語彙モードの更新に失敗しました', type: 'error' });
    }
  };

  const handleCycleStatus = async (wordId: string, newStatus: WordStatus) => {
    const word = words.find((w) => w.id === wordId);
    if (!word) return;
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, status: newStatus } : w)));
    try {
      await mutationRepository.updateWord(wordId, { status: newStatus });
    } catch {
      setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, status: word.status } : w)));
      showToast({ message: 'ステータスの更新に失敗しました', type: 'error' });
    }
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
      const created = await mutationRepository.createWords([
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

  const handleOpenShareSheet = () => {
    if (!project || !user || !isPro) return;
    setInviteCodeCopied(false);
    setShowShareSheet(true);
    setSharePrepareLoading(!project.shareId);
  };

  useEffect(() => {
    if (!showShareSheet || !project || !isPro || !user) return;
    if (project.shareId) {
      setSharePrepareLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sid = await remoteRepository.generateShareId(project.id);
        if (cancelled) return;
        setProject((p) => (p ? { ...p, shareId: sid, shareScope: 'private' } : p));
        invalidateHomeCache();
      } catch (error) {
        console.error('Failed to prepare share:', error);
        if (!cancelled) {
          showToast({ message: '共有の準備に失敗しました', type: 'error' });
          setShowShareSheet(false);
        }
      } finally {
        if (!cancelled) setSharePrepareLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showShareSheet, project?.id, project?.shareId, isPro, user]);

  const handleSelectShareScope = async (scope: ProjectShareScope) => {
    if (!project) return;
    const current: ProjectShareScope = project.shareScope === 'public' ? 'public' : 'private';
    if (scope === current) return;
    setShareScopeUpdating(true);
    try {
      await mutationRepository.updateProject(project.id, { shareScope: scope });
      setProject((p) => (p ? { ...p, shareScope: scope } : p));
      invalidateHomeCache();
      showToast({
        message:
          scope === 'public'
            ? '共有ページに公開しました'
            : '非公開（招待コードのみ）にしました',
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to update share scope:', error);
      showToast({ message: '公開設定の更新に失敗しました', type: 'error' });
    } finally {
      setShareScopeUpdating(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!project?.shareId) return;
    const ok = await copyToClipboard(project.shareId);
    if (ok) {
      setInviteCodeCopied(true);
      showToast({ message: '招待コードをコピーしました', type: 'success' });
      setTimeout(() => setInviteCodeCopied(false), 2000);
    } else {
      showToast({ message: 'コピーできませんでした', type: 'error' });
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
      await mutationRepository.updateProject(project.id, { title: editingName.trim() });
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
      await mutationRepository.deleteProject(project.id);
      invalidateHomeCache();
      refreshWordCount();
      showToast({ message: '単語帳を削除しました', type: 'success' });
      startTransition(() => { router.push('/'); });
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
    const learning = words.filter((w) => w.status === 'review').length;
    const unlearned = words.filter((w) => !w.status || w.status === 'new').length;
    return { total, mastered, learning, unlearned };
  }, [words]);

  const wordFilterActive = wordFilterBookmark || wordFilterActiveness !== 'all' || wordFilterPos !== null;

  const filteredWords = useMemo(() => {
    let result = words;

    if (wordSearchText) {
      const q = wordSearchText.toLowerCase();
      result = result.filter(
        (w) => w.english.toLowerCase().includes(q) || w.japanese.toLowerCase().includes(q)
      );
    }
    if (wordFilterBookmark) {
      result = result.filter((w) => w.isFavorite);
    }
    if (wordFilterPos) {
      result = result.filter((w) =>
        w.partOfSpeechTags?.some((t) => t.toLowerCase().includes(wordFilterPos.toLowerCase()))
      );
    }
    if (wordFilterActiveness === 'active') {
      result = result.filter((w) => w.status === 'mastered');
    } else if (wordFilterActiveness === 'passive') {
      result = result.filter((w) => w.status === 'review' || w.status === 'new' || !w.status);
    }

    if (wordSortOrder === 'alphabetical') {
      result = [...result].sort((a, b) => a.english.localeCompare(b.english, undefined, { sensitivity: 'base' }));
    } else {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    return result;
  }, [words, wordSearchText, wordFilterBookmark, wordFilterPos, wordFilterActiveness, wordSortOrder]);

  const availablePartsOfSpeech = useMemo(() => {
    const all = words.flatMap((w) => w.partOfSpeechTags ?? []);
    const trimmed = all.map((t) => t.trim()).filter(Boolean);
    return [...new Set(trimmed)].sort();
  }, [words]);

  const returnPath = project ? encodeURIComponent(`/project/${project.id}`) : '';
  const canUseAiFeatures = aiEnabled !== false;
  const HEADER_DARKEN: Record<string, string> = {
    '#ef4444': '#b91c1c',
    '#16a34a': '#166534',
    '#1e3a8a': '#1e40af',
    '#f97316': '#c2410c',
    '#9333ea': '#7e22ce',
    '#0d9488': '#0f766e',
  };
  const headerFrom = getProjectColor(project?.title ?? 'MERKEN');
  const headerTo = HEADER_DARKEN[headerFrom] ?? headerFrom;
  const headerBackground = `linear-gradient(135deg, ${headerFrom}, ${headerTo})`;
  useEffect(() => {
    if (loading || !project) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBackgroundColor = html.style.backgroundColor;
    const previousBodyBackgroundColor = body.style.backgroundColor;

    // iOS standalone can expose the document background above fixed content.
    // Use the header's leading color here so that exposed area matches the header.
    html.style.backgroundColor = headerFrom;
    body.style.backgroundColor = headerFrom;

    return () => {
      html.style.backgroundColor = previousHtmlBackgroundColor;
      body.style.backgroundColor = previousBodyBackgroundColor;
    };
  }, [headerFrom, loading, project]);

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

  const posLabel = (tags?: string[]) => {
    if (!tags || tags.length === 0) return null;
    const map: Record<string, string> = { noun: '名', verb: '動', adjective: '形', adverb: '副', phrase: '句', idiom: '熟', phrasal_verb: '句' };
    return map[tags[0]] || tags[0].slice(0, 1);
  };

  return (
    <>
      <div className="min-h-screen bg-[var(--color-background)] pb-28 lg:pb-8">
        <div
          className="project-detail-header-safe-top z-[50] sticky top-0"
          style={{ background: headerBackground }}
        >
          <div
            className="max-w-lg lg:max-w-xl mx-auto px-5 pt-4 pb-5"
          >
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => startTransition(() => router.push('/'))}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
                aria-label="ホームへ戻る"
              >
                <Icon name="chevron_left" size={24} className="text-white" />
              </button>
              <div className="flex-1 text-center mx-3">
                <p className="text-white font-bold text-sm truncate">{project.title}</p>
                <p className="text-white/70 text-xs">{stats.total}語</p>
              </div>
              <div className="flex items-center gap-2">
                {isPro && (
                  <button
                    type="button"
                    onClick={handleOpenShareSheet}
                    className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
                    aria-label="共有"
                  >
                    <Icon name="ios_share" size={18} className="text-white" />
                  </button>
                )}
                <button onClick={() => setDeleteProjectModalOpen(true)} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Icon name="more_horiz" size={18} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-lg lg:max-w-2xl mx-auto px-5 pt-4 lg:px-6 lg:-mt-2 space-y-5">
          {/* 3-column stats card - iOS style */}
          <section>
            <div className="card p-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-[var(--color-muted)]">{stats.mastered}/{stats.total}語</p>
                  <p className="text-sm font-bold text-[var(--color-foreground)] mt-1">習得</p>
                  <div className="w-10 h-10 mx-auto mt-2 rounded-full border-[3px] border-[var(--color-success)] flex items-center justify-center">
                    <Icon name="check" size={18} className="text-[var(--color-success)]" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[var(--color-muted)]">{stats.learning}/{stats.total}語</p>
                  <p className="text-sm font-bold text-[var(--color-foreground)] mt-1">学習中</p>
                  <div className="w-10 h-10 mx-auto mt-2 rounded-full border-[3px] border-[var(--color-muted)] flex items-center justify-center">
                    <Icon name="autorenew" size={18} className="text-[var(--color-muted)]" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-[var(--color-foreground)]">{stats.unlearned}/{stats.total}語</p>
                  <p className="text-sm font-bold text-[var(--color-foreground)] mt-1">未学習</p>
                  <div className="w-10 h-10 mx-auto mt-2 rounded-full border-[3px] border-[var(--color-border)] flex items-center justify-center">
                    <Icon name="auto_awesome" size={18} className="text-[var(--color-muted)]" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Word list table - iOS style */}
          <section>
            {/* Header row: title + toolbar */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[var(--color-foreground)]">単語一覧 <span className="text-sm font-normal text-[var(--color-muted)]">{stats.total}</span></h2>
              <div className="flex items-center gap-1.5">
                {/* Search toggle */}
                <button
                  type="button"
                  onClick={() => { setWordShowSearch((v) => { if (v) setWordSearchText(''); return !v; }); }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    wordShowSearch || wordSearchText
                      ? 'bg-[var(--color-accent)]/12 border-[var(--color-accent)]/35 text-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label="検索"
                >
                  <Icon name={wordShowSearch ? 'close' : 'search'} size={18} />
                </button>
                {/* Filter */}
                <button
                  type="button"
                  onClick={() => setWordShowFilterSheet((v) => !v)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    wordFilterActive
                      ? 'bg-[var(--color-accent)]/12 border-[var(--color-accent)]/35 text-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label="フィルタ"
                >
                  <Icon name="filter_list" size={18} />
                </button>
                {/* Sort */}
                <button
                  type="button"
                  onClick={() => setWordSortOrder((v) => v === 'createdAsc' ? 'alphabetical' : 'createdAsc')}
                  className="w-9 h-9 rounded-full flex items-center justify-center border bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)] transition-colors"
                  aria-label={`ソート: ${wordSortOrder === 'createdAsc' ? '追加順' : 'アルファベット'}`}
                  title={wordSortOrder === 'createdAsc' ? '追加順' : 'アルファベット'}
                >
                  <Icon name="swap_vert" size={18} />
                </button>
                {/* Filter badge */}
                {(wordFilterActive || wordSearchText) && (
                  <span className="text-xs font-medium tabular-nums text-[var(--color-accent)]">
                    {filteredWords.length}/{stats.total}
                  </span>
                )}
              </div>
            </div>

            {/* Search bar */}
            {wordShowSearch && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-light)]">
                <Icon name="search" size={16} className="text-[var(--color-muted)] shrink-0" />
                <input
                  type="text"
                  value={wordSearchText}
                  onChange={(e) => setWordSearchText(e.target.value)}
                  placeholder="単語を検索..."
                  className="flex-1 bg-transparent text-sm outline-none text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]"
                  autoFocus
                />
                {wordSearchText && (
                  <button type="button" onClick={() => setWordSearchText('')} className="text-[var(--color-muted)]">
                    <Icon name="cancel" size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Filter panel */}
            {wordShowFilterSheet && (
              <div className="mb-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-light)] space-y-4">
                {/* Bookmark */}
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                    <Icon name="bookmark" size={16} filled={wordFilterBookmark} />
                    ブックマークのみ
                  </span>
                  <input
                    type="checkbox"
                    checked={wordFilterBookmark}
                    onChange={(e) => setWordFilterBookmark(e.target.checked)}
                    className="accent-[var(--color-accent)] w-4 h-4"
                  />
                </label>

                {/* Active / Passive */}
                <div>
                  <p className="text-xs font-bold text-[var(--color-muted)] mb-2">アクティブ / パッシブ</p>
                  <div className="flex gap-2">
                    {([['all', 'すべて'], ['active', 'アクティブ'], ['passive', 'パッシブ']] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setWordFilterActiveness(val)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          wordFilterActiveness === val
                            ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                            : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Part of speech */}
                {availablePartsOfSpeech.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-[var(--color-muted)] mb-2">品詞</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setWordFilterPos(null)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          !wordFilterPos
                            ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                            : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                        }`}
                      >
                        すべて
                      </button>
                      {availablePartsOfSpeech.map((pos) => {
                        const posMap: Record<string, string> = { noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞', preposition: '前置詞', conjunction: '接続詞', pronoun: '代名詞', interjection: '感動詞', determiner: '限定詞', auxiliary: '助動詞' };
                        return (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => setWordFilterPos(pos)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                              wordFilterPos === pos
                                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                                : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                            }`}
                          >
                            {posMap[pos.toLowerCase()] ?? pos}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reset */}
                {wordFilterActive && (
                  <button
                    type="button"
                    onClick={() => { setWordFilterBookmark(false); setWordFilterActiveness('all'); setWordFilterPos(null); }}
                    className="text-xs font-semibold text-[var(--color-danger)]"
                  >
                    リセット
                  </button>
                )}
              </div>
            )}

            {!wordsLoaded ? (
              <div className="flex items-center gap-3 text-[var(--color-muted)] py-8 justify-center">
                <Icon name="progress_activity" size={18} className="animate-spin" />
                <span className="text-sm">読み込み中...</span>
              </div>
            ) : words.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--color-muted)]">単語がありません</p>
              </div>
            ) : filteredWords.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--color-muted)]">
                  {wordSearchText ? `「${wordSearchText}」に一致する単語がありません` : '条件に一致する単語がありません'}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                      <th className="w-5 py-2" />
                      <th className="px-2 py-2 text-left font-medium">単語</th>
                      <th className="w-10 px-1 py-2 text-center font-medium">A/P</th>
                      <th className="w-10 px-1 py-2 text-center font-medium">品詞</th>
                      <th className="px-2 py-2 text-left font-medium whitespace-nowrap">訳</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-light)]">
                    {filteredWords.map((word) => (
                      <tr
                        key={word.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => {
                          router.push(`/word/${word.id}?from=${returnPath}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(`/word/${word.id}?from=${returnPath}`);
                          }
                        }}
                        className="cursor-pointer transition-colors active:bg-[var(--color-surface-secondary)]"
                      >
                        <td className="w-5 pl-1 py-2.5">
                          <NotionCheckbox
                            wordId={word.id}
                            status={word.status}
                            onStatusChange={(newStatus) => { void handleCycleStatus(word.id, newStatus); }}
                          />
                        </td>
                        <td className="px-2 py-2.5 max-w-0">
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <span className="text-sm font-medium text-[var(--color-foreground)] truncate">{word.english}</span>
                            {word.isFavorite && (
                              <Icon
                                name="flag"
                                size={14}
                                filled
                                className="text-[var(--color-warning)] shrink-0"
                                aria-label="苦手マーク"
                              />
                            )}
                          </span>
                        </td>
                        <td className="w-10 px-1 py-2.5 text-center">
                          <span className="flex justify-center">
                            <VocabularyTypeButton
                              vocabularyType={word.vocabularyType}
                              onClick={() => {
                                void handleCycleVocabularyType(word.id);
                              }}
                            />
                          </span>
                        </td>
                        <td className="w-10 px-1 py-2.5 text-center text-xs font-bold text-[var(--color-muted)]">
                          {posLabel(word.partOfSpeechTags) || '—'}
                        </td>
                        <td className="px-2 py-2.5 text-xs text-[var(--color-muted)] truncate max-w-0">
                          {word.japanese}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        {/* Bottom action bar - iOS style */}
        {words.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-3 z-40 lg:ml-[280px]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="max-w-lg mx-auto flex items-center gap-3">
              <Link
                href={`/flashcard/${project.id}?from=${returnPath}`}
                className="w-12 h-12 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted)] hover:bg-[var(--color-surface-secondary)] transition-colors"
                title="フラッシュカード"
              >
                <Icon name="style" size={20} />
              </Link>
              <Link
                href={canUseAiFeatures ? `/quiz/${project.id}?from=${returnPath}` : `/quiz2/${project.id}?from=${returnPath}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] font-semibold text-sm"
              >
                <Icon name="help" size={18} />
                クイズ
              </Link>
              <button
                onClick={() => setShowManualWordModal(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm"
              >
                <Icon name="add" size={18} />
                単語追加
              </button>
            </div>
          </div>
        )}

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

      {project && (
        <ProjectShareSheet
          open={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          projectTitle={project.title}
          shareId={project.shareId}
          shareScope={project.shareScope === 'public' ? 'public' : 'private'}
          preparing={sharePrepareLoading}
          updatingScope={shareScopeUpdating}
          onSelectScope={handleSelectShareScope}
          onCopyInviteCode={() => void handleCopyInviteCode()}
          inviteCodeCopied={inviteCodeCopied}
        />
      )}

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
    </>
  );
}
