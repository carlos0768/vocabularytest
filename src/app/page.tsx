'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { type ProgressStep, useToast, DeleteConfirmModal, AppShell, Icon } from '@/components/ui';
import { ScanLimitModal, WordLimitModal, WordLimitBanner } from '@/components/limits';
import { ProjectCard } from '@/components/project';
import { SyncStatusIndicator } from '@/components/pwa/SyncStatusIndicator';
import { useScanJobs } from '@/hooks/use-scan-jobs';
import { ScanJobNotifications } from '@/components/scan/ScanJobNotification';
import { getRepository } from '@/lib/db';
import { LocalWordRepository } from '@/lib/db/local-repository';
import { RemoteWordRepository, remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId, FREE_WORD_LIMIT, getWrongAnswers, removeWrongAnswer, type WrongAnswer } from '@/lib/utils';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
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
  
  // Background scan job notifications (Pro only)
  const { completedJobs, acknowledgeJob, refresh: refreshJobs } = useScanJobs();

  // Projects & navigation - Initialize from cache if available
  // ensureCacheRestored() runs synchronously so the first render uses cached data
  const [projects, setProjects] = useState<Project[]>(() => {
    ensureCacheRestored();
    return getCachedProjects();
  });
  
  // Initialize currentProjectIndex from sessionStorage if available
  const [currentProjectIndex, setCurrentProjectIndex] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedProjectId = sessionStorage.getItem('scanvocab_selected_project_id');
      if (savedProjectId) {
        const cachedProjects = getCachedProjects();
        const index = cachedProjects.findIndex(p => p.id === savedProjectId);
        if (index >= 0) return index;
      }
    }
    return 0;
  });
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
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

  // Load projects - LOCAL FIRST for instant display, then remote in background
  // All users see IndexedDB data immediately, Pro users sync from Supabase after
  const loadProjects = useCallback(async (forceReload = false) => {
    const userId = isPro && user ? user.id : getGuestUserId();
    const localRepo = new LocalWordRepository();

    // 1. Show cached data immediately (stale-while-revalidate)
    const hasCache = getHasLoaded();
    if (hasCache) {
      const cachedProjects = getCachedProjects();
      const cachedWords = getCachedProjectWords();
      setProjects(cachedProjects);
      setWords(cachedProjects[0] ? cachedWords[cachedProjects[0].id] || [] : []);
      setAllFavoriteWords(getCachedAllFavorites());
      setProjectFavoriteCounts(getCachedFavoriteCounts());
      setTotalWords(getCachedTotalWords());
      setWrongAnswers(getWrongAnswers());
      setLoading(false);
      
      // If not force reload and cache is for same user, skip fetch
      if (!forceReload && getLoadedUserId() === userId) {
        return;
      }
    }

    try {
      // Only show loading spinner if no cache (first load)
      if (!hasCache) {
        setLoading(true);
      }

      // 2. LOCAL FIRST: Always try IndexedDB first for instant display
      const guestId = getGuestUserId();
      let localData: Project[] = [];
      try {
        localData = await localRepo.getProjects(guestId);
      } catch (e) {
        console.error('Local fetch failed:', e);
      }

      // Show local data immediately if we have it and no cache was shown
      if (localData.length > 0 && !hasCache) {
        setProjects(localData);
        setLoading(false);
        // Quick load first project words from local
        const firstWords = await localRepo.getWords(localData[0].id);
        setWords(firstWords);
        setTotalWords(firstWords.length);
        setWrongAnswers(getWrongAnswers());
      }

      let data: Project[] = localData;
      let activeRepo: typeof repository = localRepo;
      
      // 3. For Pro users: fetch remote in background and merge
      if (user) {
        try {
          const remoteData = await remoteRepository.getProjects(user.id);
          if (remoteData.length > 0) {
            // Remote has data - use it (it's the source of truth for Pro)
            data = remoteData;
            activeRepo = remoteRepository;
          }
        } catch (e) {
          console.error('Remote fetch failed, using local:', e);
        }
      }
      
      setProjects(data);

      if (data.length === 0) {
        // If auth is still loading, don't show empty state yet — the user might be Pro
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

      // Phase 1: Only first project words (1 query) → show UI immediately
      firstProjectWords = await activeRepo.getWords(firstProject.id);
      total = firstProjectWords.length; // Approximate; Phase 2 gets exact count

      // Show UI immediately
      setWords(firstProjectWords);
      setTotalWords(total);
      setWrongAnswers(getWrongAnswers());
      const partialWordsCache: Record<string, Word[]> = { [firstProject.id]: firstProjectWords };
      setHomeCache({ projects: data, projectWords: partialWordsCache, allFavorites: [], favoriteCounts: {}, totalWords: total, userId });
      setLoading(false);

      // ---- Phase 2: Background load ALL words in 1 query ----
      const capturedRepository = activeRepo;
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

  // Reload projects when background scan completes
  const prevCompletedJobsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentJobIds = completedJobs.map(j => j.id);
    const prevJobIds = prevCompletedJobsRef.current;
    
    // Check if there are new completed jobs
    const hasNewJobs = currentJobIds.some(id => !prevJobIds.includes(id));
    
    if (hasNewJobs && currentJobIds.length > 0) {
      // New background scan completed - refresh project list
      invalidateHomeCache();
      loadProjects(true);
    }
    
    prevCompletedJobsRef.current = currentJobIds;
  }, [completedJobs, loadProjects]);

  // Restore selected project from sessionStorage when projects are loaded
  useEffect(() => {
    if (projects.length > 0 && typeof window !== 'undefined') {
      const savedProjectId = sessionStorage.getItem('scanvocab_selected_project_id');
      if (savedProjectId) {
        const index = projects.findIndex(p => p.id === savedProjectId);
        if (index >= 0 && index !== currentProjectIndex) {
          setCurrentProjectIndex(index);
        }
      }
    }
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const reviewDueWords = useMemo(
    () => getWordsDueForReview(allProjectsWords),
    [allProjectsWords]
  );
  const reviewDueCount = reviewDueWords.length;
  const reviewSeedProjectId = currentProject?.id ?? projects[0]?.id ?? null;
  const reviewQuizHref = reviewSeedProjectId
    ? `/quiz/${reviewSeedProjectId}?review=1&count=${reviewDueCount}&from=${encodeURIComponent('/')}`
    : '/projects';

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
    // Save selected project ID to sessionStorage for persistence
    if (projects[index]) {
      sessionStorage.setItem('scanvocab_selected_project_id', projects[index].id);
    }
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
    // Pro-only features: circled, highlighted, eiken filter, idiom modes
    if ((mode === 'circled' || mode === 'highlighted' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      setShowScanModeModal(false);
      router.push('/subscription');
      return;
    }

    setSelectedScanMode(mode as ExtractMode);
    setSelectedEikenLevel(eikenLevel);
    // Keep modal open while file picker is shown - it will be closed after file selection
    fileInputRef.current?.click();
  };

  const handleImageSelect = async (files: File[]) => {
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

    setPendingFile(files[0]); // Keep first file for project name modal compatibility
    setPendingFiles(files);

    // If adding to existing project, skip project name modal
    if (isAddingToExisting && currentProject) {
      sessionStorage.setItem('scanvocab_existing_project_id', currentProject.id);
      sessionStorage.removeItem('scanvocab_project_name');
      processMultipleImages(files);
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

  // Process multiple images with progress tracking
  const processMultipleImages = async (files: File[]) => {
    const totalFiles = files.length;
    setProcessing(true);

    // Initialize steps for multiple files
    const initialSteps: ProgressStep[] = files.map((_, index) => ({
      id: `file-${index}`,
      label: `画像 ${index + 1}/${totalFiles} を処理中...`,
      status: index === 0 ? 'active' : 'pending',
    }));
    setProcessingSteps(initialSteps);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allWords: any[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Update current step to active
        setProcessingSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < i ? 'complete' : idx === i ? 'active' : 'pending',
          label: idx === i ? `画像 ${i + 1}/${totalFiles} を処理中...` : s.label,
        })));

        // Process image (convert HEIC to JPEG if needed)
        let processedFile: File;
        try {
          processedFile = await processImageFile(file);
        } catch (imageError) {
          console.error('Image processing error:', imageError);
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx === i ? 'error' : s.status,
            label: idx === i ? `画像 ${i + 1}: 処理エラー` : s.label,
          })));
          continue;
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
          console.error(`Failed to process file ${i + 1}:`, result.error);
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx === i ? 'error' : s.status,
            label: idx === i ? `画像 ${i + 1}: エラー` : s.label,
          })));
          continue;
        }

        if (result.scanInfo) {
          setScanInfo(result.scanInfo);
        }

        // Merge words from this file
        allWords.push(...result.words);

        // Mark current step as complete
        setProcessingSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx === i ? 'complete' : s.status,
          label: idx === i ? `画像 ${i + 1}/${totalFiles} 完了` : s.label,
        })));
      }

      if (allWords.length === 0) {
        throw new Error('画像から単語を読み取れませんでした');
      }

      // Save merged results to sessionStorage
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(allWords));

      setProcessingSteps(prev => [
        ...prev.map(s => ({ ...s, status: 'complete' as const })),
        { id: 'navigate', label: '結果を表示中...', status: 'active' },
      ]);

      router.push('/scan/confirm');
      setProcessing(false);
    } catch (error) {
      console.error('Scan error:', error);
      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' || s.status === 'pending'
            ? {
                ...s,
                status: 'error',
                label: error instanceof Error ? error.message : '予期しないエラーが発生しました',
              }
            : s
        )
      );
    }
  };

  const handleProjectNameConfirm = async (projectName: string) => {
    setShowProjectNameModal(false);
    const files = pendingFiles.length > 0 ? pendingFiles : (pendingFile ? [pendingFile] : []);
    setPendingFile(null);
    setPendingFiles([]);

    if (files.length === 0) return;

    sessionStorage.setItem('scanvocab_project_name', projectName);
    sessionStorage.removeItem('scanvocab_project_id');
    
    if (files.length === 1) {
      processImage(files[0]);
    } else {
      processMultipleImages(files);
    }
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  // Loading state (include authLoading to prevent flash of logged-out UI)
  if (loading || (authLoading && projects.length === 0)) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  // Empty state - no projects (only show after auth is resolved)
  if (projects.length === 0) {
    return (
      <AppShell>
        <div className="pb-48">
          {/* Hidden file input for empty state */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.pdf,application/pdf"
            multiple
            onChange={(e) => {
              setShowScanModeModal(false);
              const files = e.target.files;
              if (files && files.length > 0) {
                handleImageSelect(Array.from(files));
              }
              e.target.value = '';
            }}
            className="hidden"
          />

          <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4 lg:hidden">
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-[var(--color-primary)] tracking-tight font-display">MERKEN</h1>
                  {isPro && (
                    <span className="chip chip-pro">
                      <Icon name="auto_awesome" size={14} />
                      Pro
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex flex-col items-center justify-center px-6 py-20">
            <div className="w-20 h-20 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center mb-6">
              <Icon name="menu_book" size={40} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">単語帳がありません</h2>
            <p className="text-[var(--color-muted)] text-center mb-8">
              下のカメラボタンから<br />ノートやプリントを撮影しましょう
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
      </AppShell>
    );
  }

  // Main view with project
  return (
    <AppShell>
      <div className="flex flex-col pb-28 lg:pb-8">
        {/* Word limit banner */}
        {!isPro && isAlmostFull && <WordLimitBanner currentCount={totalWords} />}

        {/* Hidden file input for new project (legacy scan flow) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif,.pdf,application/pdf"
          multiple
          onChange={(e) => {
            setShowScanModeModal(false);
            const files = e.target.files;
            if (files && files.length > 0) {
              handleImageSelect(Array.from(files));
            }
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* Header - mobile only */}
        <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 border-b border-[var(--color-border-light)] lg:hidden">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-[var(--color-foreground)] font-display tracking-tight">MERKEN</h1>
              <p className="text-xs text-[var(--color-muted)]">手入力ゼロで単語帳を作成</p>
            </div>
            <div className="flex items-center gap-2">
              {isPro && (
                <>
                  <SyncStatusIndicator />
                  <span className="chip chip-pro">
                    <Icon name="auto_awesome" size={14} />
                    Pro
                  </span>
                </>
              )}
              <Link
                href="/projects"
                className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-foreground)]"
                aria-label="単語帳一覧"
              >
                <Icon name="folder" size={24} />
              </Link>
            </div>
          </div>
        </header>

        {/* Desktop header */}
        <header className="hidden lg:block px-8 py-6">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-foreground)] font-display">ダッシュボード</h1>
              <p className="text-sm text-[var(--color-muted)] mt-1">手入力ゼロで単語帳を作成</p>
            </div>
            <div className="flex items-center gap-3">
              {isPro && (
                <>
                  <SyncStatusIndicator />
                  <span className="chip chip-pro">
                    <Icon name="auto_awesome" size={14} />
                    Pro
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 py-6 w-full space-y-6">
          {/* Review section */}
          <section className="card p-4 lg:p-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--color-muted)]">復習セクション</p>
              <p className="text-lg font-bold text-[var(--color-foreground)] mt-1">
                {reviewDueCount > 0 ? `今日の復習 ${reviewDueCount}語` : '今日は復習がありません'}
              </p>
            </div>
            {reviewDueCount > 0 && (
              <Link
                href={reviewQuizHref}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary-dark transition-colors"
              >
                復習クイズへ
              </Link>
            )}
          </section>

          {/* Quick actions */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/scan" className="card p-4 flex flex-col gap-3 hover:shadow-card hover:border-primary/30 transition-all">
              <div className="w-10 h-10 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)]">
                <Icon name="add" size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">新しくスキャン</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">ノートやプリントを取り込む</p>
              </div>
            </Link>
            <Link href="/favorites" className="card p-4 flex flex-col gap-3 hover:shadow-card hover:border-primary/30 transition-all">
              <div className="w-10 h-10 rounded-full bg-[var(--color-warning-light)] flex items-center justify-center text-[var(--color-warning)]">
                <Icon name="flag" size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">苦手単語</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">復習が必要な単語を確認</p>
              </div>
            </Link>
          </section>

          {/* Recent projects */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-muted)]">最近の単語帳</h2>
              <Link href="/projects" className="text-xs text-[var(--color-primary)] font-semibold">すべて見る</Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {projects.length === 0 ? (
                <div className="card p-5 text-sm text-[var(--color-muted)] text-center">
                  まだ単語帳がありません。スキャンから始めましょう。
                </div>
              ) : (
                [...projects]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 4)
                  .map((project) => {
                    const projectWords = getCachedProjectWords()[project.id] || [];
                    const mastered = projectWords.filter((w) => w.status === 'mastered').length;
                    const progress = projectWords.length > 0 ? Math.round((mastered / projectWords.length) * 100) : 0;
                    return (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        wordCount={projectWords.length}
                        masteredCount={mastered}
                        progress={progress}
                      />
                    );
                  })
              )}
            </div>
          </section>
        </main>

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

      {/* Background scan job completion notifications */}
      {isPro && (
        <ScanJobNotifications
          jobs={completedJobs}
          onDismiss={(jobId) => {
            acknowledgeJob(jobId);
            // Refresh projects to show the new one
            loadProjects();
          }}
        />
      )}
      </div>
    </AppShell>
  );
}
