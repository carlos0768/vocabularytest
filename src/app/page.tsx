'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  BookOpen,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Share2,
  Link as LinkIcon,
  Loader2,
  BookText,
  Check,
  Play,
  Layers,
  Flag,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { type ProgressStep, useToast, DeleteConfirmModal, Button, BottomNav } from '@/components/ui';
import { ScanLimitModal, WordLimitModal, WordLimitBanner } from '@/components/limits';
import { InlineFlashcard, StudyModeCard, WordList } from '@/components/home';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId, FREE_WORD_LIMIT, getWrongAnswers, removeWrongAnswer, type WrongAnswer } from '@/lib/utils';
import { prefetchStats } from '@/lib/stats-cache';
import { processImageFile } from '@/lib/image-utils';
import type { Project, Word } from '@/types';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';

// Dynamic imports for modals - loaded only when opened (not in initial bundle)
const ScanModeModal = dynamic(
  () => import('@/components/home/ScanModeModal').then(mod => ({ default: mod.ScanModeModal })),
  { ssr: false }
);
const ProjectNameModal = dynamic(
  () => import('@/components/home/ProjectModals').then(mod => ({ default: mod.ProjectNameModal })),
  { ssr: false }
);
const EditProjectNameModal = dynamic(
  () => import('@/components/home/ProjectModals').then(mod => ({ default: mod.EditProjectNameModal })),
  { ssr: false }
);
const ManualWordInputModal = dynamic(
  () => import('@/components/home/ProjectModals').then(mod => ({ default: mod.ManualWordInputModal })),
  { ssr: false }
);
const ProcessingModal = dynamic(
  () => import('@/components/home/ProcessingModal').then(mod => ({ default: mod.ProcessingModal })),
  { ssr: false }
);
const ProjectSelectionSheet = dynamic(
  () => import('@/components/home/ProjectSelectionSheet').then(mod => ({ default: mod.ProjectSelectionSheet })),
  { ssr: false }
);

// Global cache for projects/words - persists across page navigations within the same session
let globalProjectsCache: Project[] = [];
let globalProjectWordsCache: Record<string, Word[]> = {};
let globalAllFavoritesCache: Word[] = [];
let globalFavoriteCountsCache: Record<string, number> = {};
let globalTotalWordsCache = 0;
let globalHasLoaded = false;
let globalLoadedUserId: string | null = null;

/** Invalidate the home page cache so next visit fetches fresh data */
export function invalidateHomeCache() {
  globalHasLoaded = false;
}

// Scan mode types
type ScanMode = ExtractMode;

export default function HomePage() {
  const router = useRouter();
  const { user, subscription, isAuthenticated, isPro, loading: authLoading } = useAuth();
  const { isAlmostFull, isAtLimit, refresh: refreshWordCount } = useWordCount();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Projects & navigation - Initialize from cache if available
  const [projects, setProjects] = useState<Project[]>(globalProjectsCache);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [words, setWords] = useState<Word[]>(
    globalProjectsCache[0] ? globalProjectWordsCache[globalProjectsCache[0].id] || [] : []
  );
  const [allFavoriteWords, setAllFavoriteWords] = useState<Word[]>(globalAllFavoritesCache);
  const [projectFavoriteCounts, setProjectFavoriteCounts] = useState<Record<string, number>>(globalFavoriteCountsCache);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>(() => getWrongAnswers());
  const [showWrongAnswers, setShowWrongAnswers] = useState(false); // Show wrong answers mode
  const [showAllProjects, setShowAllProjects] = useState(false); // Show all projects combined mode
  const [totalWords, setTotalWords] = useState(globalTotalWordsCache);
  // Start with loading=false if cache is already populated
  const [loading, setLoading] = useState(!globalHasLoaded);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Word editing
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);

  // Sharing
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Scan processing
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [, setScanInfo] = useState<{ currentCount: number; limit: number | null; isPro: boolean } | null>(null);

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [isAddingToExisting, setIsAddingToExisting] = useState(false); // true = add to current project, false = new project
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedScanMode, setSelectedScanMode] = useState<ScanMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);

  // Delete modals
  const [deleteWordModalOpen, setDeleteWordModalOpen] = useState(false);
  const [deleteWordTargetId, setDeleteWordTargetId] = useState<string | null>(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);
  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  // Edit project name modal
  const [editProjectModalOpen, setEditProjectModalOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editProjectNewName, setEditProjectNewName] = useState('');

  // Manual word input modal
  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);

  // Get repository
  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Current project
  const currentProject = projects[currentProjectIndex] || null;

  // Scan info is populated from server responses

  // Note: Body scroll locking removed to allow page scrolling

  // Note: Global cache variables (globalProjectWordsCache, globalHasLoaded, globalLoadedUserId)
  // are used directly in loadProjects/loadWords to persist across page navigations

  // Load projects
  const loadProjects = useCallback(async (forceReload = false) => {
    const userId = isPro && user ? user.id : getGuestUserId();

    // Skip if already loaded for this user (unless force reload)
    if (!forceReload && globalHasLoaded && globalLoadedUserId === userId) {
      // Restore from cache immediately
      setProjects(globalProjectsCache);
      setWords(globalProjectsCache[0] ? globalProjectWordsCache[globalProjectsCache[0].id] || [] : []);
      setAllFavoriteWords(globalAllFavoritesCache);
      setProjectFavoriteCounts(globalFavoriteCountsCache);
      setTotalWords(globalTotalWordsCache);
      setWrongAnswers(getWrongAnswers());
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await repository.getProjects(userId);
      setProjects(data);

      if (data.length === 0) {
        setTotalWords(0);
        setAllFavoriteWords([]);
        setProjectFavoriteCounts({});
        setWords([]);
        // Update cache
        globalProjectsCache = [];
        globalProjectWordsCache = {};
        globalAllFavoritesCache = [];
        globalFavoriteCountsCache = {};
        globalTotalWordsCache = 0;
        globalHasLoaded = true;
        globalLoadedUserId = userId;
        setLoading(false);
        return;
      }

      // Calculate total words and collect all favorite words - load in parallel
      const wordPromises = data.map(project => repository.getWords(project.id));
      const allProjectWords = await Promise.all(wordPromises);

      let total = 0;
      const allFavorites: Word[] = [];
      const favoriteCounts: Record<string, number> = {};
      const wordsCache: Record<string, Word[]> = {};

      data.forEach((project, index) => {
        const projectWords = allProjectWords[index];
        wordsCache[project.id] = projectWords;
        total += projectWords.length;

        // Count and collect favorites for this project
        const projectFavorites = projectWords.filter(w => w.isFavorite);
        favoriteCounts[project.id] = projectFavorites.length;
        allFavorites.push(...projectFavorites);
      });

      // Update global cache
      globalProjectsCache = data;
      globalProjectWordsCache = wordsCache;
      globalAllFavoritesCache = allFavorites;
      globalFavoriteCountsCache = favoriteCounts;
      globalTotalWordsCache = total;
      globalHasLoaded = true;
      globalLoadedUserId = userId;

      setTotalWords(total);
      setAllFavoriteWords(allFavorites);
      setProjectFavoriteCounts(favoriteCounts);

      // Set current project words from cache
      const firstProject = data[0];
      if (firstProject && wordsCache[firstProject.id]) {
        setWords(wordsCache[firstProject.id]);
      }

      // Load wrong answers
      const wrongAnswersList = getWrongAnswers();
      setWrongAnswers(wrongAnswersList);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, [isPro, user, repository]);

  // Load words for current project - use cache if available
  const loadWords = useCallback(async () => {
    if (!currentProject) {
      setWords([]);
      return;
    }

    // Check global cache first
    const cachedWords = globalProjectWordsCache[currentProject.id];
    if (cachedWords) {
      setWords(cachedWords);
      return;
    }

    // Fallback to API if not in cache
    try {
      setWordsLoading(true);
      const wordsData = await repository.getWords(currentProject.id);
      setWords(wordsData);
      globalProjectWordsCache[currentProject.id] = wordsData;
    } catch (error) {
      console.error('Failed to load words:', error);
    } finally {
      setWordsLoading(false);
    }
  }, [currentProject, repository]);

  // Load projects after auth + prefetch stats in background
  useEffect(() => {
    if (!authLoading) {
      loadProjects();
      // Prefetch stats data so the stats page opens instantly
      prefetchStats(subscriptionStatus, user?.id ?? null, isPro);
    }
  }, [authLoading, loadProjects, subscriptionStatus, user?.id, isPro]);

  // Load words when project changes
  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // Convert wrong answers to Word type for display
  const wrongAnswerWords: Word[] = useMemo(() => {
    return wrongAnswers.map(wa => ({
      id: wa.wordId,
      projectId: wa.projectId,
      english: wa.english,
      japanese: wa.japanese,
      distractors: wa.distractors,
      status: 'review' as const,
      isFavorite: false,
      createdAt: new Date(wa.lastWrongAt).toISOString(),
      // Spaced repetition defaults
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
    }));
  }, [wrongAnswers]);

  // Get all words from all projects for "All Projects" mode
  const allProjectsWords = useMemo(() => {
    return Object.values(globalProjectWordsCache).flat();
  }, [projects, words]); // Recalculate when projects or words change

  const filteredWords = showWrongAnswers
    ? wrongAnswerWords
    : showFavoritesOnly
    ? allFavoriteWords
    : showAllProjects
    ? allProjectsWords
    : words;

  // Navigation
  const selectProject = (index: number) => {
    setCurrentProjectIndex(index);
    setShowFavoritesOnly(false);
    setShowWrongAnswers(false);
    setShowAllProjects(false);
    setIsProjectDropdownOpen(false);
  };

  // Word handlers
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
    // Find the original word to check if japanese was changed
    const originalWord = words.find((w) => w.id === wordId);
    const japaneseChanged = originalWord && originalWord.japanese !== japanese;

    // Update word immediately with new english/japanese
    await repository.updateWord(wordId, { english, japanese });
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w))
    );
    setEditingWordId(null);

    // If japanese was changed, regenerate distractors in background
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
            // Update word with new distractors
            await repository.updateWord(wordId, { distractors: data.distractors });
            setWords((prev) =>
              prev.map((w) => (w.id === wordId ? { ...w, distractors: data.distractors } : w))
            );
          }
        }
      } catch (error) {
        // Silently fail - old distractors will remain
        console.error('Failed to regenerate distractors:', error);
      }
    }
  };

  const handleToggleFavorite = async (wordId: string) => {
    // Find word in current project words or all favorite words
    const word = words.find((w) => w.id === wordId) || allFavoriteWords.find((w) => w.id === wordId);
    if (!word) return;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(wordId, { isFavorite: newFavorite });

    // Update current project words
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, isFavorite: newFavorite } : w))
    );

    // Update all favorite words
    if (newFavorite) {
      // Add to favorites
      setAllFavoriteWords((prev) => [...prev, { ...word, isFavorite: true }]);
    } else {
      // Remove from favorites
      setAllFavoriteWords((prev) => prev.filter((w) => w.id !== wordId));
    }

    // Update project favorite counts
    const projectId = word.projectId;
    setProjectFavoriteCounts((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || 0) + (newFavorite ? 1 : -1),
    }));
  };

  // Toggle project bookmark
  const handleToggleProjectFavorite = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const newFavorite = !project.isFavorite;
    try {
      await repository.updateProject(projectId, { isFavorite: newFavorite });
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, isFavorite: newFavorite } : p))
      );
    } catch (error) {
      console.error('Failed to toggle project favorite:', error);
      showToast({ message: 'ブックマークの変更に失敗しました', type: 'error' });
    }
  };

  // Project handlers
  const handleDeleteProject = () => {
    setDeleteProjectModalOpen(true);
  };

  const handleConfirmDeleteProject = async () => {
    if (!currentProject) return;

    setDeleteProjectLoading(true);
    try {
      await repository.deleteProject(currentProject.id);
      const newProjects = projects.filter((p) => p.id !== currentProject.id);
      setProjects(newProjects);
      if (currentProjectIndex >= newProjects.length && newProjects.length > 0) {
        setCurrentProjectIndex(newProjects.length - 1);
      }
      refreshWordCount();
      showToast({ message: '単語帳を削除しました', type: 'success' });
    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteProjectLoading(false);
      setDeleteProjectModalOpen(false);
    }
  };

  const handleEditProjectName = (projectId: string, currentName: string) => {
    setEditProjectId(projectId);
    setEditProjectNewName(currentName);
    setEditProjectModalOpen(true);
  };

  const handleConfirmEditProjectName = async (newName: string) => {
    if (!editProjectId || !newName.trim()) return;

    try {
      await repository.updateProject(editProjectId, { title: newName.trim() });
      setProjects((prev) =>
        prev.map((p) => (p.id === editProjectId ? { ...p, title: newName.trim() } : p))
      );
      showToast({ message: '単語帳の名前を変更しました', type: 'success' });
    } catch (error) {
      console.error('Failed to update project name:', error);
      showToast({ message: '名前の変更に失敗しました', type: 'error' });
    } finally {
      setEditProjectModalOpen(false);
      setEditProjectId(null);
      setEditProjectNewName('');
    }
  };

  const handleSaveManualWord = async () => {
    if (!currentProject) {
      showToast({ message: 'まず単語帳を選択してください', type: 'error' });
      return;
    }

    if (!manualWordEnglish.trim() || !manualWordJapanese.trim()) {
      showToast({ message: '英単語と日本語訳を入力してください', type: 'error' });
      return;
    }

    setManualWordSaving(true);
    try {
      await repository.createWords([
        {
          projectId: currentProject.id,
          english: manualWordEnglish.trim(),
          japanese: manualWordJapanese.trim(),
          distractors: [],
          exampleSentence: '',
          exampleSentenceJa: '',
        },
      ]);

      showToast({ message: '単語を追加しました', type: 'success' });
      setManualWordEnglish('');
      setManualWordJapanese('');
      setShowManualWordModal(false);
      // Invalidate cache so loadWords fetches fresh data
      if (currentProject) {
        delete globalProjectWordsCache[currentProject.id];
      }
      loadWords();
      refreshWordCount();

      // Generate embeddings for the new word in the background (Pro only)
      if (isPro && user) {
        fetch('/api/embeddings/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to save manual word:', error);
      showToast({ message: '単語の保存に失敗しました', type: 'error' });
    } finally {
      setManualWordSaving(false);
    }
  };

  // Share handler (Pro only)
  const handleShare = async () => {
    if (!currentProject || !user || !isPro) return;

    setSharing(true);
    try {
      let shareId = currentProject.shareId;
      if (!shareId) {
        // Retry up to 2 times if first attempt fails
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            shareId = await remoteRepository.generateShareId(currentProject.id);
            break;
          } catch (error) {
            console.error(`Share ID generation attempt ${attempt + 1} failed:`, error);
            lastError = error instanceof Error ? error : new Error('Unknown error');
            // Wait a bit before retry
            if (attempt < 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }

        if (!shareId) {
          throw lastError || new Error('Failed to generate share ID');
        }

        setProjects((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, shareId } : p))
        );
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

  // Scan handlers
  const canScan = isAuthenticated;

  const handleScanButtonClick = (addToExisting: boolean = false) => {
    setIsAddingToExisting(addToExisting);
    setShowScanModeModal(true);
  };

  const handleScanModeSelect = (mode: ScanMode, eikenLevel: EikenLevel) => {
    setShowScanModeModal(false);

    // Pro-only features: circled, highlighted, eiken filter, idiom modes
    if ((mode === 'circled' || mode === 'highlighted' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      router.push('/subscription');
      return;
    }

    setSelectedScanMode(mode as ExtractMode);
    setSelectedEikenLevel(eikenLevel);
    fileInputRef.current?.click();
  };

  const handleImageSelect = async (file: File) => {
    if (!isAuthenticated) {
      showToast({
        message: 'ログインが必要です',
        type: 'error',
        action: {
          label: 'ログイン',
          onClick: () => router.push('/login'),
        },
        duration: 4000,
      });
      return;
    }

    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    setPendingFile(file);

    // If adding to existing project, skip project name modal
    if (isAddingToExisting && currentProject) {
      sessionStorage.setItem('scanvocab_existing_project_id', currentProject.id);
      sessionStorage.removeItem('scanvocab_project_name');
      processImage(file);
    } else {
      setShowProjectNameModal(true);
    }
  };

  // Direct image processing - calls /api/extract directly
  const processImage = async (file: File) => {
    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'analyze', label: '文字を解析中...', status: 'pending' },
    ]);

    try {
      // Process image (convert HEIC to JPEG if needed)
      let processedFile: File;
      try {
        processedFile = await processImageFile(file);
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        throw new Error('画像の処理に失敗しました。別の画像をお試しください。');
      }

      // Convert file to base64
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

      // Call extract API directly
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mode: selectedScanMode,
          eikenLevel: selectedEikenLevel,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.limitReached) {
          setProcessing(false);
          setProcessingSteps([]);
          setScanInfo(result.scanInfo);
          setShowScanLimitModal(true);
          return;
        }
        throw new Error(result.error || '解析に失敗しました');
      }

      // Update scan info
      if (result.scanInfo) {
        setScanInfo(result.scanInfo);
      }

      setProcessingSteps([
        { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
        { id: 'analyze', label: '文字を解析中...', status: 'complete' },
      ]);

      // Save result to sessionStorage and navigate to confirm page
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(result.words));
      // Navigate first, then close processing modal
      // (closing modal before navigation causes a flash of the home screen)
      router.push('/scan/confirm');
      setProcessing(false);
    } catch (error) {
      console.error('Scan error:', error);

      let errorMessage = '予期しないエラー';
      if (error instanceof Error) {
        if (error.message.includes('did not match the expected pattern')) {
          errorMessage = '画像データの処理に問題が発生しました。カメラ設定を「互換性優先」にするか、スクリーンショットをお試しください。';
        } else if (error.message.includes('HEIC') || error.message.includes('HEIF')) {
          errorMessage = error.message;
        } else {
          errorMessage = error.message;
        }
      }

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' || s.status === 'pending'
            ? { ...s, status: 'error', label: errorMessage }
            : s
        )
      );
    }
  };

  const handleProjectNameConfirm = async (projectName: string) => {
    setShowProjectNameModal(false);
    const file = pendingFile;
    setPendingFile(null);

    if (!file) return;

    sessionStorage.setItem('scanvocab_project_name', projectName);
    sessionStorage.removeItem('scanvocab_project_id');
    processImage(file);
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state - no projects
  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] pb-48">
        {/* Hidden file input for empty state */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleImageSelect(file);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-[var(--color-primary)] tracking-tight">MERKEN</h1>
                {isPro && (
                  <span className="chip chip-pro">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-col items-center justify-center px-6 py-20">
          <div className="w-20 h-20 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center mb-6">
            <BookOpen className="w-10 h-10 text-[var(--color-primary)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">単語帳がありません</h2>
          <p className="text-[var(--color-muted)] text-center mb-8">
            右下のボタンから<br />ノートやプリントを撮影しましょう
          </p>
          {!isAuthenticated && (
            <p className="text-sm text-[var(--color-muted)]">
              <Link href="/signup" className="text-[var(--color-primary)] font-semibold hover:underline">
                アカウント登録
              </Link>
              でクラウド保存
            </p>
          )}
        </main>

        {/* Floating action button */}
        <button
          onClick={() => handleScanButtonClick()}
          disabled={processing || (!isPro && !canScan)}
          className="fixed bottom-[88px] left-1/2 -translate-x-1/2 w-14 h-14 flex items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-peach)] text-white rounded-full shadow-glow hover:shadow-glow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed z-30"
        >
          <Plus className="w-7 h-7" />
        </button>

        {/* Bottom Navigation */}
        <BottomNav />

        {processing && (
          <ProcessingModal
            steps={processingSteps}
            onClose={processingSteps.some((s) => s.status === 'error') ? handleCloseModal : undefined}
          />
        )}

        <ScanModeModal
          isOpen={showScanModeModal}
          onClose={() => setShowScanModeModal(false)}
          onSelectMode={handleScanModeSelect}
          isPro={isPro}
        />
        <ScanLimitModal isOpen={showScanLimitModal} onClose={() => setShowScanLimitModal(false)} todayWordsLearned={0} />
        <WordLimitModal isOpen={showWordLimitModal} onClose={() => setShowWordLimitModal(false)} currentCount={totalWords} />
        <ProjectNameModal
          isOpen={showProjectNameModal}
          onClose={() => { setShowProjectNameModal(false); setPendingFile(null); }}
          onConfirm={handleProjectNameConfirm}
        />
      </div>
    );
  }

  // Main view with project
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col pb-48">
      {/* Word limit banner */}
      {!isPro && isAlmostFull && <WordLimitBanner currentCount={totalWords} />}

      {/* Hidden file input for new project */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImageSelect(file);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-[var(--color-primary)] tracking-tight">MERKEN</h1>
              {isPro && (
                <span className="chip chip-pro">
                  <Sparkles className="w-3 h-3" />
                  Pro
                </span>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {/* Project Selector - Circular Button */}
              <button
                onClick={() => setIsProjectDropdownOpen(true)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-peach-light)] transition-all"
                title={showWrongAnswers ? '間違え一覧' : showFavoritesOnly ? '苦手な単語' : (currentProject?.title || '単語帳')}
              >
                <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
              </button>

              {isPro && !showWrongAnswers && !showFavoritesOnly && (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  {sharing ? (
                    <Loader2 className="w-5 h-5 text-[var(--color-muted)] animate-spin" />
                  ) : shareCopied ? (
                    <Check className="w-5 h-5 text-[var(--color-success)]" />
                  ) : currentProject?.shareId ? (
                    <LinkIcon className="w-5 h-5 text-[var(--color-primary)]" />
                  ) : (
                    <Share2 className="w-5 h-5 text-[var(--color-muted)]" />
                  )}
                </button>
              )}
              {!showWrongAnswers && !showFavoritesOnly && (
                <button
                  onClick={handleDeleteProject}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--color-error)]/10 transition-colors"
                >
                  <Trash2 className="w-5 h-5 text-[var(--color-muted)] hover:text-[var(--color-error)]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto px-6 py-4 w-full">

        {/* Inline Flashcard */}
        <div className="mb-6">
          <InlineFlashcard words={filteredWords} />
        </div>

        {/* Study Mode Cards - 2 column grid (hidden in wrong answers mode) */}
        {!showWrongAnswers && (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <StudyModeCard
                title="クイズ"
                description="4択単語テスト"
                icon={Play}
                href={`/quiz/${currentProject?.id}`}
                variant="red"
                disabled={filteredWords.length === 0}
              />
              <StudyModeCard
                title="カード"
                description="フラッシュカード"
                icon={Layers}
                href={isPro ? `/flashcard/${currentProject?.id}` : '/subscription'}
                variant="blue"
                disabled={filteredWords.length === 0}
                badge={!isPro ? 'Pro' : undefined}
              />
            </div>

            {/* Sentence Quiz Card - Full width (Pro only) */}
            <StudyModeCard
              title="例文クイズ"
              description="例文で単語を覚える"
              icon={BookText}
              href={isPro ? `/sentence-quiz/${currentProject?.id}` : '/subscription'}
              variant="purple"
              disabled={filteredWords.length === 0}
              badge={!isPro ? 'Pro' : undefined}
            />
          </div>
        )}

        {/* Collapsible Word List */}
        {wordsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <WordList
            words={filteredWords}
            editingWordId={editingWordId}
            onEditStart={(wordId) => setEditingWordId(wordId)}
            onEditCancel={() => setEditingWordId(null)}
            onSave={(wordId, english, japanese) => handleUpdateWord(wordId, english, japanese)}
            onDelete={(wordId) => {
              if (showWrongAnswers) {
                // Remove from wrong answers list
                removeWrongAnswer(wordId);
                setWrongAnswers(getWrongAnswers());
                showToast({ message: '間違え一覧から削除しました', type: 'success' });
              } else {
                handleDeleteWord(wordId);
              }
            }}
            onToggleFavorite={(wordId) => handleToggleFavorite(wordId)}
            onExpandChange={setIsWordListExpanded}
          />
        )}
      </main>

      {/* Floating Action Button (Add to project) - hidden in wrong answers/favorites mode */}
      {!showWrongAnswers && !showFavoritesOnly && (
        <div className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[var(--color-surface)] px-4 py-2 rounded-full shadow-card border border-[var(--color-border)]">
          <button
            onClick={() => setShowManualWordModal(true)}
            disabled={!currentProject}
            className="w-10 h-10 flex items-center justify-center bg-[var(--color-peach-light)] text-[var(--color-foreground)] rounded-full hover:bg-[var(--color-peach)]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="手で入力"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScanButtonClick(true)}
            disabled={processing || (!isPro && !canScan)}
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-peach)] text-white rounded-full shadow-glow hover:shadow-glow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="スキャン追加"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Modals */}
      {processing && (
        <ProcessingModal
          steps={processingSteps}
          onClose={processingSteps.some((s) => s.status === 'error') ? handleCloseModal : undefined}
        />
      )}

      <ScanModeModal
        isOpen={showScanModeModal}
        onClose={() => setShowScanModeModal(false)}
        onSelectMode={handleScanModeSelect}
        isPro={isPro}
      />
      <ScanLimitModal isOpen={showScanLimitModal} onClose={() => setShowScanLimitModal(false)} todayWordsLearned={0} />
      <WordLimitModal isOpen={showWordLimitModal} onClose={() => setShowWordLimitModal(false)} currentCount={totalWords} />
      <ProjectNameModal
        isOpen={showProjectNameModal}
        onClose={() => { setShowProjectNameModal(false); setPendingFile(null); }}
        onConfirm={handleProjectNameConfirm}
      />

      <EditProjectNameModal
        isOpen={editProjectModalOpen}
        onClose={() => { setEditProjectModalOpen(false); setEditProjectId(null); }}
        onConfirm={handleConfirmEditProjectName}
        currentName={editProjectNewName}
      />

      <ManualWordInputModal
        isOpen={showManualWordModal}
        onClose={() => { setShowManualWordModal(false); setManualWordEnglish(''); setManualWordJapanese(''); }}
        onConfirm={handleSaveManualWord}
        isLoading={manualWordSaving}
        english={manualWordEnglish}
        setEnglish={setManualWordEnglish}
        japanese={manualWordJapanese}
        setJapanese={setManualWordJapanese}
      />

      <DeleteConfirmModal
        isOpen={deleteWordModalOpen}
        onClose={() => { setDeleteWordModalOpen(false); setDeleteWordTargetId(null); }}
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

      {/* Project selection bottom sheet */}
      <ProjectSelectionSheet
        isOpen={isProjectDropdownOpen}
        onClose={() => setIsProjectDropdownOpen(false)}
        projects={projects}
        currentProjectIndex={currentProjectIndex}
        onSelectProject={selectProject}
        onSelectFavorites={() => {
          setShowFavoritesOnly(true);
          setShowWrongAnswers(false);
          setShowAllProjects(false);
        }}
        onSelectWrongAnswers={() => {
          setShowWrongAnswers(true);
          setShowFavoritesOnly(false);
          setShowAllProjects(false);
        }}
        onSelectAllProjects={() => {
          setShowAllProjects(true);
          setShowFavoritesOnly(false);
          setShowWrongAnswers(false);
        }}
        onCreateNewProject={() => handleScanButtonClick(false)}
        onToggleProjectFavorite={handleToggleProjectFavorite}
        onEditProject={handleEditProjectName}
        showFavoritesOnly={showFavoritesOnly}
        showWrongAnswers={showWrongAnswers}
        showAllProjects={showAllProjects}
        favoriteWords={allFavoriteWords}
        wrongAnswers={wrongAnswers}
        projectFavoriteCounts={projectFavoriteCounts}
        totalWords={totalWords}
      />
    </div>
  );
}
