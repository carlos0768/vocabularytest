'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DesktopProjectDetailView } from '@/components/desktop/DesktopProjectDetail';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/toast';
import { WordLimitModal } from '@/components/limits';
import { ScanCaptureModal } from '@/components/home/ScanCaptureModal';
import { ProjectShareSheet } from '@/components/project/ProjectShareSheet';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { GuidedTour, type TourStep } from '@/components/onboarding/GuidedTour';
import { WordFilterSheet, WordSortSheet } from '@/components/project/WordListSheets';
import { WordDetailView } from '@/components/word/WordDetailView';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { useAuth } from '@/hooks/use-auth';
import { useIsMobileViewport } from '@/hooks/use-is-mobile-viewport';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { useTourSeen } from '@/hooks/use-tour-seen';
import { useTutorialFlow } from '@/hooks/use-tutorial-flow';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository, hybridRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { scheduleWordStatusWrite } from '@/lib/db/debounced-status-write';
import { consumeManualAddIntent } from '@/lib/home/home-session-storage';
import { invalidateHomeCache } from '@/lib/home-cache';
import { markProjectVisited } from '@/lib/project-visit';
import {
  readManualMorphologyPref,
  writeManualMorphologyPref,
} from '@/lib/preferences/manual-morphology-pref';
import { saveProjectSharedTags } from '@/lib/shared-projects/client';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';
import {
  getNextVocabularyType,
  getVocabularyTypeLabel,
  getVocabularyTypeShortLabel,
} from '@/lib/vocabulary-type';
import { getGuestUserId } from '@/lib/utils';
import {
  countProjectWordStats,
  isProjectWordFilterActive,
  selectAvailableProjectPartsOfSpeech,
  selectFilteredProjectWords,
  type ProjectWordActivenessFilter,
  type ProjectWordSortOrder,
} from '@/lib/project/project-page-selectors';
import type { Project, ProjectShareScope, SubscriptionStatus, VocabularyType, Word, WordStatus, WordTranslation } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

// One-time coach mark for a wordbook's word list. Two steps in left-to-right
// reading order: the status squares, then the Active / Passive toggle.
const PROJECT_INTRO_TOUR_STEPS: TourStep[] = [
  {
    target: '.tour-anchor-word-status',
    title: '左のマスは定着度',
    content: (
      <>
        単語ごとの定着度を表します。タップするたびに{' '}
        <strong>未学習 → 学習中 → 定着中 → 習得済み</strong>{' '}
        と段階が上がり、満タン（習得済み）からはタップで下げられます。クイズの正誤でも自動で更新されます。
      </>
    ),
    placement: 'bottom-start',
  },
  {
    target: '.tour-anchor-vocab-type',
    title: 'A / P とは？',
    content: (
      <>
        この丸ボタンで単語を分類できます。
        <br />
        <strong>A（Active）</strong>＝自分でも使いこなしたい発信語彙、
        <strong>P（Passive）</strong>＝意味が分かればよい受信語彙。
        <br />
        タップするたび 未設定 → A → P → 未設定 と切り替わり、あとでフィルタで絞り込めます。
      </>
    ),
    placement: 'left',
  },
];

type StudyGroupsResponse = {
  success?: boolean;
  groups?: StudyGroupSummary[];
  error?: string;
};

type StudyGroupProjectMutationResponse = {
  success?: boolean;
  project?: {
    project?: Project;
  };
  error?: string;
  code?: string;
};

type SharedProjectLookupResponse = {
  success?: boolean;
  project?: Project;
  error?: string;
};

// A word suggested for an empty wordbook, picked from the user's other books.
type RecommendedWordSuggestion = {
  word: Word;
  sourceProjectTitle: string;
};

const RECOMMENDATION_SOURCE_PROJECT_LIMIT = 8;
const RECOMMENDATION_LIMIT = 10;

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

function isOwnedBy(project: Project | undefined | null, expectedUserId: string): project is Project {
  return Boolean(project && project.userId === expectedUserId);
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { count: totalWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();
  const { shouldRender: projectTourReady, markSeen: markProjectTourSeen } = useTourSeen('project-intro');
  const { stage: tutorialStage, setStage: setTutorialStage } = useTutorialFlow();
  const isMobileViewport = useIsMobileViewport();
  // ページ上端ではヘッダの下線を出さない（スクロールで表示）
  const pageScrolled = usePageScrolled();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [wordSortOrder, setWordSortOrder] = useState<ProjectWordSortOrder>('priority');
  const [wordShowSortSheet, setWordShowSortSheet] = useState(false);
  const [wordShowFilterSheet, setWordShowFilterSheet] = useState(false);
  const [wordFilterBookmark, setWordFilterBookmark] = useState(false);
  const [wordFilterActiveness, setWordFilterActiveness] = useState<ProjectWordActivenessFilter>('all');
  const [wordFilterPos, setWordFilterPos] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkFavoriteLoading, setBulkFavoriteLoading] = useState(false);
  const [bulkVocabularyTypeLoading, setBulkVocabularyTypeLoading] = useState<VocabularyType | null>(null);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [bulkImportLoading, setBulkImportLoading] = useState(false);
  const [importTargetProjects, setImportTargetProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [sharePrepareLoading, setSharePrepareLoading] = useState(false);
  const [shareScopeUpdating, setShareScopeUpdating] = useState(false);
  const [shareTagsUpdating, setShareTagsUpdating] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [shareGroups, setShareGroups] = useState<StudyGroupSummary[]>([]);
  const [shareGroupsLoading, setShareGroupsLoading] = useState(false);
  const [shareGroupsError, setShareGroupsError] = useState<string | null>(null);
  const [groupSharingUpdatingId, setGroupSharingUpdatingId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [deleteWordTarget, setDeleteWordTarget] = useState<Word | null>(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);

  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [showScanCaptureModal, setShowScanCaptureModal] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordPartOfSpeech, setManualWordPartOfSpeech] = useState('');
  const [manualWordExampleSentence, setManualWordExampleSentence] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);
  const [manualWordSavingMessage, setManualWordSavingMessage] = useState<string | undefined>(undefined);
  const [manualWordAddedCount, setManualWordAddedCount] = useState(0);
  // 手動追加時の語源解析トグル。オフにすると enrich-manual が語源解析
  // （とそのコイン消費）をスキップする。選択は端末に記憶する。
  const [manualWordMorphologyEnabled, setManualWordMorphologyEnabled] = useState(true);
  useEffect(() => {
    setManualWordMorphologyEnabled(readManualMorphologyPref());
  }, []);
  const handleManualWordMorphologyChange = useCallback((enabled: boolean) => {
    setManualWordMorphologyEnabled(enabled);
    writeManualMorphologyPref(enabled);
  }, []);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  // Spotify-style suggestions for an empty wordbook: words picked from the
  // user's other books, addable in place with the row's + button. Loaded once
  // when the book turns out to be empty; the section stays visible while the
  // user keeps adding from it.
  const [recommendedWords, setRecommendedWords] = useState<RecommendedWordSuggestion[]>([]);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [addingRecommendationIds, setAddingRecommendationIds] = useState<Set<string>>(new Set());

  const wordDetailOpen = selectedWord !== null;
  useEffect(() => {
    if (!wordDetailOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [wordDetailOpen]);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);
  const mutationRepository = useMemo(
    () => (subscriptionStatus === 'active' ? hybridRepository : repository),
    [repository, subscriptionStatus],
  );

  const loadProject = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    try {
      const expectedUserId = user ? user.id : getGuestUserId();

      let loadedProject = await repository.getProject(projectId);
      let wordRepo: typeof repository = repository;

      // Background scan jobs (Pro) save directly to Supabase and may not be
      // in local IndexedDB yet. Fall back to remote when local lookup misses.
      if (!isOwnedBy(loadedProject, expectedUserId) && user && navigator.onLine) {
        try {
          const remote = await remoteRepository.getProject(projectId);
          if (isOwnedBy(remote, user.id)) {
            loadedProject = remote;
            wordRepo = remoteRepository;
          }
        } catch {
          // remote unavailable — handled below
        }
      }

      if (isOwnedBy(loadedProject, expectedUserId)) {
        setProject(loadedProject);
        setLoading(false);
        const loadedWords = await wordRepo.getWords(projectId);
        setWords(loadedWords);
        setWordsLoaded(true);
      } else {
        if (user && navigator.onLine) {
          try {
            const response = await fetch(`/api/shared-projects/${encodeURIComponent(projectId)}`, {
              cache: 'no-store',
            });
            const payload = await response.json().catch(() => null) as SharedProjectLookupResponse | null;
            if (response.ok && payload?.success && payload.project?.shareId) {
              router.replace(`/share/${encodeURIComponent(payload.project.shareId)}`);
              return;
            }
          } catch (sharedLookupError) {
            console.warn('Failed to resolve project route as shared project:', sharedLookupError);
          }
        }
        setError('単語帳が見つかりません');
      }
    } catch (loadError) {
      console.error('Failed to load project:', loadError);
      setError('単語帳の読み込みに失敗しました');
    } finally {
      setLoading(false);
      setWordsLoaded(true);
    }
  }, [authLoading, projectId, repository, router, user]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project?.id) markProjectVisited(project.id);
  }, [project?.id]);

  // 空の単語帳を作成して遷移してきた直後は、手動追加モーダルを自動で開く
  // （CreateWordbookSheet が sessionStorage 経由で projectId を渡してくる）。
  useEffect(() => {
    try {
      if (consumeManualAddIntent(sessionStorage) === projectId) {
        setManualWordAddedCount(0);
        setShowManualWordModal(true);
      }
    } catch {
      // sessionStorage が使えない環境では自動オープンだけ諦める
    }
  }, [projectId]);

  useEffect(() => {
    if (!wordsLoaded || recommendationsLoaded || !project || words.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const userId = user ? user.id : getGuestUserId();
        const projects = await repository.getProjects(userId);
        const sourceProjects = shuffleArray(projects.filter((p) => p.id !== projectId))
          .slice(0, RECOMMENDATION_SOURCE_PROJECT_LIMIT);

        const seenEnglish = new Set<string>();
        const pool: RecommendedWordSuggestion[] = [];
        for (const sourceProject of sourceProjects) {
          let sourceWords: Word[];
          try {
            sourceWords = await repository.getWords(sourceProject.id);
          } catch {
            continue;
          }
          for (const word of sourceWords) {
            const key = word.english.trim().toLowerCase();
            if (!key || seenEnglish.has(key)) continue;
            seenEnglish.add(key);
            pool.push({ word, sourceProjectTitle: sourceProject.title });
          }
        }

        if (!cancelled) setRecommendedWords(shuffleArray(pool).slice(0, RECOMMENDATION_LIMIT));
      } catch (recommendationError) {
        console.warn('Failed to load recommended words:', recommendationError);
      } finally {
        if (!cancelled) setRecommendationsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wordsLoaded, recommendationsLoaded, project, words.length, repository, user, projectId]);

  const counts = useMemo(() => {
    const wordStats = countProjectWordStats(words);
    return {
      total: wordStats.total,
      mastered: wordStats.mastered,
      active: wordStats.active,
      learning: wordStats.learning,
      newCount: wordStats.unlearned,
    };
  }, [words]);

  const wordFilterActive = isProjectWordFilterActive({
    bookmark: wordFilterBookmark,
    activeness: wordFilterActiveness,
    partOfSpeech: wordFilterPos,
  });

  const availablePartsOfSpeech = useMemo(() => selectAvailableProjectPartsOfSpeech(words), [words]);

  const filteredWords = useMemo(() => {
    return selectFilteredProjectWords(words, {
      searchText: query.trim().toLowerCase(),
      sortOrder: wordSortOrder,
      bookmark: wordFilterBookmark,
      activeness: wordFilterActiveness,
      partOfSpeech: wordFilterPos,
    });
  }, [query, words, wordSortOrder, wordFilterBookmark, wordFilterActiveness, wordFilterPos]);

  // モバイル専用: 20語を超える単語帳は10語ずつページ送りする (フロントのみで完結)
  const MOBILE_WORDS_PER_PAGE = 10;
  const paginateWords = filteredWords.length > 20;
  const wordPageCount = paginateWords ? Math.ceil(filteredWords.length / MOBILE_WORDS_PER_PAGE) : 1;
  const [wordPage, setWordPage] = useState(0);
  useEffect(() => {
    // フィルタ/検索でページ数が減ったら範囲内に戻す
    setWordPage((prev) => (prev > wordPageCount - 1 ? 0 : prev));
  }, [wordPageCount]);
  const pagedMobileWords = paginateWords
    ? filteredWords.slice(wordPage * MOBILE_WORDS_PER_PAGE, (wordPage + 1) * MOBILE_WORDS_PER_PAGE)
    : filteredWords;

  const selectedDisplayedWordCount = useMemo(
    () => filteredWords.filter((word) => selectedWordIds.has(word.id)).length,
    [filteredWords, selectedWordIds],
  );
  const allFilteredWordsSelected = filteredWords.length > 0
    && filteredWords.every((word) => selectedWordIds.has(word.id));
  const selectedFilteredWords = useMemo(
    () => filteredWords.filter((word) => selectedWordIds.has(word.id)),
    [filteredWords, selectedWordIds],
  );

  // The guided flashcard→quiz flow takes priority over the status/A-P coach mark.
  const tutorialFlowActive = tutorialStage !== null && tutorialStage !== 'finished';

  // Word-list coach mark: only while the plain list is visible and no competing
  // sheet/modal is open (the anchored rows are replaced in select mode), and not
  // during the guided flow (shown afterward instead).
  const runProjectTour =
    projectTourReady
    && isMobileViewport
    && !tutorialFlowActive
    && wordsLoaded
    && !selectMode
    && filteredWords.length > 0
    && !selectedWord
    && !showManualWordModal
    && !menuOpen;

  // Guided-flow action tours: nudge toward flashcards, then (after returning) the quiz.
  const flowTourEligible =
    isMobileViewport
    && wordsLoaded
    && words.length > 0
    && !selectMode
    && !selectedWord
    && !showManualWordModal
    && !menuOpen;

  const runOpenFlashcardTour = flowTourEligible && tutorialStage === 'open-flashcard';
  const openFlashcardTourSteps = useMemo<TourStep[]>(
    () => [
      {
        target: '[data-tour="project-flashcard"]',
        title: 'まずはフラッシュカード',
        content: 'カードで単語をざっと見てから、クイズで確認します。まずはカードを開きましょう。',
        placement: 'bottom',
        data: {
          primaryAction: {
            label: 'フラッシュカードを開く',
            onClick: () => {
              setTutorialStage('view-cards');
              router.push(`/flashcard/${projectId}`);
            },
          },
        },
      },
    ],
    [projectId, router, setTutorialStage],
  );

  const runOpenQuizTour = flowTourEligible && tutorialStage === 'open-quiz';
  const openQuizTourSteps = useMemo<TourStep[]>(
    () => [
      {
        target: '[data-tour="project-quiz"]',
        title: '今度はクイズ',
        content: 'さっき見た単語を、クイズで覚えているか試してみましょう。',
        placement: 'bottom',
        data: {
          primaryAction: {
            label: 'クイズを始める',
            onClick: () => {
              setTutorialStage('awaiting-quiz');
              router.push(`/quiz/${projectId}`);
            },
          },
        },
      },
    ],
    [projectId, router, setTutorialStage],
  );

  const handleExitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedWordIds(new Set());
  }, []);

  const handleToggleSelectWord = useCallback((word: Word) => {
    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      if (next.has(word.id)) next.delete(word.id);
      else next.add(word.id);
      return next;
    });
  }, []);

  const handleConfirmBulkDelete = async () => {
    if (selectedWordIds.size === 0) return;
    setBulkDeleteLoading(true);
    const idsToDelete = Array.from(selectedWordIds);
    try {
      for (const id of idsToDelete) {
        await mutationRepository.deleteWord(id);
      }
      setWords((prev) => prev.filter((w) => !selectedWordIds.has(w.id)));
      showToast({ message: `${idsToDelete.length}語を削除しました`, type: 'success' });
      invalidateHomeCache();
      refreshWordCount();
      setSelectedWordIds(new Set());
      setSelectMode(false);
    } catch (deleteError) {
      console.error('Failed to bulk delete:', deleteError);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setBulkDeleteLoading(false);
      setBulkDeleteModalOpen(false);
    }
  };

  const handleOpenDeleteWord = useCallback((wordId: string) => {
    const target = selectedWord?.id === wordId ? selectedWord : words.find((w) => w.id === wordId) ?? null;
    if (target) setDeleteWordTarget(target);
  }, [selectedWord, words]);

  const handleConfirmSingleWordDelete = async () => {
    if (!deleteWordTarget || deleteWordLoading) return;
    setDeleteWordLoading(true);
    try {
      await mutationRepository.deleteWord(deleteWordTarget.id);
      setWords((prev) => prev.filter((w) => w.id !== deleteWordTarget.id));
      setSelectedWord((current) => (current?.id === deleteWordTarget.id ? null : current));
      showToast({ message: '単語を削除しました', type: 'success' });
      invalidateHomeCache();
      refreshWordCount();
      setDeleteWordTarget(null);
    } catch (deleteError) {
      console.error('Failed to delete word:', deleteError);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteWordLoading(false);
    }
  };

  const handleBulkToggleFavorite = async () => {
    if (selectedWordIds.size === 0 || bulkFavoriteLoading) return;
    const targets = words.filter((w) => selectedWordIds.has(w.id));
    if (targets.length === 0) return;
    const allFavorite = targets.every((w) => w.isFavorite);
    const nextValue = !allFavorite;
    setBulkFavoriteLoading(true);
    setWords((prev) => prev.map((w) => (selectedWordIds.has(w.id) ? { ...w, isFavorite: nextValue } : w)));
    try {
      for (const w of targets) {
        if (w.isFavorite !== nextValue) {
          await mutationRepository.updateWord(w.id, { isFavorite: nextValue });
        }
      }
      invalidateHomeCache();
      showToast({
        message: nextValue
          ? `${targets.length}語を保存しました`
          : `${targets.length}語の保存を解除しました`,
        type: 'success',
      });
    } catch (favoriteError) {
      console.error('Failed to bulk update favorite:', favoriteError);
      setWords((prev) => prev.map((w) => {
        const original = targets.find((t) => t.id === w.id);
        return original ? { ...w, isFavorite: original.isFavorite } : w;
      }));
      showToast({ message: '保存の更新に失敗しました', type: 'error' });
    } finally {
      setBulkFavoriteLoading(false);
    }
  };

  const handleBulkSetVocabularyType = async (vocabularyType: VocabularyType) => {
    if (selectedWordIds.size === 0 || bulkVocabularyTypeLoading) return;
    const targets = words.filter((w) => selectedWordIds.has(w.id));
    if (targets.length === 0) return;

    setBulkVocabularyTypeLoading(vocabularyType);
    setWords((prev) => prev.map((w) => (selectedWordIds.has(w.id) ? { ...w, vocabularyType } : w)));
    try {
      try {
        sessionStorage.removeItem(`quiz_state_${projectId}`);
      } catch {
        /* ignore */
      }
      for (const w of targets) {
        if (w.vocabularyType !== vocabularyType) {
          await mutationRepository.updateWord(w.id, { vocabularyType });
        }
      }
      invalidateHomeCache();
      showToast({
        message: `${targets.length}語を${vocabularyType === 'active' ? 'Active' : 'Passive'}に変更しました`,
        type: 'success',
      });
    } catch (vocabularyTypeError) {
      console.error('Failed to bulk update vocabulary type:', vocabularyTypeError);
      setWords((prev) => prev.map((w) => {
        const original = targets.find((t) => t.id === w.id);
        return original ? { ...w, vocabularyType: original.vocabularyType } : w;
      }));
      showToast({ message: '語彙モードの更新に失敗しました', type: 'error' });
    } finally {
      setBulkVocabularyTypeLoading(null);
    }
  };

  const handleOpenBulkImport = async () => {
    if (selectedWordIds.size === 0) return;
    const userId = user ? user.id : getGuestUserId();
    try {
      const projects = await repository.getProjects(userId);
      setImportTargetProjects(projects.filter((p) => p.id !== projectId));
    } catch {
      showToast({ message: 'プロジェクト一覧の取得に失敗しました', type: 'error' });
      return;
    }
    setBulkImportModalOpen(true);
  };

  const handleConfirmBulkImport = async (targetProjectId: string) => {
    if (selectedWordIds.size === 0 || bulkImportLoading) return;
    setBulkImportLoading(true);
    const targets = words.filter((w) => selectedWordIds.has(w.id));
    try {
      const wordsToCreate = targets.map((w) => ({
        projectId: targetProjectId,
        english: w.english,
        japanese: w.japanese,
        translations: w.translations,
        vocabularyType: w.vocabularyType,
        japaneseSource: w.japaneseSource,
        lexiconEntryId: w.lexiconEntryId,
        lexiconSenseId: w.lexiconSenseId,
        cefrLevel: w.cefrLevel,
        distractors: w.distractors,
        exampleSentence: w.exampleSentence,
        exampleSentenceJa: w.exampleSentenceJa,
        pronunciation: w.pronunciation,
        partOfSpeechTags: w.partOfSpeechTags,
        relatedWords: w.relatedWords,
        usagePatterns: w.usagePatterns,
        customSections: w.customSections,
      }));
      await mutationRepository.createWords(wordsToCreate);
      invalidateHomeCache();
      refreshWordCount();
      const targetProject = importTargetProjects.find((p) => p.id === targetProjectId);
      showToast({
        message: `${targets.length}語を「${targetProject?.title ?? '単語帳'}」にコピーしました`,
        type: 'success',
      });
      setBulkImportModalOpen(false);
      setSelectedWordIds(new Set());
      setSelectMode(false);
    } catch (importError) {
      console.error('Failed to bulk import words:', importError);
      showToast({ message: 'インポートに失敗しました', type: 'error' });
    } finally {
      setBulkImportLoading(false);
    }
  };

  const handleAddRecommendedWord = async (suggestion: RecommendedWordSuggestion) => {
    const sourceWord = suggestion.word;
    if (addingRecommendationIds.has(sourceWord.id)) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    setAddingRecommendationIds((prev) => new Set(prev).add(sourceWord.id));
    try {
      const created = await mutationRepository.createWords([
        {
          projectId,
          english: sourceWord.english,
          japanese: sourceWord.japanese,
          translations: sourceWord.translations,
          vocabularyType: sourceWord.vocabularyType,
          japaneseSource: sourceWord.japaneseSource,
          lexiconEntryId: sourceWord.lexiconEntryId,
          lexiconSenseId: sourceWord.lexiconSenseId,
          cefrLevel: sourceWord.cefrLevel,
          distractors: sourceWord.distractors,
          exampleSentence: sourceWord.exampleSentence,
          exampleSentenceJa: sourceWord.exampleSentenceJa,
          pronunciation: sourceWord.pronunciation,
          partOfSpeechTags: sourceWord.partOfSpeechTags,
          relatedWords: sourceWord.relatedWords,
          usagePatterns: sourceWord.usagePatterns,
          customSections: sourceWord.customSections,
          morphology: sourceWord.morphology,
        },
      ]);
      if (created && created.length > 0) {
        setWords((prev) => [created[0]!, ...prev]);
      }
      setRecommendedWords((prev) => prev.filter((item) => item.word.id !== sourceWord.id));
      invalidateHomeCache();
      refreshWordCount();
      showToast({ message: `「${sourceWord.english}」を追加しました`, type: 'success' });
    } catch (addError) {
      console.error('Failed to add recommended word:', addError);
      showToast({ message: '単語の追加に失敗しました', type: 'error' });
    } finally {
      setAddingRecommendationIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceWord.id);
        return next;
      });
    }
  };

  const handleCycleStatus = (wordId: string, newStatus: WordStatus) => {
    const word = words.find((w) => w.id === wordId);
    if (!word) return;
    const currentStatus = word.status;
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, status: newStatus } : w)));
    scheduleWordStatusWrite({
      wordId,
      currentStatus,
      newStatus,
      writer: async (finalStatus, originalStatus) => {
        try {
          await mutationRepository.updateWord(wordId, { status: finalStatus });
        } catch {
          setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, status: originalStatus } : w)));
          showToast({ message: 'ステータスの更新に失敗しました', type: 'error' });
        }
      },
    });
  };

  const handleToggleFavorite = async (word: Word) => {
    const isFavorite = !word.isFavorite;
    setWords((prev) => prev.map((item) => (item.id === word.id ? { ...item, isFavorite } : item)));
    try {
      await mutationRepository.updateWord(word.id, { isFavorite });
      invalidateHomeCache();
    } catch (updateError) {
      console.error('Failed to toggle favorite:', updateError);
      setWords((prev) => prev.map((item) => (item.id === word.id ? word : item)));
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleOpenShareSheet = () => {
    if (!project) return;
    if (!user || !isPro) {
      showToast({ message: '共有はProプランで利用できます', type: 'error' });
      return;
    }
    setMenuOpen(false);
    setShareLinkCopied(false);
    setShowShareSheet(true);
    setSharePrepareLoading(!project.shareId);
  };

  useEffect(() => {
    const projectIdForShare = project?.id;
    const projectShareId = project?.shareId;
    if (!showShareSheet || !projectIdForShare || !isPro || !user) return;
    if (projectShareId) {
      setSharePrepareLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sid = await remoteRepository.generateShareId(projectIdForShare);
        if (cancelled) return;
        setProject((p) => (p ? { ...p, shareId: sid, shareScope: 'private' } : p));
        invalidateHomeCache();
      } catch (shareError) {
        console.error('Failed to prepare share:', shareError);
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
  }, [showShareSheet, project?.id, project?.shareId, isPro, user, showToast]);

  useEffect(() => {
    const projectIdForGroups = project?.id;
    if (!showShareSheet || !projectIdForGroups || !isPro || !user) return;

    let cancelled = false;
    setShareGroupsLoading(true);
    setShareGroupsError(null);

    (async () => {
      try {
        const response = await fetch(`/api/shared-projects/groups?projectId=${encodeURIComponent(projectIdForGroups)}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as StudyGroupsResponse | null;
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'study_groups_fetch_failed');
        }
        if (cancelled) return;
        setShareGroups(payload.groups ?? []);
      } catch (groupsError) {
        console.error('Failed to load share groups:', groupsError);
        if (!cancelled) setShareGroupsError('グループ一覧を読み込めませんでした');
      } finally {
        if (!cancelled) setShareGroupsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showShareSheet, project?.id, isPro, user]);

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
        message: scope === 'public' ? '共有ページに公開しました' : 'リンク限定にしました',
        type: 'success',
      });
    } catch (scopeError) {
      console.error('Failed to update share scope:', scopeError);
      showToast({ message: '公開設定の更新に失敗しました', type: 'error' });
    } finally {
      setShareScopeUpdating(false);
    }
  };

  const handleSaveSharedTags = async (sharedTags: string[]) => {
    if (!project || shareTagsUpdating) return;

    setShareTagsUpdating(true);
    try {
      const savedSharedTags = await saveProjectSharedTags(project.id, sharedTags);
      setProject((p) => (p ? { ...p, sharedTags: savedSharedTags } : p));
      invalidateHomeCache();
      showToast({ message: '共有タグを保存しました', type: 'success' });
    } catch (tagsError) {
      console.error('Failed to update shared tags:', tagsError);
      showToast({ message: 'タグの保存に失敗しました', type: 'error' });
    } finally {
      setShareTagsUpdating(false);
    }
  };

  const handleCopyShareLink = async (shareUrl: string) => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setShareLinkCopied(true);
      showToast({ message: '共有リンクをコピーしました', type: 'success' });
      setTimeout(() => setShareLinkCopied(false), 2000);
    } else {
      showToast({ message: 'コピーできませんでした', type: 'error' });
    }
  };

  const handleShareLink = async (shareUrl: string) => {
    if (!project) return;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: project.title,
          text: `${project.title} の共有単語帳`,
          url: shareUrl,
        });
        return;
      } catch (shareError) {
        const errorName = shareError && typeof shareError === 'object' && 'name' in shareError
          ? String((shareError as { name?: unknown }).name)
          : '';
        if (errorName === 'AbortError') return;
      }
    }

    await handleCopyShareLink(shareUrl);
  };

  const handleToggleGroupShare = async (group: StudyGroupSummary) => {
    if (!project || groupSharingUpdatingId) return;

    const nextShared = !group.projectShared;
    setGroupSharingUpdatingId(group.id);
    setShareGroupsError(null);

    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(group.id)}/projects/${encodeURIComponent(project.id)}`,
        { method: nextShared ? 'POST' : 'DELETE' },
      );
      const payload = await response.json().catch(() => null) as StudyGroupProjectMutationResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'study_group_project_toggle_failed');
      }

      const sharedProject = payload.project?.project;
      if (sharedProject?.shareId && sharedProject.shareId !== project.shareId) {
        setProject((current) => current ? {
          ...current,
          shareId: sharedProject.shareId,
          shareScope: sharedProject.shareScope ?? current.shareScope ?? 'private',
        } : current);
      }

      setShareGroups((current) => current.map((item) => {
        if (item.id !== group.id) return item;
        const projectCountDelta = nextShared ? 1 : -1;
        return {
          ...item,
          projectShared: nextShared,
          projectCount: Math.max(0, item.projectCount + projectCountDelta),
        };
      }));
      invalidateHomeCache();
      showToast({
        message: nextShared ? 'グループに掲載しました' : 'グループ掲載を解除しました',
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to toggle group share:', error);
      const message = error instanceof Error ? error.message : 'グループ共有の更新に失敗しました';
      setShareGroupsError(message);
      showToast({ message, type: 'error' });
    } finally {
      setGroupSharingUpdatingId(null);
    }
  };

  const handleOpenRename = () => {
    if (!project) return;
    setRenameValue(project.title);
    setMenuOpen(false);
    setRenameModalOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!project || !renameValue.trim() || renameLoading) return;
    setRenameLoading(true);
    try {
      await mutationRepository.updateProject(project.id, { title: renameValue.trim() });
      setProject((p) => (p ? { ...p, title: renameValue.trim() } : p));
      invalidateHomeCache();
      showToast({ message: '名称を変更しました', type: 'success' });
      setRenameModalOpen(false);
    } catch {
      showToast({ message: '名称変更に失敗しました', type: 'error' });
    } finally {
      setRenameLoading(false);
    }
  };

  // バインダー (フォルダ) 名を設定する。空欄で解除
  const handleSetBinder = async () => {
    if (!project) return;
    setMenuOpen(false);
    const input = window.prompt('バインダー名を入力してください (空欄で解除)', project.binder ?? '');
    if (input === null) return;
    const binder = input.trim().slice(0, 40) || null;
    try {
      await mutationRepository.updateProject(project.id, { binder });
      setProject((p) => (p ? { ...p, binder } : p));
      invalidateHomeCache();
      showToast({ message: binder ? `バインダー「${binder}」に入れました` : 'バインダーから外しました', type: 'success' });
    } catch {
      showToast({ message: 'バインダーの設定に失敗しました', type: 'error' });
    }
  };

  const handleOpenImagePicker = () => {
    if (!project) return;
    setMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const side = Math.min(img.width, img.height, 400);
              canvas.width = side; canvas.height = side;
              const ctx = canvas.getContext('2d')!;
              const sx = (img.width - side) / 2;
              const sy = (img.height - side) / 2;
              ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
              resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = reject;
            img.src = reader.result as string;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await mutationRepository.updateProject(project.id, { iconImage: dataUrl });
        setProject((p) => (p ? { ...p, iconImage: dataUrl } : p));
        invalidateHomeCache();
        showToast({ message: '画像を設定しました', type: 'success' });
      } catch {
        showToast({ message: '画像の設定に失敗しました', type: 'error' });
      }
    };
    input.click();
  };

  const handleConfirmDelete = async () => {
    if (!project) return;
    setDeleteLoading(true);
    try {
      await mutationRepository.deleteProject(project.id);
      invalidateHomeCache();
      showToast({ message: '単語帳を削除しました', type: 'success' });
      router.push('/');
    } catch (deleteError) {
      console.error('Failed to delete project:', deleteError);
      showToast({ message: '削除に失敗しました', type: 'error' });
      setDeleteLoading(false);
      setDeleteModalOpen(false);
    }
  };

  const handleCycleVocabularyType = async (word: Word) => {
    const vocabularyType = getNextVocabularyType(word.vocabularyType);
    setWords((prev) => prev.map((item) => (item.id === word.id ? { ...item, vocabularyType } : item)));
    try {
      try {
        sessionStorage.removeItem(`quiz_state_${projectId}`);
      } catch {
        /* ignore */
      }
      await mutationRepository.updateWord(word.id, { vocabularyType });
      invalidateHomeCache();
    } catch (updateError) {
      console.error('Failed to update vocabulary type:', updateError);
      setWords((prev) => prev.map((item) => (item.id === word.id ? word : item)));
    }
  };

  const resetManualWordForm = () => {
    setManualWordEnglish('');
    setManualWordJapanese('');
    setManualWordPartOfSpeech('');
    setManualWordExampleSentence('');
  };

  const openManualWordModal = () => {
    setManualWordAddedCount(0);
    setShowManualWordModal(true);
  };

  const closeManualWordModal = () => {
    setShowManualWordModal(false);
    resetManualWordForm();
    if (manualWordAddedCount > 0) {
      showToast({ message: `${manualWordAddedCount}語を追加しました`, type: 'success' });
    }
  };

  const handleSaveManualWord = async () => {
    const english = manualWordEnglish.trim();
    // 日本語訳は任意入力。未入力なら enrich API（マスター/AI）が補完する。
    const japaneseInput = manualWordJapanese.trim();
    if (!english || !project) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    const userPos = manualWordPartOfSpeech.trim();
    const userExample = manualWordExampleSentence.trim();

    setManualWordSaving(true);
    setManualWordSavingMessage('情報を生成中...');

    let japanese = japaneseInput;
    let enrichedTranslationTexts: string[] = [];
    let enrichedPronunciation = '';
    let enrichedPartOfSpeechTags: string[] = userPos ? [userPos] : [];
    let enrichedExampleSentence = userExample;
    let enrichedExampleSentenceJa = '';
    let enrichedMorphology: Word['morphology'];

    try {
      const enrichResponse = await fetch('/api/words/enrich-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          english,
          includeMorphology: manualWordMorphologyEnabled,
          ...(japaneseInput ? { japanese: japaneseInput } : {}),
          ...(userPos ? { partOfSpeechTags: [userPos] } : {}),
          ...(userExample ? { exampleSentence: userExample } : {}),
        }),
      });

      if (enrichResponse.ok) {
        const data = (await enrichResponse.json()) as {
          success?: boolean;
          enriched?: {
            japanese?: string;
            translations?: string[];
            pronunciation?: string;
            partOfSpeechTags?: string[];
            exampleSentence?: string;
            exampleSentenceJa?: string;
          };
          morphology?: Word['morphology'];
        };
        if (data.success && data.enriched) {
          if (!japanese) {
            // 全訳補完: 訳ごとに word_translations レコードを作るため配列で受ける
            enrichedTranslationTexts = (data.enriched.translations ?? [])
              .map((text) => text.trim())
              .filter(Boolean);
            japanese = enrichedTranslationTexts[0] ?? data.enriched.japanese?.trim() ?? '';
          }
          enrichedPronunciation = data.enriched.pronunciation ?? '';
          if (data.enriched.partOfSpeechTags && data.enriched.partOfSpeechTags.length > 0) {
            enrichedPartOfSpeechTags = data.enriched.partOfSpeechTags;
          }
          if (!enrichedExampleSentence && data.enriched.exampleSentence) {
            enrichedExampleSentence = data.enriched.exampleSentence;
          }
          enrichedExampleSentenceJa = data.enriched.exampleSentenceJa ?? '';
          enrichedMorphology = data.morphology;
        }
      }
    } catch (enrichError) {
      console.warn('[manual-word] enrich error:', enrichError);
    }

    // 日本語訳が入力されず自動補完もできなかった場合だけ入力をお願いする
    // （意味が空の単語はクイズ・カードで使いものにならないため保存しない）。
    if (!japanese) {
      setManualWordSaving(false);
      setManualWordSavingMessage(undefined);
      showToast({ message: '日本語訳を自動生成できませんでした。日本語訳を入力してください', type: 'error' });
      return;
    }

    // 補完された全訳を訳ごとの WordTranslation レコードに展開する
    const enrichedTranslations: WordTranslation[] | undefined = enrichedTranslationTexts.length > 0
      ? enrichedTranslationTexts.map((text, index) => ({
          translationJa: text,
          normalizedTranslationJa: text,
          source: 'ai' as const,
          meaningRank: index + 1,
          position: index,
          isPrimary: index === 0,
        }))
      : undefined;

    const optimisticWord: Word = {
      id: crypto.randomUUID(),
      projectId,
      english,
      japanese,
      ...(enrichedTranslations ? { translations: enrichedTranslations, japaneseSource: 'ai' as const } : {}),
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      pronunciation: enrichedPronunciation || undefined,
      partOfSpeechTags: enrichedPartOfSpeechTags.length > 0 ? enrichedPartOfSpeechTags : undefined,
      exampleSentence: enrichedExampleSentence || undefined,
      exampleSentenceJa: enrichedExampleSentenceJa || undefined,
      morphology: enrichedMorphology,
      status: 'new',
      createdAt: new Date().toISOString(),
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
      isFavorite: false,
    };

    setWords((prev) => [optimisticWord, ...prev]);
    // Keep the modal open so several words can be entered in a row
    // (scan-like batch entry); the modal shows a running count and the
    // summary toast fires when the user closes it.
    resetManualWordForm();
    setManualWordAddedCount((count) => count + 1);
    setManualWordSaving(false);
    setManualWordSavingMessage(undefined);
    refreshWordCount();

    mutationRepository
      .createWords([
        {
          projectId,
          english,
          japanese,
          ...(enrichedTranslations ? { translations: enrichedTranslations, japaneseSource: 'ai' as const } : {}),
          distractors: ['選択肢1', '選択肢2', '選択肢3'],
          ...(enrichedPronunciation ? { pronunciation: enrichedPronunciation } : {}),
          ...(enrichedPartOfSpeechTags.length > 0 ? { partOfSpeechTags: enrichedPartOfSpeechTags } : {}),
          ...(enrichedExampleSentence ? { exampleSentence: enrichedExampleSentence } : {}),
          ...(enrichedExampleSentenceJa ? { exampleSentenceJa: enrichedExampleSentenceJa } : {}),
          ...(enrichedMorphology ? { morphology: enrichedMorphology } : {}),
        },
      ])
      .then((created) => {
        if (created && created.length > 0) {
          setWords((prev) => prev.map((w) => (w.id === optimisticWord.id ? created[0]! : w)));
        }
        invalidateHomeCache();
      })
      .catch((createError) => {
        console.error('Failed to save word:', createError);
        setWords((prev) => prev.filter((w) => w.id !== optimisticWord.id));
        showToast({ message: '単語の保存に失敗しました', type: 'error' });
        refreshWordCount();
      });
  };

  if (loading && !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] text-[var(--color-muted)]">
        <Icon name="progress_activity" size={22} className="animate-spin" />
        <span className="ml-2 text-sm">読み込み中...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center">
        <h1 className="font-display text-2xl font-extrabold text-[var(--solid-ink)]">単語帳が見つかりません</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{error || '一覧から選び直してください。'}</p>
        <Link href="/projects" className="solid-link-primary mt-5">
          <Icon name="arrow_back" size={16} />
          単語帳一覧へ
        </Link>
      </div>
    );
  }

  const bg = thumbColor(project.id);

  return (
    <>
      <DesktopProjectDetailView
        project={project}
        projectId={projectId}
        words={words}
        filteredWords={filteredWords}
        wordsLoaded={wordsLoaded}
        counts={counts}
        query={query}
        onQueryChange={setQuery}
        filterActive={wordFilterActive}
        sortActive={wordSortOrder !== 'priority'}
        selectMode={selectMode}
        selectedWordIds={selectedWordIds}
        onOpenFilterSheet={() => setWordShowFilterSheet(true)}
        onOpenSortSheet={() => setWordShowSortSheet(true)}
        onToggleSelectMode={() => {
          if (selectMode) handleExitSelectMode();
          else { setSelectMode(true); setSelectedWordIds(new Set()); }
        }}
        onToggleSelectWord={handleToggleSelectWord}
        onRename={handleOpenRename}
        onSetBinder={() => void handleSetBinder()}
        onDeleteProject={() => setDeleteModalOpen(true)}
        onToggleFavorite={(word) => void handleToggleFavorite(word)}
        onCycleVocabularyType={(word) => void handleCycleVocabularyType(word)}
        onDeleteWord={handleOpenDeleteWord}
        onScan={() => setShowScanCaptureModal(true)}
        onManualAdd={openManualWordModal}
      />
      <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
      {/* スクロールしても上部に固定されるヘッダー（グループページと同じパターン）。
          top はノッチ下端に合わせ、ノッチ帯は全体共通の StatusBarCover が覆う。
          下線はコンテンツがヘッダの下に潜り込んだとき（スクロール中）だけ出す。 */}
      <header
        className={`sticky z-40 flex items-center gap-2.5 border-b-2 bg-[var(--color-background)]/95 px-[14px] py-2.5 backdrop-blur-md lg:hidden ${pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'}`}
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <HeaderBtn
          onClick={() => {
            // 直前の画面（バインダー・単語帳一覧など）に戻す。履歴が無い場合のみホーム。
            if (typeof window !== 'undefined' && window.history.length > 1) router.back();
            else router.replace('/');
          }}
          aria-label="戻る"
        >
          <Icon name="arrow_back" size={16} />
        </HeaderBtn>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            BOOK
          </div>
          <div className="truncate font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
            {project.title}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <HeaderBtn aria-label="共有" onClick={handleOpenShareSheet}>
            <Icon name="ios_share" size={16} />
          </HeaderBtn>
          <HeaderBtn aria-label="メニュー" onClick={() => setMenuOpen((open) => !open)}>
            <Icon name="more_horiz" size={16} />
          </HeaderBtn>
        </div>
      </header>

      {/* ヘッダの「…」メニュー。ヘッダは backdrop-blur を持ち fixed 配置の基準に
          なってしまうため、全画面の閉じオーバーレイとポップオーバーはヘッダの
          外に置き、常にヘッダ直下（右端）へ固定表示する。 */}
      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 cursor-default bg-transparent"
            aria-label="メニューを閉じる"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed z-[60] w-[170px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-white lg:hidden"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 62px)', right: 14 }}
          >
            <MenuButton icon="edit" label="名称変更" onClick={handleOpenRename} />
            <MenuButton icon="folder" label="バインダー設定" onClick={() => void handleSetBinder()} />
            <MenuButton icon="image" label="画像設定" onClick={handleOpenImagePicker} />
            <MenuButton
              icon="delete"
              label="削除"
              destructive
              onClick={() => { setMenuOpen(false); setDeleteModalOpen(true); }}
            />
          </div>
        </>
      )}

      <div className="flex items-start gap-3.5 px-5 pb-2.5 pt-[18px] lg:pt-8">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[13px] border-2 bg-center bg-cover font-display text-[28px] font-extrabold text-white"
          style={{
            backgroundColor: bg,
            backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            borderColor: 'var(--solid-ink)',
          }}
        >
          {!project.iconImage && project.title.charAt(0)}
        </div>
        <div className="flex-1 pt-0.5">
          <div className="font-mono text-[10px] font-semibold tracking-[0.04em] text-[var(--color-muted)]">
            BOOK · {counts.total} words
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.01em] text-[var(--solid-ink)]">
            {project.title}
          </h1>
          {project.description && (
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{project.description}</p>
          )}
        </div>
      </div>

      {/* The mastery bar and its four status counts are meaningless for an
          empty book — hide them until the first word is added. */}
      {(!wordsLoaded || counts.total > 0) && (
      <div className="px-5 pb-3.5">
        <StackedBar total={counts.total} m={counts.mastered} a={counts.active} l={counts.learning} n={counts.newCount} />
      </div>
      )}

      {/* Quiz / card / add row and the search row assume the book has words;
          the 0-word empty state below provides its own add actions instead. */}
      {(!wordsLoaded || counts.total > 0) && (
      <div className="flex items-center gap-2 px-[18px] pb-4">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--color-accent)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/quiz/${projectId}`}
            data-tour="project-quiz"
            onClick={() => { if (tutorialStage === 'open-quiz') setTutorialStage('awaiting-quiz'); }}
            className="relative flex h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)] text-[13px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="check" size={14} />
            クイズを始める
          </Link>
        </div>
        <div className="relative h-[44px] w-[44px] flex-none">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/flashcard/${projectId}`}
            aria-label="カード"
            data-tour="project-flashcard"
            onClick={() => { if (tutorialStage === 'open-flashcard') setTutorialStage('view-cards'); }}
            className="relative flex h-full w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="style" size={18} />
          </Link>
        </div>
        <div className="relative h-[44px] w-[44px] flex-none">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
          <button
            type="button"
            onClick={() => setAddMenuOpen((open) => !open)}
            aria-label="単語を追加"
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            className="relative flex h-full w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="add" size={20} />
          </button>
          {addMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default bg-transparent"
                aria-label="メニューを閉じる"
                onClick={() => setAddMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-[52px] z-30 w-[180px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-white"
              >
                <MenuButton
                  icon="photo_camera"
                  label="スキャンで追加"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowScanCaptureModal(true);
                  }}
                />
                <MenuButton
                  icon="edit"
                  label="手で入力"
                  onClick={() => {
                    setAddMenuOpen(false);
                    openManualWordModal();
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {(!wordsLoaded || counts.total > 0) && (
      <div className="flex items-center gap-2 px-5 pb-2">
        <label
          htmlFor="project-word-search"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-3 py-[7px] text-[var(--color-muted)]"
        >
          <Icon name="search" size={14} />
          <span className="sr-only">単語を検索</span>
          <input
            id="project-word-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="単語を検索"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
          />
        </label>
        {(wordFilterActive || query) && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
            {filteredWords.length}/{counts.total}
          </span>
        )}
        <button
          type="button"
          onClick={() => setWordShowFilterSheet(true)}
          aria-label="フィルタ"
          className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px ${
            wordFilterActive
              ? 'bg-[var(--solid-ink)] text-white'
              : 'bg-white text-[var(--solid-ink)]'
          }`}
        >
          <Icon name="filter_list" size={15} />
        </button>
        <button
          type="button"
          onClick={() => setWordShowSortSheet(true)}
          aria-label="並べ替え"
          className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px ${
            wordSortOrder !== 'priority'
              ? 'bg-[var(--solid-ink)] text-white'
              : 'bg-white text-[var(--solid-ink)]'
          }`}
        >
          <Icon name="swap_vert" size={15} />
        </button>
        <button
          type="button"
          onClick={() => { if (selectMode) { handleExitSelectMode(); } else { setSelectMode(true); setSelectedWordIds(new Set()); } }}
          aria-label="選択"
          className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px ${
            selectMode
              ? 'bg-[var(--solid-ink)] text-white'
              : 'bg-white text-[var(--solid-ink)]'
          }`}
        >
          <Icon name="check_box" size={15} />
        </button>
      </div>
      )}

      <div className={`flex flex-col px-4 ${selectMode ? 'pb-[160px]' : paginateWords ? 'pb-[104px]' : 'pb-[max(24px,env(safe-area-inset-bottom))]'}`}>
        {!wordsLoaded ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">単語を読み込み中...</span>
          </div>
        ) : filteredWords.length === 0 ? (
          counts.total === 0 ? (
            <EmptyWordbookState
              isPro={isPro}
              onScan={() => setShowScanCaptureModal(true)}
              onManualAdd={openManualWordModal}
            />
          ) : (
            <div className="rounded-xl border-2 border-[var(--color-border)] bg-white px-4 py-10 text-center text-sm text-[var(--color-muted)]">
              {query ? '一致する単語がありません' : '条件に一致する単語がありません'}
            </div>
          )
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {pagedMobileWords.map((word, index) => {
              const selected = selectedWordIds.has(word.id);
              return (
              <WordRow
                key={word.id}
                word={word}
                selectMode={selectMode}
                selected={selected}
                tourAnchor={index === 0 && wordPage === 0}
                onToggleSelect={() => handleToggleSelectWord(word)}
                onCycleStatus={(newStatus) => handleCycleStatus(word.id, newStatus)}
                onCycleVocabularyType={() => void handleCycleVocabularyType(word)}
                onToggleFavorite={() => void handleToggleFavorite(word)}
                onSelect={() => setSelectedWord(word)}
              />
              );
            })}
          </div>
        )}

        {/* Only populated when the book loaded empty; stays visible while the
            user keeps adding suggestions so multiple + taps flow naturally. */}
        {wordsLoaded && !selectMode && recommendedWords.length > 0 && (
          <RecommendedWordsSection
            suggestions={recommendedWords}
            addingIds={addingRecommendationIds}
            onAdd={(suggestion) => void handleAddRecommendedWord(suggestion)}
          />
        )}
      </div>

      {/* モバイル: 20語を超える単語帳は10語ずつページ送り。下部固定バーの左右矢印で移動 */}
      {paginateWords && !selectMode && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[var(--solid-ink)] bg-[var(--color-background)]/95 backdrop-blur-md lg:hidden"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-2.5 px-[18px] pt-3">
            <button
              type="button"
              onClick={() => setWordPage((p) => Math.max(0, p - 1))}
              disabled={wordPage === 0}
              aria-label="前の10語"
              className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
            >
              <Icon name="chevron_left" size={20} />
            </button>
            <span className="font-mono text-[12px] font-bold tabular-nums text-[var(--solid-ink)]">
              {wordPage * MOBILE_WORDS_PER_PAGE + 1}–{Math.min(filteredWords.length, (wordPage + 1) * MOBILE_WORDS_PER_PAGE)} / {filteredWords.length}語
            </span>
            <button
              type="button"
              onClick={() => setWordPage((p) => Math.min(wordPageCount - 1, p + 1))}
              disabled={wordPage >= wordPageCount - 1}
              aria-label="次の10語"
              className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
        </div>
      )}

      <ProjectShareSheet
        open={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        projectTitle={project.title}
        shareId={project.shareId}
        shareScope={project.shareScope === 'public' ? 'public' : 'private'}
        preparing={sharePrepareLoading}
        updatingScope={shareScopeUpdating}
        sharedTags={project.sharedTags ?? []}
        updatingTags={shareTagsUpdating}
        onSelectScope={handleSelectShareScope}
        onSaveSharedTags={handleSaveSharedTags}
        onCopyShareLink={(shareUrl) => void handleCopyShareLink(shareUrl)}
        onShareLink={(shareUrl) => void handleShareLink(shareUrl)}
        shareLinkCopied={shareLinkCopied}
        groups={shareGroups}
        groupsLoading={shareGroupsLoading}
        groupsError={shareGroupsError}
        groupSharingUpdatingId={groupSharingUpdatingId}
        onToggleGroupShare={(group) => void handleToggleGroupShare(group)}
      />

      {selectedWord && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelectedWord(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={() => setSelectedWord(null)}>
            <div
              className="w-full overflow-y-auto overscroll-contain"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 480,
                maxHeight: '80dvh',
                background: '#faf7f1',
                border: '2px solid var(--solid-ink)',
                borderRadius: 20,
              }}
            >
              <WordDetailView
                wordId={selectedWord.id}
                variant="modal"
                initialWord={selectedWord}
                onClose={() => setSelectedWord(null)}
                onWordUpdated={(updated) => {
                  setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
                  setSelectedWord(updated);
                }}
                onDelete={handleOpenDeleteWord}
              />
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Shared overlays: rendered outside the lg:hidden wrapper so the
          desktop view's filter / sort / select / add buttons can use them too */}
      <DeleteProjectModal
        open={deleteModalOpen}
        loading={deleteLoading}
        title={project.title}
        onCancel={() => { if (!deleteLoading) setDeleteModalOpen(false); }}
        onConfirm={() => void handleConfirmDelete()}
      />

      <ManualWordModal
        open={showManualWordModal}
        loading={manualWordSaving}
        loadingMessage={manualWordSavingMessage}
        addedCount={manualWordAddedCount}
        english={manualWordEnglish}
        japanese={manualWordJapanese}
        partOfSpeech={manualWordPartOfSpeech}
        exampleSentence={manualWordExampleSentence}
        morphologyEnabled={manualWordMorphologyEnabled}
        onEnglishChange={setManualWordEnglish}
        onJapaneseChange={setManualWordJapanese}
        onPartOfSpeechChange={setManualWordPartOfSpeech}
        onExampleSentenceChange={setManualWordExampleSentence}
        onMorphologyEnabledChange={handleManualWordMorphologyChange}
        onCancel={closeManualWordModal}
        onConfirm={handleSaveManualWord}
      />

      <WordLimitModal
        isOpen={showWordLimitModal}
        onClose={() => setShowWordLimitModal(false)}
        currentCount={totalWordCount}
      />

      <ScanCaptureModal
        isOpen={showScanCaptureModal}
        onClose={() => setShowScanCaptureModal(false)}
        targetProjectId={projectId}
        targetProjectTitle={project.title}
      />

      <SingleWordDeleteModal
        open={deleteWordTarget !== null}
        loading={deleteWordLoading}
        word={deleteWordTarget}
        onCancel={() => { if (!deleteWordLoading) setDeleteWordTarget(null); }}
        onConfirm={() => void handleConfirmSingleWordDelete()}
      />
      <WordFilterSheet
        open={wordShowFilterSheet}
        onClose={() => setWordShowFilterSheet(false)}
        bookmark={wordFilterBookmark}
        onBookmarkChange={setWordFilterBookmark}
        activeness={wordFilterActiveness}
        onActivenessChange={setWordFilterActiveness}
        pos={wordFilterPos}
        onPosChange={setWordFilterPos}
        availablePartsOfSpeech={availablePartsOfSpeech}
        hasActiveFilters={wordFilterActive}
        onReset={() => { setWordFilterBookmark(false); setWordFilterActiveness('all'); setWordFilterPos(null); }}
      />
      <WordSortSheet
        open={wordShowSortSheet}
        onClose={() => setWordShowSortSheet(false)}
        sortOrder={wordSortOrder}
        onSortOrderChange={setWordSortOrder}
      />

      <GuidedTour run={runProjectTour} steps={PROJECT_INTRO_TOUR_STEPS} onFinish={markProjectTourSeen} />
      <GuidedTour
        run={runOpenFlashcardTour}
        steps={openFlashcardTourSteps}
        onFinish={() => setTutorialStage('finished')}
      />
      <GuidedTour
        run={runOpenQuizTour}
        steps={openQuizTourSteps}
        onFinish={() => setTutorialStage('finished')}
      />

      <BulkActionBar
        open={selectMode}
        selectedCount={selectedDisplayedWordCount}
        totalCount={filteredWords.length}
        allSelected={allFilteredWordsSelected}
        allFavoriteInSelection={
          selectedFilteredWords.length > 0 &&
          selectedFilteredWords.every((w) => w.isFavorite)
        }
        favoriteLoading={bulkFavoriteLoading}
        vocabularyTypeLoading={bulkVocabularyTypeLoading}
        importLoading={bulkImportLoading}
        onCancel={handleExitSelectMode}
        onToggleSelectAll={() => {
          if (filteredWords.length === 0) return;
          setSelectedWordIds(allFilteredWordsSelected ? new Set() : new Set(filteredWords.map((w) => w.id)));
        }}
        onBulkFavorite={() => void handleBulkToggleFavorite()}
        onBulkVocabularyType={(vocabularyType) => void handleBulkSetVocabularyType(vocabularyType)}
        onBulkImport={() => void handleOpenBulkImport()}
        onBulkDelete={() => setBulkDeleteModalOpen(true)}
      />

      <ImportToProjectModal
        open={bulkImportModalOpen}
        loading={bulkImportLoading}
        count={selectedWordIds.size}
        projects={importTargetProjects}
        onCancel={() => { if (!bulkImportLoading) setBulkImportModalOpen(false); }}
        onConfirm={(targetProjectId) => void handleConfirmBulkImport(targetProjectId)}
      />

      <BulkDeleteModal
        open={bulkDeleteModalOpen}
        loading={bulkDeleteLoading}
        count={selectedWordIds.size}
        onCancel={() => { if (!bulkDeleteLoading) setBulkDeleteModalOpen(false); }}
        onConfirm={() => void handleConfirmBulkDelete()}
      />

      {renameModalOpen && (
        <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="閉じる"
            onClick={() => { if (!renameLoading) setRenameModalOpen(false); }}
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">RENAME</div>
              <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">名称変更</h2>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirmRename(); }}
                autoFocus
                maxLength={60}
                className="mt-3 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  disabled={renameLoading}
                  className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmRename()}
                  disabled={renameLoading || !renameValue.trim()}
                  className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {renameLoading ? '変更中...' : '変更'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DeleteProjectModal({
  open,
  loading,
  title,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            DELETE
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            この単語帳を削除しますか？
          </h2>
          <p className="mt-2 truncate text-[12px] text-[var(--color-muted)]">「{title}」</p>
          <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            この操作は取り消せません。含まれる単語もすべて削除されます。
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              削除する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyWordbookState({
  isPro,
  onScan,
  onManualAdd,
}: {
  isPro: boolean;
  onScan: () => void;
  onManualAdd: () => void;
}) {
  // Free users get manual entry first (scanning is Pro-only);
  // Pro users get scan as the recommended first action.
  const actions: {
    key: string;
    icon: string;
    label: string;
    hint: string;
    primary?: boolean;
    pro?: boolean;
    onClick: () => void;
  }[] = isPro
    ? [
        { key: 'scan', icon: 'photo_camera', label: 'スキャンで追加', hint: '写真から自動で単語を抽出', primary: true, onClick: onScan },
        { key: 'manual', icon: 'edit', label: '手で入力', hint: '続けて何語でも入力できます', onClick: onManualAdd },
      ]
    : [
        { key: 'manual', icon: 'edit', label: '手で入力', hint: '続けて何語でも入力できます', primary: true, onClick: onManualAdd },
        { key: 'scan', icon: 'photo_camera', label: 'スキャンで追加', hint: '写真から自動抽出（Pro限定）', pro: true, onClick: onScan },
      ];

  return (
    <div
      className="rounded-[14px] border-2 border-dashed border-[var(--solid-ink)] bg-white px-5 py-7 text-center"
      style={{ background: 'rgba(26,26,26,0.02)' }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]">
        <Icon name="menu_book" size={20} className="text-[var(--color-accent-ink)]" />
      </div>
      <div className="mt-3 font-display text-[16px] font-extrabold text-[var(--solid-ink)]">
        まだ単語がありません
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--color-muted)]">
        単語を追加すると、クイズやカードで学習を始められます。
      </p>
      <div className="mt-4 flex flex-col gap-2.5 text-left">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-3 rounded-[12px] border-2 px-3.5 py-3 transition-all duration-100 active:translate-x-px active:translate-y-px"
            style={{
              borderColor: 'var(--solid-ink)',
              background: action.primary ? 'var(--color-accent)' : '#fff',
              boxShadow: '2px 2px 0 var(--solid-ink)',
            }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
              style={{
                background: action.primary ? 'rgba(255,255,255,0.18)' : 'var(--color-surface-secondary)',
                color: action.primary ? '#fff' : 'var(--solid-ink)',
              }}
            >
              <Icon name={action.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="flex items-center gap-1.5 text-[13.5px] font-bold"
                style={{ color: action.primary ? '#fff' : 'var(--solid-ink)' }}
              >
                {action.label}
                {action.pro && (
                  <span className="rounded-[3px] border border-[var(--solid-ink)] bg-white px-[5px] py-[1px] font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                    PRO
                  </span>
                )}
              </span>
              <span
                className="mt-0.5 block text-[10.5px] font-medium"
                style={{ color: action.primary ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)' }}
              >
                {action.hint}
              </span>
            </span>
            <Icon
              name="chevron_right"
              size={16}
              style={{ color: action.primary ? '#fff' : 'var(--color-muted)' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function RecommendedWordsSection({
  suggestions,
  addingIds,
  onAdd,
}: {
  suggestions: RecommendedWordSuggestion[];
  addingIds: Set<string>;
  onAdd: (suggestion: RecommendedWordSuggestion) => void;
}) {
  return (
    <section className="mt-7 px-1">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
        PICKED FOR YOU
      </div>
      <h2 className="mt-0.5 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
        おすすめの単語
      </h2>
      <p className="mt-0.5 text-[11px] leading-[1.5] text-[var(--color-muted)]">
        あなたの他の単語帳からピックアップしました
      </p>
      <div className="mt-2 divide-y divide-[var(--color-border)]">
        {suggestions.map((suggestion) => {
          const { word } = suggestion;
          const adding = addingIds.has(word.id);
          const pos = word.partOfSpeechTags?.[0] ?? null;
          return (
            <div key={word.id} className="flex items-center gap-2.5 py-2.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
                style={{ backgroundColor: thumbColor(word.id) }}
              >
                {word.english.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
                  {word.english}
                </div>
                <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                  {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
                  <span className="truncate">
                    <TranslationDisplay word={word} compact />
                  </span>
                  <span className="shrink-0">·</span>
                  <span className="max-w-[96px] truncate">{suggestion.sourceProjectTitle}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAdd(suggestion)}
                disabled={adding}
                aria-label={`「${word.english}」をこの単語帳に追加`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                <Icon
                  name={adding ? 'progress_activity' : 'add'}
                  size={16}
                  className={adding ? 'animate-spin' : undefined}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ManualWordModal({
  open,
  loading,
  loadingMessage,
  addedCount,
  english,
  japanese,
  partOfSpeech,
  exampleSentence,
  morphologyEnabled,
  onEnglishChange,
  onJapaneseChange,
  onPartOfSpeechChange,
  onExampleSentenceChange,
  onMorphologyEnabledChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  loadingMessage?: string;
  addedCount: number;
  english: string;
  japanese: string;
  partOfSpeech: string;
  exampleSentence: string;
  morphologyEnabled: boolean;
  onEnglishChange: (value: string) => void;
  onJapaneseChange: (value: string) => void;
  onPartOfSpeechChange: (value: string) => void;
  onExampleSentenceChange: (value: string) => void;
  onMorphologyEnabledChange: (enabled: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [showOptional, setShowOptional] = useState(false);
  const englishInputRef = useRef<HTMLInputElement>(null);
  const wasLoadingRef = useRef(loading);

  // After each save the form clears and stays open for the next word —
  // refocus the english field so batch entry flows without extra taps.
  useEffect(() => {
    if (wasLoadingRef.current && !loading && open) {
      englishInputRef.current?.focus();
    }
    wasLoadingRef.current = loading;
  }, [loading, open]);

  if (!open) return null;
  // 日本語訳は任意（未入力ならマスター/AI が補完する）。英単語だけ必須。
  const canSubmit = english.trim().length > 0 && !loading;

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={() => { if (!loading) onCancel(); }}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[400px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            ADD WORD
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            単語を追加
          </h2>
          <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            続けて何語でも入力できます。日本語訳・品詞・例文・発音記号は未入力でも AI が自動で補完します。
          </p>
          {addedCount > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--solid-ink)] bg-[var(--color-accent-light)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--color-accent-ink)]">
              <Icon name="check" size={11} />
              {addedCount}語追加済み
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                英単語
              </label>
              <input
                ref={englishInputRef}
                type="text"
                value={english}
                onChange={(e) => onEnglishChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onConfirm(); }}
                placeholder="例: beautiful"
                disabled={loading}
                maxLength={50}
                autoFocus
                className="w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                日本語訳（任意）
              </label>
              <input
                type="text"
                value={japanese}
                onChange={(e) => onJapaneseChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onConfirm(); }}
                placeholder="例: 美しい（未入力なら自動補完）"
                disabled={loading}
                maxLength={100}
                className="w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
              />
            </div>

            {/* 語源解析トグル（スキャンパネルと同じチェックカード型） */}
            <button
              type="button"
              onClick={() => onMorphologyEnabledChange(!morphologyEnabled)}
              disabled={loading}
              className="flex w-full items-start gap-2 rounded-[10px] border-2 bg-white px-3 py-2.5 text-left transition-all disabled:opacity-60"
              style={{
                borderColor: morphologyEnabled ? 'var(--solid-ink)' : 'var(--color-border)',
                boxShadow: morphologyEnabled ? '2px 2px 0 var(--solid-ink)' : 'none',
              }}
            >
              <span
                className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `1.25px solid ${morphologyEnabled ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: morphologyEnabled ? 'var(--color-accent)' : '#fff',
                }}
              >
                {morphologyEnabled && <Icon name="check" size={11} className="text-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--solid-ink)]">
                  <span className="truncate">語源解析</span>
                  <span className="shrink-0 font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                    +1コイン/語
                  </span>
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-[var(--color-muted)]">
                  接頭語・接尾語・接中語と語根の成り立ちを解説
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)] transition-colors hover:text-[var(--solid-ink)]"
            >
              <Icon name={showOptional ? 'expand_less' : 'expand_more'} size={12} />
              詳細を入力する（任意）
            </button>

            {showOptional && (
              <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    品詞（任意）
                  </label>
                  <input
                    type="text"
                    value={partOfSpeech}
                    onChange={(e) => onPartOfSpeechChange(e.target.value)}
                    placeholder="例: noun / verb / adjective"
                    disabled={loading}
                    className="w-full rounded-[10px] border-2 border-[var(--color-border)] bg-white px-3 py-2 text-[12px] text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    例文（任意）
                  </label>
                  <input
                    type="text"
                    value={exampleSentence}
                    onChange={(e) => onExampleSentenceChange(e.target.value)}
                    placeholder="例: She is beautiful."
                    disabled={loading}
                    className="w-full rounded-[10px] border-2 border-[var(--color-border)] bg-white px-3 py-2 text-[12px] text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              {addedCount > 0 ? '完了' : 'キャンセル'}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canSubmit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              {loading ? (loadingMessage ?? '保存中...') : '追加して次へ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderBtn({
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

function ToolChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full border-2 border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
      <Icon name={icon} size={12} />
      <span className="text-[#4a4a4a]">{label}</span>
    </span>
  );
}

function StackedBar({ total, m, a, l, n }: { total: number; m: number; a: number; l: number; n: number }) {
  const pctM = total ? (m / total) * 100 : 0;
  const pctA = total ? (a / total) * 100 : 0;
  const pctL = total ? (l / total) * 100 : 0;
  const pctN = total ? (n / total) * 100 : 0;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-white">
        <div style={{ width: `${pctM}%`, background: 'var(--color-success)' }} />
        <div style={{ width: `${pctA}%`, background: '#2563eb' }} />
        <div style={{ width: `${pctL}%`, background: 'var(--color-warning)' }} />
        <div style={{ width: `${pctN}%`, background: 'rgba(26,26,26,0.12)' }} />
      </div>
      <div className="mt-[7px] flex flex-wrap gap-3.5 font-[var(--font-body)]">
        <BarDot color="var(--color-success)" label="習得" count={m} />
        <BarDot color="#2563eb" label="定着中" count={a} />
        <BarDot color="var(--color-warning)" label="学習中" count={l} />
        <BarDot color="rgba(26,26,26,0.35)" label="未学習" count={n} />
      </div>
    </div>
  );
}

function BarDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <span className="h-[7px] w-[7px] rounded-[3.5px]" style={{ background: color }} />
      <span className="text-[11px] font-semibold text-[#4a4a4a]">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{count}</span>
    </span>
  );
}

const POS_JP: Record<string, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  preposition: '前置詞',
  conjunction: '接続詞',
  pronoun: '代名詞',
  interjection: '感動詞',
  determiner: '限定詞',
  auxiliary: '助動詞',
  phrase: '句',
  idiom: 'イディオム',
  phrasal_verb: '句動詞',
  other: 'その他',
};

function posShort(tag: string): string {
  const jp = POS_JP[tag] ?? tag;
  return `(${jp[0]})`;
}

const PP_FILLED: Record<WordStatus, number> = { new: 0, review: 1, active: 2, mastered: 3 };
const PP_STATUS: WordStatus[] = ['new', 'review', 'active', 'mastered'];
const PP_ARIA: Record<WordStatus, string> = { new: '未学習', review: '学習中', active: '定着中', mastered: '習得済み' };

function StatusSquares({
  wordId,
  status,
  onStatusChange,
  className,
}: {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
  className?: string;
}) {
  const [filledCount, setFilledCount] = useState(() => PP_FILLED[status] ?? 0);
  const [direction, setDirection] = useState<'up' | 'down'>(() =>
    status === 'mastered' ? 'down' : 'up'
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFilledCount(PP_FILLED[status] ?? 0);
      setDirection(status === 'mastered' ? 'down' : 'up');
    });
    return () => { cancelled = true; };
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'up') {
      if (filledCount < 3) {
        const next = filledCount + 1;
        setFilledCount(next);
        if (next === 3) setDirection('down');
        onStatusChange(PP_STATUS[next]);
      }
    } else {
      if (filledCount > 0) {
        const next = filledCount - 1;
        setFilledCount(next);
        if (next === 0) setDirection('up');
        onStatusChange(PP_STATUS[next]);
      }
    }
  }, [filledCount, direction, onStatusChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`ステータス: ${PP_ARIA[status] ?? status}`}
      className={`shrink-0 rounded transition-colors active:bg-[rgba(26,26,26,0.06)]${className ? ` ${className}` : ''}`}
    >
      <div className="flex flex-col gap-[1.5px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[13px] w-[13px] rounded-[2.5px] border-2 border-[var(--solid-ink)]"
            style={{ background: i < filledCount ? 'var(--solid-ink)' : 'transparent' }}
          />
        ))}
      </div>
    </button>
  );
}

function WordRow({
  word,
  selectMode,
  selected,
  tourAnchor = false,
  onToggleSelect,
  onCycleStatus,
  onCycleVocabularyType,
  onToggleFavorite,
  onSelect,
}: {
  word: Word;
  selectMode: boolean;
  selected: boolean;
  tourAnchor?: boolean;
  onToggleSelect: () => void;
  onCycleStatus: (newStatus: WordStatus) => void;
  onCycleVocabularyType: () => void;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  const pos = word.partOfSpeechTags?.[0] ?? null;
  const displayStatus = word.status;

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        className={`block w-full px-1 py-2.5 text-left transition-colors ${
          selected ? 'bg-[rgba(19,127,236,0.06)]' : ''
        }`}
      >
        <div className="flex items-center gap-2.5">
          <SelectCheckbox checked={selected} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
            <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
              {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
              <span className="truncate">
                <TranslationDisplay word={word} compact />
              </span>
            </div>
          </div>
          <VocabularyTypeBadge vocabularyType={word.vocabularyType} />
          <BookmarkBadge active={word.isFavorite} />
        </div>
      </button>
    );
  }

  return (
    <div className="px-1 py-2.5">
      <div className="flex items-center gap-2.5">
        <StatusSquares
          wordId={word.id}
          status={displayStatus}
          onStatusChange={onCycleStatus}
          className={tourAnchor ? 'tour-anchor-word-status' : undefined}
        />

        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
          <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
            {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
            <span className="truncate">
              <TranslationDisplay word={word} compact />
            </span>
          </div>
        </button>

        <VocabularyTypeButton
          vocabularyType={word.vocabularyType}
          onClick={onCycleVocabularyType}
          className={tourAnchor ? 'shrink-0 tour-anchor-vocab-type' : 'shrink-0'}
        />
        <button
          type="button"
          onClick={onToggleFavorite}
          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center text-[var(--color-accent)]"
          aria-label="保存を切り替え"
        >
          <Icon name="bookmark" size={22} filled={word.isFavorite} />
        </button>
      </div>
    </div>
  );
}

function VocabularyTypeBadge({
  vocabularyType,
}: {
  vocabularyType: VocabularyType | null | undefined;
}) {
  const toneClass =
    vocabularyType === 'active'
      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
      : vocabularyType === 'passive'
        ? 'border-[rgba(107,114,128,0.5)] bg-[rgba(107,114,128,0.5)] text-white'
        : 'border-[var(--color-border)] bg-transparent text-[var(--color-muted)]';

  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-black leading-none ${toneClass}`}
      aria-label={`語彙モード: ${getVocabularyTypeLabel(vocabularyType)}`}
      title={`語彙モード: ${getVocabularyTypeLabel(vocabularyType)}`}
    >
      {getVocabularyTypeShortLabel(vocabularyType)}
    </span>
  );
}

function BookmarkBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center ${
        active ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
      }`}
      aria-label={active ? 'ブックマーク済み' : 'ブックマークなし'}
      title={active ? 'ブックマーク済み' : 'ブックマークなし'}
    >
      <Icon name="bookmark" size={18} filled={active} />
    </span>
  );
}

function SelectCheckbox({ checked, size = 20 }: { checked: boolean; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border-2 transition-colors ${
        checked
          ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
          : 'border-[var(--solid-ink)] bg-white text-transparent'
      }`}
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
      aria-hidden
    >
      {checked && <Icon name="check" size={Math.round(size * 0.65)} />}
    </span>
  );
}

function BulkActionBar({
  open,
  selectedCount,
  totalCount,
  allSelected,
  allFavoriteInSelection,
  favoriteLoading,
  vocabularyTypeLoading,
  importLoading,
  onCancel,
  onToggleSelectAll,
  onBulkFavorite,
  onBulkVocabularyType,
  onBulkImport,
  onBulkDelete,
}: {
  open: boolean;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  allFavoriteInSelection: boolean;
  favoriteLoading: boolean;
  vocabularyTypeLoading: VocabularyType | null;
  importLoading: boolean;
  onCancel: () => void;
  onToggleSelectAll: () => void;
  onBulkFavorite: () => void;
  onBulkVocabularyType: (vocabularyType: VocabularyType) => void;
  onBulkImport: () => void;
  onBulkDelete: () => void;
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const hasSelection = selectedCount > 0;
  const actionLoading = favoriteLoading || vocabularyTypeLoading !== null || importLoading;
  const showActionMenu = actionMenuOpen && hasSelection && !actionLoading;

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 bg-[linear-gradient(to_top,var(--color-background)_70%,transparent)] px-3 pt-3 lg:bg-none"
      style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg lg:max-w-2xl">
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
            style={{ transform: 'translate(2px, 3px)' }}
          />
          <div className="relative flex items-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white px-2.5 py-2.5">
            <button
              type="button"
              onClick={onCancel}
              aria-label="選択を終了"
              className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="close" size={16} />
            </button>
            <button
              type="button"
              onClick={onToggleSelectAll}
              disabled={totalCount === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[7px] text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
            >
              <SelectCheckbox checked={allSelected && totalCount > 0} />
              {allSelected && totalCount > 0 ? '解除' : '全選択'}
            </button>
            <div className="min-w-0 flex-1 px-1 text-center">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                SELECTED
              </div>
              <div className="font-display text-[14px] font-extrabold leading-none text-[var(--solid-ink)]">
                {selectedCount}
                <span className="ml-1 font-mono text-[10px] font-semibold text-[var(--color-muted)]">
                  / {totalCount}
                </span>
              </div>
            </div>
            {/* Desktop: bulk actions laid out inline (no "..." menu) */}
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <BulkInlineActionButton
                icon="bookmark"
                label="ブックマーク"
                filled={allFavoriteInSelection && hasSelection}
                loading={favoriteLoading}
                disabled={!hasSelection || actionLoading}
                onClick={onBulkFavorite}
              />
              <BulkInlineActionButton
                icon="keyboard_alt"
                label="Active"
                loading={vocabularyTypeLoading === 'active'}
                disabled={!hasSelection || actionLoading}
                onClick={() => onBulkVocabularyType('active')}
              />
              <BulkInlineActionButton
                icon="visibility"
                label="Passive"
                loading={vocabularyTypeLoading === 'passive'}
                disabled={!hasSelection || actionLoading}
                onClick={() => onBulkVocabularyType('passive')}
              />
              <BulkInlineActionButton
                icon="drive_file_move"
                label="コピー"
                loading={importLoading}
                disabled={!hasSelection || actionLoading}
                onClick={onBulkImport}
              />
            </div>
            {/* Mobile: compact "..." menu */}
            <div className="relative shrink-0 lg:hidden">
              {showActionMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    aria-label="一括操作メニューを閉じる"
                    onClick={() => setActionMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute bottom-[44px] right-0 z-50 flex w-[148px] flex-col gap-2 pb-1"
                  >
                    <BulkActionMenuButton
                      icon="bookmark"
                      label="ブックマーク"
                      filled={allFavoriteInSelection && hasSelection}
                      loading={favoriteLoading}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkFavorite();
                      }}
                    />
                    <BulkActionMenuButton
                      icon="keyboard_alt"
                      label="Active"
                      loading={vocabularyTypeLoading === 'active'}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkVocabularyType('active');
                      }}
                    />
                    <BulkActionMenuButton
                      icon="visibility"
                      label="Passive"
                      loading={vocabularyTypeLoading === 'passive'}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkVocabularyType('passive');
                      }}
                    />
                    <BulkActionMenuButton
                      icon="drive_file_move"
                      label="コピー"
                      loading={importLoading}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkImport();
                      }}
                    />
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setActionMenuOpen((value) => !value)}
                disabled={!hasSelection || actionLoading}
                aria-label="一括操作メニュー"
                aria-haspopup="menu"
                aria-expanded={showActionMenu}
                className="relative z-50 inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                {actionLoading ? (
                  <Icon name="progress_activity" size={16} className="animate-spin" />
                ) : (
                  <Icon name="more_horiz" size={16} />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={!hasSelection}
              aria-label="削除"
              className="inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 text-[12px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              <Icon name="delete" size={15} />
              削除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkInlineActionButton({
  icon,
  label,
  filled,
  loading,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  filled?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
    >
      {loading ? (
        <Icon name="progress_activity" size={15} className="animate-spin" />
      ) : (
        <Icon
          name={icon}
          size={15}
          filled={filled}
          className={icon === 'bookmark' ? 'text-[var(--color-accent)]' : undefined}
        />
      )}
      {label}
    </button>
  );
}

function BulkActionMenuButton({
  icon,
  label,
  filled,
  loading,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  filled?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[38px] w-full items-center justify-between rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
    >
      <span>{label}</span>
      {loading ? (
        <Icon name="progress_activity" size={15} className="animate-spin" />
      ) : (
        <Icon
          name={icon}
          size={15}
          filled={filled}
          className={icon === 'bookmark' ? 'text-[var(--color-accent)]' : undefined}
        />
      )}
    </button>
  );
}

function BulkDeleteModal({
  open,
  loading,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            DELETE
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {count}語を削除しますか？
          </h2>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            選択した{count}語が削除されます。この操作は取り消せません。
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              削除する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportToProjectModal({
  open,
  loading,
  count,
  projects,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  count: number;
  projects: Project[];
  onCancel: () => void;
  onConfirm: (projectId: string) => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            COPY TO
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {count}語をコピー
          </h2>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            コピー先の単語帳を選択してください。選択した単語がコピーされます。
          </p>
          <div className="mt-3 max-h-[240px] overflow-y-auto">
            {projects.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--color-muted)]">
                他の単語帳がありません
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProjectId(p.id)}
                    disabled={loading}
                    className={`flex items-center gap-2.5 rounded-[10px] border-2 px-3 py-2.5 text-left transition-all duration-100 ${
                      selectedProjectId === p.id
                        ? 'border-[var(--solid-ink)] bg-[var(--color-accent-subtle)]'
                        : 'border-[var(--color-border)] bg-white'
                    }`}
                  >
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[11px] font-black text-white"
                      style={{ background: thumbColor(p.id) }}
                    >
                      {p.title.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--solid-ink)]">
                      {p.title}
                    </span>
                    {selectedProjectId === p.id && (
                      <Icon name="check" size={16} className="shrink-0 text-[var(--color-accent)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => selectedProjectId && onConfirm(selectedProjectId)}
              disabled={loading || !selectedProjectId}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              コピーする
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SingleWordDeleteModal({
  open,
  loading,
  word,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  word: Word | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !word) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            DELETE
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            単語を削除しますか？
          </h2>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            {word.english} が削除されます。この操作は取り消せません。
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              削除する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-[var(--color-border-light)] px-3.5 py-3 text-left text-[13px] font-bold last:border-b-0 active:bg-[var(--color-surface-secondary)]"
      style={{ color: destructive ? 'var(--color-error, #cc4d59)' : 'var(--solid-ink)' }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}
