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
import { LocalWordRepository } from '@/lib/db/local-repository';
import { RemoteWordRepository, remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId, FREE_WORD_LIMIT, getWrongAnswers, removeWrongAnswer, type WrongAnswer } from '@/lib/utils';
import { prefetchStats } from '@/lib/stats-cache';
import { processImageFile } from '@/lib/image-utils';
import {
  getCachedProjects,
  getCachedProjectWords,
  getCachedAllFavorites,
  getCachedFavoriteCounts,
  getCachedTotalWords,
  getHasLoaded,
  getLoadedUserId,
  setHomeCache,
  updateProjectWordsCache,
  invalidateHomeCache,
  restoreFromSessionStorage,
} from '@/lib/home-cache';
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

// Scan mode types
type ScanMode = ExtractMode;

/**
 * Synchronously attempt to restore home cache from sessionStorage or in-memory.
 * Called once during module init (before any React render) so the very first
 * render can display data instead of a spinner.
 */
function ensureCacheRestored(): boolean {
  if (getHasLoaded()) return true;
  if (typeof window !== 'undefined') {
    const guestId = getGuestUserId();
    const snapshot = restoreFromSessionStorage(guestId);
    if (snapshot && snapshot.projects.length > 0) {
      setHomeCache(snapshot);
      return true;
    }
  }
  return false;
}

export default function HomePage() {
  const router = useRouter();
  const { user, subscription, isAuthenticated, isPro, loading: authLoading } = useAuth();
  const { isAlmostFull, isAtLimit, refresh: refreshWordCount } = useWordCount();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Projects & navigation - Initialize from cache if available
  // ensureCacheRestored() runs synchronously so the first render uses cached data
  const [projects, setProjects] = useState<Project[]>(() => {
    ensureCacheRestored();
    return getCachedProjects();
  });
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [words, setWords] = useState<Word[]>(() => {
    const cachedProjects = getCachedProjects();
    const cachedWords = getCachedProjectWords();
    return cachedProjects[0] ? cachedWords[cachedProjects[0].id] || [] : [];
  });
  const [allFavoriteWords, setAllFavoriteWords] = useState<Word[]>(() => getCachedAllFavorites());
  const [projectFavoriteCounts, setProjectFavoriteCounts] = useState<Record<string, number>>(() => getCachedFavoriteCounts());
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>(() => getWrongAnswers());
  const [showWrongAnswers, setShowWrongAnswers] = useState(false); // Show wrong answers mode
  const [showAllProjects, setShowAllProjects] = useState(false); // Show all projects combined mode
  const [totalWords, setTotalWords] = useState(() => getCachedTotalWords());
  // Start with loading=false if cache is already populated (in-memory or sessionStorage)
  const [loading, setLoading] = useState(() => !getHasLoaded());
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

  // Load projects - 2-phase: fast first paint, then full data in background
  const loadProjects = useCallback(async (forceReload = false) => {
    const userId = isPro && user ? user.id : getGuestUserId();

    // Skip if already loaded for this user (unless force reload)
    if (!forceReload && getHasLoaded() && getLoadedUserId() === userId) {
      const cachedProjects = getCachedProjects();
      const cachedWords = getCachedProjectWords();
      setProjects(cachedProjects);
      setWords(cachedProjects[0] ? cachedWords[cachedProjects[0].id] || [] : []);
      setAllFavoriteWords(getCachedAllFavorites());
      setProjectFavoriteCounts(getCachedFavoriteCounts());
      setTotalWords(getCachedTotalWords());
      setWrongAnswers(getWrongAnswers());
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await repository.getProjects(userId);
      setProjects(data);

      if (data.length === 0) {
        // If auth is still loading, don't show empty state yet  Ethe user might be Pro
        // and the real data will come from Supabase after auth completes.
        if (authLoading) {
          return;
        }
        setTotalWords(0);
        setAllFavoriteWords([]);
        setProjectFavoriteCounts({});
        setWords([]);
        setHomeCache({ projects: [], projectWords: {}, allFavorites: [], favoriteCounts: {}, totalWords: 0, userId });
        setLoading(false);
        return;
      }

      // ---- Phase 1: Fast first paint ----
      // Only fetch: current project words + total word count
      const firstProject = data[0];

      let firstProjectWords: Word[] = [];
      let total: number;

      // Phase 1: Only first project words (1 query) ↁEshow UI immediately
      firstProjectWords = await repository.getWords(firstProject.id);
      total = firstProjectWords.length; // Approximate; Phase 2 gets exact count

      // Show UI immediately
      setWords(firstProjectWords);
      setTotalWords(total);
      setWrongAnswers(getWrongAnswers());
      const partialWordsCache: Record<string, Word[]> = { [firstProject.id]: firstProjectWords };
      setHomeCache({ projects: data, projectWords: partialWordsCache, allFavorites: [], favoriteCounts: {}, totalWords: total, userId });
      setLoading(false);

      // ---- Phase 2: Background load ALL words in 1 query ----
      const capturedRepository = repository;
      setTimeout(async () => {
        try {
          const projectIds = data.map(p => p.id);
          let fullWordsCache: Record<string, Word[]>;

          if (capturedRepository instanceof RemoteWordRepository) {
            // Pro: 1 Supabase query with IN clause
            fullWordsCache = await capturedRepository.getAllWordsByProjectIds(projectIds);
          } else if (capturedRepository instanceof LocalWordRepository) {
            // Free: 1 IndexedDB query with anyOf
            fullWordsCache = await capturedRepository.getAllWordsByProject(projectIds);
          } else {
            // Fallback: parallel individual queries
            const wordPromises = data.map(project => capturedRepository.getWords(project.id));
            const allProjectWords = await Promise.all(wordPromises);
            fullWordsCache = {};
            data.forEach((project, index) => {
              fullWordsCache[project.id] = allProjectWords[index];
            });
          }

          const allFavorites: Word[] = [];
          const favoriteCounts: Record<string, number> = {};
          let recalcTotal = 0;
          data.forEach((project) => {
            const pw = fullWordsCache[project.id] || [];
            recalcTotal += pw.length;
            const pf = pw.filter(w => w.isFavorite);
            favoriteCounts[project.id] = pf.length;
            allFavorites.push(...pf);
          });

          setHomeCache({ projects: data, projectWords: fullWordsCache, allFavorites, favoriteCounts, totalWords: recalcTotal, userId });
          setAllFavoriteWords(allFavorites);
          setProjectFavoriteCounts(favoriteCounts);
          setTotalWords(recalcTotal);
        } catch (err) {
          console.error('Phase 2 background load failed:', err);
        }
      }, 0);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, [isPro, user, repository, authLoading]);

  // Load words for current project - use cache if available
  const loadWords = useCallback(async () => {
    if (!currentProject) {
      setWords([]);
      return;
    }

    // Check shared cache first
    const cachedWords = getCachedProjectWords()[currentProject.id];
    if (cachedWords) {
      setWords(cachedWords);
      return;
    }

    // Fallback to API if not in cache
    try {
      setWordsLoading(true);
      const wordsData = await repository.getWords(currentProject.id);
      setWords(wordsData);
      updateProjectWordsCache(currentProject.id, wordsData);
    } catch (error) {
      console.error('Failed to load words:', error);
    } finally {
      setWordsLoading(false);
    }
  }, [currentProject, repository]);

  // Strategy 2: Start loading immediately for Free users (IndexedDB doesn't need auth).
  // Once auth resolves, reload if the user turns out to be Pro (needs Supabase).
  const hasEagerLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasEagerLoadedRef.current && !getHasLoaded()) {
      // First mount, no cache: start loading with guest/local repository right away
      hasEagerLoadedRef.current = true;
      loadProjects();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When auth finishes, reload if user is Pro (repository changes to remote)
  // or prefetch stats
  useEffect(() => {
    if (!authLoading) {
      if (isPro) {
        // Pro user: need to reload from Supabase (different repository)
        loadProjects(true);
      } else if (!hasEagerLoadedRef.current) {
        // Auth finished but eager load didn't fire yet
        loadProjects();
      }
      // Prefetch stats data so the stats page opens instantly
      prefetchStats(subscriptionStatus, user?.id ?? null, isPro);
    }
  }, [authLoading, isPro, loadProjects, subscriptionStatus, user?.id]);

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
    return Object.values(getCachedProjectWords()).flat();
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
      showToast({ message: 'ブックマ�Eクの変更に失敗しました', type: 'error' });
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
      showToast({ message: '英単語と日本語訳を�E力してください', type: 'error' });
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
        invalidateHomeCache();
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
      showToast({ message: '単語�E保存に失敗しました', type: 'error' });
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
      showToast({ message: '共有リンクの生�Eに失敗しました', type: 'error' });
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
        message: 'ログインが忁E��でぁE,
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
      { id: 'upload', label: '画像をアチE�Eロード中...', status: 'active' },
      { id: 'analyze', label: '斁E��を解析中...', status: 'pending' },
    ]);

    try {
      // Process image (convert HEIC to JPEG if needed)
      let processedFile: File;
      try {
        processedFile = await processImageFile(file);
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        throw new Error('画像�E処琁E��失敗しました。別の画像をお試しください、E);
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
        { id: 'upload', label: '画像をアチE�Eロード中...', status: 'complete' },
        { id: 'analyze', label: '斁E��を解析中...', status: 'active' },
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
        { id: 'upload', label: '画像をアチE�Eロード中...', status: 'complete' },
        { id: 'analyze', label: '斁E��を解析中...', status: 'complete' },
      ]);

      // Save result to sessionStorage and navigate to confirm page
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(result.words));
      // Navigate first, then close processing modal
      // (closing modal before navigation causes a flash of the home screen)
      router.push('/scan/confirm');
      setProcessing(false);
    } catch (error) {
      console.error('Scan error:', error);

      let errorMessage = '予期しなぁE��ラー';
      if (error instanceof Error) {
        if (error.message.includes('did not match the expected pattern')) {
          errorMessage = '画像データの処琁E��問題が発生しました。カメラ設定を「互換性優先」にするか、スクリーンショチE��をお試しください、E;
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
            右下�Eボタンから<br />ノ�Eトやプリントを撮影しましょぁE
          </p>
          {!isAuthenticated && (
            <p className="text-sm text-[var(--color-muted)]">
              <Link href="/signup" className="text-[var(--color-primary)] font-semibold hover:underline">
                アカウント登録
              </Link>
              でクラウド保孁E
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
                title={showWrongAnswers ? '間違え一覧' : showFavoritesOnly ? '苦手な単誁E : (currentProject?.title || '単語帳')}
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
                description="4択単語テスチE
                icon={Play}
                href={`/quiz/${currentProject?.id}`}
                variant="red"
                disabled={filteredWords.length === 0}
              />
              <StudyModeCard
                title="カーチE
                description="フラチE��ュカーチE
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
              description="例文で単語を覚えめE
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
            title="手で入劁E
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
        message="こ�E単語を削除します。この操作�E取り消せません、E
        isLoading={deleteWordLoading}
      />

      <DeleteConfirmModal
        isOpen={deleteProjectModalOpen}
        onClose={() => setDeleteProjectModalOpen(false)}
        onConfirm={handleConfirmDeleteProject}
        title="単語帳を削除"
        message="こ�E単語帳とすべての単語が削除されます。この操作�E取り消せません、E
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
