'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { type ProgressStep, useToast, DeleteConfirmModal, Icon } from '@/components/ui';
import { ScanLimitModal, WordLimitModal, WordLimitBanner } from '@/components/limits';
import { ProjectCard } from '@/components/project/ProjectCard';
import { SyncStatusIndicator } from '@/components/pwa/SyncStatusIndicator';
import { useCollections } from '@/hooks/use-collections';
import { useScanJobs } from '@/hooks/use-scan-jobs';
import { ScanJobNotifications } from '@/components/scan/ScanJobNotification';
import { getRepository } from '@/lib/db';
import { LocalWordRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getWordsByProjectMap } from '@/lib/projects/load-helpers';
import { getGuestUserId, FREE_WORD_LIMIT, getWrongAnswers, removeWrongAnswer, getDailyStats, getStreakDays, type WrongAnswer } from '@/lib/utils';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import { prefetchStats } from '@/lib/stats-cache';
import { expandFilesForScan, isPdfFile, processImageToBase64 } from '@/lib/image-utils';
import { createBrowserClient } from '@/lib/supabase';
import { getCachedSupabaseUserId } from '@/lib/supabase/session-cache';
import { hasVisitedProject } from '@/lib/project-visit';
import { ensureWebPushSubscription } from '@/lib/notifications/push-client';
import { mergeSourceLabels } from '../../shared/source-labels';
import { mergeLexiconEntries } from '../../shared/lexicon';
import {
  getCachedProjects,
  getCachedProjectWords,
  getCachedAllFavorites,
  getCachedFavoriteCounts,
  getCachedTotalWords,
  getHasLoaded,
  setHomeCache,
  updateProjectWordsCache,
  invalidateHomeCache,
  restoreFromSessionStorage,
} from '@/lib/home-cache';
import type { LexiconEntry, Project, Word } from '@/types';
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
    const userId = getCachedSupabaseUserId() ?? getGuestUserId();
    const snapshot = restoreFromSessionStorage(userId);
    if (snapshot) {
      setHomeCache(snapshot);
      return true;
    }
  }
  return false;
}

export default function HomePage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { user, subscription, isAuthenticated, isPro, wasPro, loading: authLoading, sessionExpired } = useAuth();
  const { isAlmostFull, isAtLimit, refresh: refreshWordCount } = useWordCount();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Background scan job notifications (Pro only)
  const { completedJobs, acknowledgeJob, refresh: refreshJobs } = useScanJobs();

  // Collections (Pro only)
  const { collections, loading: collectionsLoading } = useCollections();

  // Projects & navigation — empty initial state for SSR/hydration safety.
  // Cache is restored in useLayoutEffect below (client-only, before first paint).
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [allFavoriteWords, setAllFavoriteWords] = useState<Word[]>([]);
  const [projectFavoriteCounts, setProjectFavoriteCounts] = useState<Record<string, number>>({});
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [showWrongAnswers, setShowWrongAnswers] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [totalWords, setTotalWords] = useState(0);

  // Daily learning stats — default values matching server render, updated after mount
  const [dailyStats, setDailyStats] = useState({ todayCount: 0, correctCount: 0, masteredCount: 0 });
  const [streakDays, setStreakDays] = useState(0);
  const accuracyPercent = dailyStats.todayCount > 0
    ? Math.round((dailyStats.correctCount / dailyStats.todayCount) * 100)
    : 0;

  // Always start as loading; cache restore below may clear it immediately
  const [loading, setLoading] = useState(true);

  // Restore sessionStorage/in-memory cache before first paint (client-only).
  // Server and client both start with identical empty state, preventing hydration #418.
  const cacheRestoredRef = useRef(false);
  useLayoutEffect(() => {
    if (cacheRestoredRef.current) return;
    cacheRestoredRef.current = true;
    ensureCacheRestored();
    if (getHasLoaded()) {
      const cachedProjects = getCachedProjects();
      const cachedWords = getCachedProjectWords();
      setProjects(cachedProjects);
      setWords(cachedProjects[0] ? cachedWords[cachedProjects[0].id] ?? [] : []);
      setAllFavoriteWords(getCachedAllFavorites());
      setProjectFavoriteCounts(getCachedFavoriteCounts());
      setTotalWords(getCachedTotalWords());
      setWrongAnswers(getWrongAnswers());
      setDailyStats(getDailyStats());
      setStreakDays(getStreakDays());
      // Restore selected project index
      const savedProjectId = sessionStorage.getItem('scanvocab_selected_project_id');
      if (savedProjectId) {
        const idx = cachedProjects.findIndex(p => p.id === savedProjectId);
        if (idx >= 0) setCurrentProjectIndex(idx);
      }
      setLoading(false);
    }
  }, []);
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
  const [scanUploadStatus, setScanUploadStatus] = useState<'uploading' | 'done' | 'error' | undefined>(undefined);
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
  const [deleteProjectTargetId, setDeleteProjectTargetId] = useState<string | null>(null);

  // Edit project name modal
  const [editProjectModalOpen, setEditProjectModalOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editProjectNewName, setEditProjectNewName] = useState('');

  // Manual word input modal
  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);
  const notifiedJobIdsRef = useRef<Set<string>>(new Set());
  const autoAcknowledgingJobIdsRef = useRef<Set<string>>(new Set());
  const syncedPushUserIdRef = useRef<string | null>(null);

  // Get repository
  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  // Current project
  const currentProject = projects[currentProjectIndex] || null;
  // Scan info is populated from server responses

  // Note: Body scroll locking removed to allow page scrolling

  // Load projects - LOCAL FIRST for instant display, then remote in background
  // All users see IndexedDB data immediately, Pro users sync from Supabase after
  const loadProjects = useCallback(async (forceReload = false) => {
    const userId = user ? user.id : getGuestUserId();
    const localRepo = new LocalWordRepository();

    // 1. Show cached data immediately (stale-while-revalidate)
    const hasCache = getHasLoaded();
    if (hasCache && !forceReload) {
      const cachedProjects = getCachedProjects();
      const cachedWords = getCachedProjectWords();
      setProjects(cachedProjects);
      setWords(cachedProjects[0] ? cachedWords[cachedProjects[0].id] || [] : []);
      setAllFavoriteWords(getCachedAllFavorites());
      setProjectFavoriteCounts(getCachedFavoriteCounts());
      setTotalWords(getCachedTotalWords());
      setWrongAnswers(getWrongAnswers());
      setLoading(false);
    }

    try {
      // Only show loading spinner if no cache (first load)
      if (!hasCache) {
        setLoading(true);
      }

      // 2. LOCAL FIRST: Always try IndexedDB first for instant display
      let localData: Project[] = [];
      try {
        localData = await localRepo.getProjects(userId);
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
      if (!hasCache && data.length > 0) {
        setLoading(false);
      }

      if (data.length === 0) {
        // Always stop loading spinner — if auth is still pending and user is Pro,
        // the auth-resolved useEffect will trigger a reload with remote data.
        setLoading(false);
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

      // Phase 1: Only first project words (1 query) → show UI immediately
      const firstProjectWords = await activeRepo.getWords(firstProject.id);
      const total = firstProjectWords.length; // Approximate; Phase 2 gets exact count

      // Show UI immediately — merge with existing cache to avoid zeroing out other projects
      setWords(firstProjectWords);
      const existingProjectWords = getCachedProjectWords();
      const mergedProjectWords: Record<string, Word[]> = { ...existingProjectWords, [firstProject.id]: firstProjectWords };
      const mergedTotal = Object.values(mergedProjectWords).reduce((sum, ws) => sum + ws.length, 0);
      setTotalWords(mergedTotal || total);
      setWrongAnswers(getWrongAnswers());
      const existingFavorites = getCachedAllFavorites();
      const existingFavoriteCounts = getCachedFavoriteCounts();
      setHomeCache({
        projects: data,
        projectWords: mergedProjectWords,
        allFavorites: existingFavorites.length > 0 ? existingFavorites : [],
        favoriteCounts: Object.keys(existingFavoriteCounts).length > 0 ? existingFavoriteCounts : {},
        totalWords: mergedTotal || total,
        userId,
      });
      setLoading(false);

      // ---- Phase 2: Background load ALL words in 1 query ----
      const capturedRepository = activeRepo;
      setTimeout(async () => {
        try {
          const projectIds = data.map(p => p.id);
          const fullWordsCache = await getWordsByProjectMap(capturedRepository, projectIds);

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
  }, [user]);

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
  // or prefetch stats. Track previous status to avoid unnecessary reloads on tab return.
  const prevSubscriptionStatusRef = useRef<string | null>(null);
  const hasAuthLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!authLoading) {
      const statusChanged = prevSubscriptionStatusRef.current !== null &&
        prevSubscriptionStatusRef.current !== subscriptionStatus;
      const isFirstAuthLoad = !hasAuthLoadedOnceRef.current;
      hasAuthLoadedOnceRef.current = true;
      prevSubscriptionStatusRef.current = subscriptionStatus;

      if (isFirstAuthLoad) {
        // First auth resolution — always reload for Pro (needs remote data)
        // For free users, reload if no projects were found in eager load
        if (isPro) {
          loadProjects(true);
        } else if (projects.length === 0) {
          loadProjects(true);
        }
      } else if (statusChanged) {
        // Subscription status actually changed (e.g., upgraded/downgraded)
        loadProjects(true);
      }
      // Skip reload on tab return when nothing changed

      prefetchStats(subscriptionStatus, user?.id ?? null, isPro, wasPro);
    }
  }, [authLoading, isPro, wasPro, loadProjects, subscriptionStatus, user?.id]);

  // Keep push subscription ownership aligned with the currently logged-in user.
  useEffect(() => {
    if (!user?.id) {
      syncedPushUserIdRef.current = null;
      return;
    }

    if (syncedPushUserIdRef.current === user.id) {
      return;
    }
    syncedPushUserIdRef.current = user.id;

    const syncPushSubscription = async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      await ensureWebPushSubscription({
        accessToken: session.access_token,
        requestPermission: false,
      });
    };

    syncPushSubscription().catch(() => {
      // ignore push setup failures
    });
  }, [user?.id]);

  // Load words when project changes
  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // Reload projects immediately when a new background scan completes.
  const prevCompletedJobIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentCompletedJobIds = completedJobs
      .filter((job) => job.status === 'completed')
      .map((job) => job.id);
    const prevJobIds = prevCompletedJobIdsRef.current;

    const hasNewCompletedJobs = currentCompletedJobIds.some((id) => !prevJobIds.includes(id));
    if (hasNewCompletedJobs) {
      invalidateHomeCache();
      loadProjects(true);
    }

    prevCompletedJobIdsRef.current = currentCompletedJobIds;
  }, [completedJobs, loadProjects]);

  // Dismiss delayed scan notifications if user has already accessed the project.
  useEffect(() => {
    const alreadyVisitedJobs = completedJobs.filter(
      (job) =>
        job.project_id &&
        hasVisitedProject(job.project_id) &&
        !autoAcknowledgingJobIdsRef.current.has(job.id)
    );
    if (alreadyVisitedJobs.length === 0) return;
    alreadyVisitedJobs.forEach((job) => {
      autoAcknowledgingJobIdsRef.current.add(job.id);
      acknowledgeJob(job.id);
    });
  }, [completedJobs, acknowledgeJob]);

  const displayedProjectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);

  // Only notify once the project is actually visible on Home.
  const notifiableJobs = useMemo(() => {
    return completedJobs.filter((job) => {
      if (job.project_id && hasVisitedProject(job.project_id)) {
        return false;
      }
      if (job.status === 'completed' && job.project_id) {
        return displayedProjectIds.has(job.project_id);
      }
      return true;
    });
  }, [completedJobs, displayedProjectIds]);

  // Show system notifications whenever Notification API is available.
  useEffect(() => {
    const freshJobs = notifiableJobs.filter((job) => !notifiedJobIdsRef.current.has(job.id));
    if (freshJobs.length === 0) return;
    freshJobs.forEach((job) => notifiedJobIdsRef.current.add(job.id));

    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const showNotifications = async () => {
      const grouped = new Map<string, { title: string; wordCount: number; hasFailed: boolean; hasGrammarWarning: boolean }>();

      for (const job of freshJobs) {
        const key = job.project_id || job.project_title || job.id;
        const existing = grouped.get(key);
        let wordCount = 0;
        let hasGrammarWarning = false;
        try {
          const parsed = job.result ? JSON.parse(job.result) : null;
          wordCount = typeof parsed?.wordCount === 'number' ? parsed.wordCount : 0;
          hasGrammarWarning = Array.isArray(parsed?.warnings) && parsed.warnings.includes('grammar_not_found');
        } catch {
          wordCount = 0;
          hasGrammarWarning = false;
        }

        if (existing) {
          existing.wordCount += wordCount;
          existing.hasFailed = existing.hasFailed || job.status === 'failed';
          existing.hasGrammarWarning = existing.hasGrammarWarning || hasGrammarWarning;
        } else {
          grouped.set(key, {
            title: job.project_title || '単語帳',
            wordCount,
            hasFailed: job.status === 'failed',
            hasGrammarWarning,
          });
        }
      }

      const entries = Array.from(grouped.entries());
      for (const [key, entry] of entries) {
        const title = entry.hasFailed
          ? 'MERKEN: スキャン失敗'
          : entry.hasGrammarWarning
          ? 'MERKEN: 文法抽出なし'
          : 'MERKEN: スキャン完了';
        const body = entry.hasFailed
          ? `「${entry.title}」のスキャンに失敗しました`
          : entry.hasGrammarWarning
          ? `「${entry.title}」で文法抽出が見つからなかったため、通常抽出に切り替えました`
          : `「${entry.title}」に${entry.wordCount}語追加されました`;

        try {
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              await registration.showNotification(title, {
                body,
                tag: `scan-job-${key}`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
              });
            } else {
              new Notification(title, { body, tag: `scan-job-${key}` });
            }
          } else {
            // Fallback when service worker is unavailable
            new Notification(title, { body, tag: `scan-job-${key}` });
          }
        } catch {
          // ignore notification delivery errors
        }
      }
    };

    const shouldSkipLocalNotifications = async (): Promise<boolean> => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          return false;
        }
        const subscription = await registration.pushManager.getSubscription();
        return subscription !== null;
      } catch {
        return false;
      }
    };

    const deliverLocalNotifications = async () => {
      const skipLocal = await shouldSkipLocalNotifications();
      if (skipLocal) return;
      await showNotifications();
    };

    if (Notification.permission === 'granted') {
      deliverLocalNotifications().catch(() => {
        // ignore
      });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          deliverLocalNotifications().catch(() => {
            // ignore
          });
        }
      }).catch(() => {
        // ignore
      });
    }
  }, [notifiableJobs]);

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
      showToast({ message: 'ピン留めの変更に失敗しました', type: 'error' });
    }
  };

  // Project handlers
  const handleDeleteProject = (projectId?: string) => {
    setDeleteProjectTargetId(projectId || currentProject?.id || null);
    setDeleteProjectModalOpen(true);
  };

  const handleConfirmDeleteProject = async () => {
    const targetId = deleteProjectTargetId || currentProject?.id;
    if (!targetId) return;

    setDeleteProjectLoading(true);
    try {
      await repository.deleteProject(targetId);
      const newProjects = projects.filter((p) => p.id !== targetId);
      setProjects(newProjects);
      if (currentProjectIndex >= newProjects.length && newProjects.length > 0) {
        setCurrentProjectIndex(newProjects.length - 1);
      }
      invalidateHomeCache();
      refreshWordCount();
      showToast({ message: '単語帳を削除しました', type: 'success' });
    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteProjectLoading(false);
      setDeleteProjectModalOpen(false);
      setDeleteProjectTargetId(null);
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
    // Pro-only: circled, eiken, idiom
    if ((mode === 'circled' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      setShowScanModeModal(false);
      startTransition(() => { router.push('/subscription'); });
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
          onClick: () => startTransition(() => { router.push('/login'); }),
        },
        duration: 4000,
      });
      return;
    }

    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    let scanFiles = files;
    if (files.some((file) => isPdfFile(file))) {
      try {
        scanFiles = await expandFilesForScan(files);
      } catch (error) {
        showToast({
          message: error instanceof Error ? error.message : 'PDFの処理に失敗しました',
          type: 'error',
          duration: 4000,
        });
        return;
      }
    }

    setPendingFile(scanFiles[0] ?? null); // Keep first file for project name modal compatibility
    setPendingFiles(scanFiles);

    // If adding to existing project, skip project name modal
    if (isAddingToExisting && currentProject) {
      sessionStorage.setItem('scanvocab_existing_project_id', currentProject.id);
      sessionStorage.removeItem('scanvocab_project_name');
      sessionStorage.removeItem('scanvocab_project_icon');
      processMultipleImages(scanFiles);
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
      // Process image/PDF and convert to base64
      let base64: string;
      try {
        base64 = await processImageToBase64(file);
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        throw new Error('画像の処理に失敗しました。別の画像をお試しください。');
      }

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
      sessionStorage.setItem('scanvocab_source_labels', JSON.stringify(mergeSourceLabels(result.sourceLabels)));
      sessionStorage.setItem('scanvocab_lexicon_entries', JSON.stringify(mergeLexiconEntries(result.lexiconEntries)));
      // Navigate first, then close processing modal
      // (closing modal before navigation causes a flash of the home screen)
      startTransition(() => { router.push('/scan/confirm'); });
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
      let allSourceLabels: string[] = [];
      let allLexiconEntries: LexiconEntry[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Update current step to active
        setProcessingSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < i ? 'complete' : idx === i ? 'active' : 'pending',
          label: idx === i ? `画像 ${i + 1}/${totalFiles} を処理中...` : s.label,
        })));

        // Process image/PDF and convert to base64
        let base64: string;
        try {
          base64 = await processImageToBase64(file);
        } catch (imageError) {
          console.error('Image processing error:', imageError);
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx === i ? 'error' : s.status,
            label: idx === i ? `画像 ${i + 1}: 処理エラー` : s.label,
          })));
          continue;
        }

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
        allSourceLabels = mergeSourceLabels(allSourceLabels, result.sourceLabels);
        allLexiconEntries = mergeLexiconEntries(allLexiconEntries, result.lexiconEntries);

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
      sessionStorage.setItem('scanvocab_source_labels', JSON.stringify(allSourceLabels));
      sessionStorage.setItem('scanvocab_lexicon_entries', JSON.stringify(allLexiconEntries));

      setProcessingSteps(prev => [
        ...prev.map(s => ({ ...s, status: 'complete' as const })),
        { id: 'navigate', label: '結果を表示中...', status: 'active' },
      ]);

      startTransition(() => { router.push('/scan/confirm'); });
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

  const handleProjectNameConfirm = async (projectName: string, projectIcon?: string) => {
    const files = pendingFiles.length > 0 ? pendingFiles : (pendingFile ? [pendingFile] : []);
    setPendingFile(null);
    setPendingFiles([]);

    if (files.length === 0) return;
    const hasPdf = files.some((file) => isPdfFile(file));
    const canUseBackground = files.length <= 20;

    // Pro users: use background upload (same as /scan page)
    if (isPro && user && !hasPdf && canUseBackground) {
      setScanUploadStatus('uploading');
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('認証が必要です');

        void ensureWebPushSubscription({
          accessToken: session.access_token,
          requestPermission: true,
        });

        // Compress and upload images to Supabase Storage
        const uploadedPaths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

          let blob: Blob;
          let contentType: string;
          let ext: string;

          if (isPdf) {
            // PDF: upload as-is without compression
            blob = file;
            contentType = 'application/pdf';
            ext = '.pdf';
          } else {
            // Image: compress via canvas
            blob = await new Promise<Blob>((resolve, reject) => {
              const img = new Image();
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const objectUrl = URL.createObjectURL(file);
              img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                const MAX_DIM = 1600;
                let { width, height } = img;
                if (width > MAX_DIM || height > MAX_DIM) {
                  if (width > height) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
                  else { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
                }
                canvas.width = width;
                canvas.height = height;
                ctx?.drawImage(img, 0, 0, width, height);
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('Compression failed')), 'image/jpeg', 0.7);
              };
              img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')); };
              img.src = objectUrl;
            });
            contentType = 'image/jpeg';
            ext = '.jpg';
          }

          const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
          const imagePath = `${user.id}/${Date.now()}-${i}-${randomSuffix}${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('scan-images')
            .upload(imagePath, blob, { contentType, upsert: false });

          if (uploadError) {
            if (uploadedPaths.length > 0) await supabase.storage.from('scan-images').remove(uploadedPaths);
            throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
          }
          uploadedPaths.push(imagePath);
        }

        // Create background scan job
        const response = await fetch('/api/scan-jobs/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            imagePaths: uploadedPaths,
            projectTitle: projectName,
            projectIcon: projectIcon ?? null,
            scanMode: selectedScanMode,
            eikenLevel: selectedScanMode === 'eiken' ? selectedEikenLevel : null,
          }),
        });

        if (!response.ok) {
          await supabase.storage.from('scan-images').remove(uploadedPaths);
          const error = await response.json();
          throw new Error(error.error || 'ジョブの作成に失敗しました');
        }

        setScanUploadStatus('done');
        refreshJobs();
        return;
      } catch (error) {
        console.error('Background upload error:', error);
        setScanUploadStatus(undefined);
        setShowProjectNameModal(false);
        showToast({
          message: error instanceof Error ? error.message : 'アップロードに失敗しました',
          type: 'error',
          duration: 4000,
        });
        return;
      }
    }

    if (isPro && hasPdf) {
      showToast({
        message: 'PDFは画像化して通常解析モードで処理します',
        type: 'warning',
        duration: 3500,
      });
    }
    if (isPro && !hasPdf && !canUseBackground) {
      showToast({
        message: '画像が20枚を超えるため通常解析モードで処理します',
        type: 'warning',
        duration: 3500,
      });
    }

    // Free users: close modal before processing
    setShowProjectNameModal(false);

    // Free users: use traditional flow
    sessionStorage.setItem('scanvocab_project_name', projectName);
    if (projectIcon) {
      sessionStorage.setItem('scanvocab_project_icon', projectIcon);
    } else {
      sessionStorage.removeItem('scanvocab_project_icon');
    }
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

  // Word status counts — must be before early returns to satisfy hooks rules
  const allWordsFlat = useMemo(() => Object.values(getCachedProjectWords()).flat(), [projects, words]);
  const { masteredTotal, learningTotal, unlearnedTotal } = useMemo(() => {
    let mastered = 0, learning = 0, unlearned = 0;
    for (const w of allWordsFlat) {
      if (w.status === 'mastered') mastered++;
      else if (w.status === 'review') learning++;
      else unlearned++;
    }
    return { masteredTotal: mastered, learningTotal: learning, unlearnedTotal: unlearned };
  }, [allWordsFlat]);
  const completionPercent = totalWords > 0 ? Math.round((masteredTotal / totalWords) * 100) : 0;

  const sortedProjects = useMemo(() =>
    [...projects]
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 8),
    [projects]
  );

  // Session expired: was logged in before but session is now invalid
  // Show re-login prompt instead of local data with free plan restrictions
  if (sessionExpired && !authLoading && !user) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center mb-4">
            <Icon name="lock" size={32} className="text-[var(--color-primary)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">セッションが切れました</h1>
          <p className="text-sm text-[var(--color-muted)] mt-2">もう一度ログインしてください</p>
          <Link
            href="/login"
            className="mt-6 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-semibold shadow-lg shadow-primary/20"
          >
            ログイン
          </Link>
        </div>
      </>
    );
  }

  // Loading state — only gate on data loading, not auth
  // Auth resolves in background; cached data displays instantly
  if (loading && projects.length === 0 && words.length === 0 && totalWords === 0) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  // Empty state - no projects (only show after auth is resolved)
  if (projects.length === 0) {
    return (
      <>
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

          <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)] lg:hidden">
            <div className="max-w-lg mx-auto px-4 py-4">
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

          <main className="min-h-[calc(100vh-14rem)] flex flex-col items-center justify-center px-6 py-10">
            <div className="w-20 h-20 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center mb-6">
              <Icon name="menu_book" size={40} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">単語帳がありません</h2>
            <p className="text-[var(--color-muted)] text-center mb-6">
              ノートやプリントを撮影して<br />最初の単語帳を作りましょう
            </p>
            {isAuthenticated && (
              <button
                onClick={() => handleScanButtonClick(false)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold border-b-[3px] border-[var(--color-primary-dark)] active:border-b-0 active:mt-[3px] transition-all mb-8"
              >
                <Icon name="photo_camera" size={20} />
                スキャンをはじめる
              </button>
            )}
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
            onClose={() => {
              setShowProjectNameModal(false);
              setScanUploadStatus(undefined);
              setPendingFile(null);
              setPendingFiles([]);
              sessionStorage.removeItem('scanvocab_project_icon');
            }}
            onConfirm={handleProjectNameConfirm}
            scanStatus={scanUploadStatus}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col pb-28 lg:pb-8">
        {!authLoading && !isPro && isAlmostFull && <WordLimitBanner currentCount={totalWords} />}

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

        {/* Header - iOS style: just MERKEN title */}
        <header className="px-5 pt-6 pb-2 lg:hidden">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black text-[var(--color-foreground)] font-display tracking-tight">MERKEN</h1>
            {isPro && (
              <div className="flex items-center gap-2">
                <SyncStatusIndicator />
              </div>
            )}
          </div>
        </header>

        {/* Desktop header */}
        <header className="sticky top-0 hidden lg:block z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
          <div className="max-w-lg lg:max-w-2xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
            <h1 className="text-3xl font-black text-[var(--color-foreground)] font-display tracking-tight">MERKEN</h1>
            {isPro && (
              <div className="flex items-center gap-2">
                <SyncStatusIndicator />
              </div>
            )}
          </div>
        </header>

        {/* Main content - iOS style */}
        <main className="flex-1 max-w-lg lg:max-w-2xl mx-auto px-4 lg:px-8 pt-4 pb-8 w-full space-y-5">

          {/* Today's goal + Mastery donut — 2-column layout */}
          <section>
            <div className="grid grid-cols-2 gap-3">
              {/* Left: Today's goal (compact) */}
              <Link
                href={reviewDueCount > 0 ? reviewQuizHref : (projects.length > 0 && totalWords > 0 ? `/quiz/${projects[0].id}?from=${encodeURIComponent('/')}` : '/projects')}
                className="card p-4 flex flex-col justify-between active:opacity-80 transition-opacity"
              >
                <div>
                  <p className="text-xs text-[var(--color-muted)] font-medium">今日の目標</p>
                  <p className="text-3xl font-black text-[var(--color-foreground)] mt-1">
                    {reviewDueCount.toLocaleString()}<span className="text-sm font-bold ml-0.5">語</span>
                  </p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">{dailyStats.todayCount} / {reviewDueCount} 完了</p>
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-xs font-semibold text-[var(--color-primary)]">復習を始める</span>
                  <Icon name="arrow_forward" size={14} className="text-[var(--color-primary)]" />
                </div>
              </Link>

              {/* Right: Mastery donut chart */}
              <div className="card p-4 flex flex-col items-center justify-center">
                <div className="relative">
                  <svg width="96" height="96" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-border)" strokeWidth="10" />
                    {(() => {
                      const r = 40;
                      const c = 2 * Math.PI * r;
                      const mFrac = totalWords > 0 ? masteredTotal / totalWords : 0;
                      const lFrac = totalWords > 0 ? learningTotal / totalWords : 0;
                      const mLen = c * mFrac;
                      const lLen = c * lFrac;
                      return (
                        <>
                          {mFrac > 0 && (
                            <circle
                              cx="50" cy="50" r={r} fill="none"
                              stroke="var(--color-success)" strokeWidth="10"
                              strokeDasharray={`${mLen} ${c - mLen}`}
                              strokeDashoffset={0}
                              strokeLinecap="butt"
                              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                            />
                          )}
                          {lFrac > 0 && (
                            <circle
                              cx="50" cy="50" r={r} fill="none"
                              stroke="var(--color-warning, #f59e0b)" strokeWidth="10"
                              strokeDasharray={`${lLen} ${c - lLen}`}
                              strokeDashoffset={-mLen}
                              strokeLinecap="butt"
                              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                            />
                          )}
                        </>
                      );
                    })()}
                  </svg>
                  <span className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-[var(--color-foreground)]">{completionPercent}%</span>
                    <span className="text-[10px] font-medium text-[var(--color-muted)]">習得</span>
                  </span>
                </div>
                <div className="flex items-center gap-2.5 mt-2 flex-wrap justify-center">
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                    {masteredTotal}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning,#f59e0b)]" />
                    {learningTotal}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border)]" />
                    {unlearnedTotal}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Word books section - iOS style */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">単語帳</h2>
              <Link href="/projects" className="text-sm text-[var(--color-muted)] font-medium">管理</Link>
            </div>
            {projects.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-sm text-[var(--color-muted)]">まだ単語帳がありません。スキャンから始めましょう。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedProjects.map((project) => {
                    const projectWords = getCachedProjectWords()[project.id] || [];
                    return (
                      <ProjectCard key={project.id} project={project} words={projectWords} />
                    );
                  })}
              </div>
            )}
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
        onClose={() => {
          setShowProjectNameModal(false);
          setScanUploadStatus(undefined);
          setPendingFile(null);
          setPendingFiles([]);
          sessionStorage.removeItem('scanvocab_project_icon');
        }}
        onConfirm={handleProjectNameConfirm}
        scanStatus={scanUploadStatus}
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
        onClose={() => { setDeleteProjectModalOpen(false); setDeleteProjectTargetId(null); }}
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
          jobs={notifiableJobs}
          onDismiss={(jobId) => {
            acknowledgeJob(jobId);
            // Refresh projects to show the new one
            loadProjects();
          }}
        />
      )}
      </div>
    </>
  );
}
