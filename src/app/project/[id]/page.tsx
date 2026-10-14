'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { markProjectUsed } from '@/lib/projects/recent-use';
import Link from 'next/link';
import { DesktopProjectDetailView } from '@/components/desktop/DesktopProjectDetail';
import { TabletProjectDetailView } from '@/components/tablet/TabletProjectDetail';
import { TabletOnly } from '@/components/tablet/TabletOnly';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/toast';
import { WordLimitModal } from '@/components/limits';
import { ScanCaptureModal } from '@/components/home/ScanCaptureModal';
import { ProjectShareSheet } from '@/components/project/ProjectShareSheet';
import { WordRow } from '@/components/project/WordRow';
import { StackedBar } from '@/components/project/WordStatusBar';
import { GuidedTour, type TourStep } from '@/components/onboarding/GuidedTour';
import { WordFilterSheet, WordSortSheet } from '@/components/project/WordListSheets';
import { VoiceWordModal } from '@/components/project/VoiceWordModal';
import { BinderPickerSheet } from '@/components/desktop/ProjectListSheets';
import { WordDetailOverlay } from '@/components/word/WordDetailOverlay';
import { useAuth } from '@/hooks/use-auth';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { useTourSeen } from '@/hooks/use-tour-seen';
import { useTutorialFlow, type TutorialStage } from '@/hooks/use-tutorial-flow';
import { useWordCount } from '@/hooks/use-word-count';
import { getDb, getRepository, hybridRepository, syncQueue } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { scheduleWordStatusWrite } from '@/lib/db/debounced-status-write';
import { consumeManualAddIntent, consumeVoiceAddIntent } from '@/lib/home/home-session-storage';
import { invalidateHomeCache } from '@/lib/home-cache';
import { markProjectVisited } from '@/lib/project-visit';
import {
  readManualExamplePref,
  writeManualExamplePref,
} from '@/lib/preferences/manual-example-pref';
import {
  readManualMorphologyPref,
  writeManualMorphologyPref,
} from '@/lib/preferences/manual-morphology-pref';
import { buildManualTranslations } from '@/lib/words/manual-translations';
import { saveProjectSharedTags } from '@/lib/shared-projects/client';
import { getNextVocabularyType, getVocabularyTypeLabel } from '@/lib/vocabulary-type';
import { isProjectPageFlowStage } from '@/lib/onboarding/tutorial-stage';
import { getGuestUserId, shuffleArray } from '@/lib/utils';
import {
  buildProjectWordOrderSnapshot,
  countProjectWordStats,
  isProjectWordFilterActive,
  selectAvailableProjectPartsOfSpeech,
  selectFilteredProjectWords,
  type ProjectWordActivenessFilter,
  type ProjectWordOrderSnapshot,
  type ProjectWordSortOrder,
} from '@/lib/project/project-page-selectors';
import type {
  Project,
  ProjectShareScope,
  SubscriptionStatus,
  VocabularyType,
  Word,
  WordStatus,
  WordTranslation,
} from '@/types';
import { thumbColor } from '@/lib/ui/thumb-color';
import {
  BulkDeleteModal,
  DeleteProjectModal,
  ImportToProjectModal,
  SingleWordDeleteModal,
} from '@/components/project/page/ProjectPageModals';
import { ManualWordModal } from '@/components/project/page/ManualWordModal';
import { BulkActionBar } from '@/components/project/page/ProjectBulkActions';
import {
  EmptyWordbookState,
  type RecommendedWordSuggestion,
  RecommendedWordsSection,
} from '@/components/project/page/ProjectEmptyState';
import {
  HeaderBtn,
  MenuButton,
  RedSheetToggle,
} from '@/components/project/page/ProjectHeaderControls';
import {
  CreateSectionModal,
  MoveToSectionModal,
  type ProjectSectionNav,
} from '@/components/project/page/SectionControls';
import {
  buildWordSectionGroups,
  getSectionGroupLabel,
  insertSectionName,
  normalizeSectionName,
  resolveProjectSectionNames,
} from '@/lib/project/word-sections';

/** 音声でまとめて追加するとき、同時に補完を走らせる語数。 */
const VOICE_ADD_CONCURRENCY = 3;

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
        <strong>A＝Active</strong>（自分でも使いこなしたい語）、
        <strong>P＝Passive</strong>（意味が分かればよい語）。
        <br />
        タップするたび 未設定 → A → P → 未設定 と切り替わり、あとでフィルタで絞り込めます。
      </>
    ),
    placement: 'left',
  },
];
type SharedProjectLookupResponse = {
  success?: boolean;
  project?: Project;
  error?: string;
};

// A word suggested for an empty wordbook, picked from the user's other books.
const RECOMMENDATION_SOURCE_PROJECT_LIMIT = 8;
const RECOMMENDATION_LIMIT = 10;

/**
 * ローカルで0語だった単語帳の単語をサーバーから取り直す。
 * 未送信の削除 (オフライン中に消した単語) はサーバーにまだ残っているので除く。
 * 取れた単語はローカルにも書き戻し、続けて開くクイズなども同じ単語を見られるようにする。
 * 失敗したら空のまま (従来どおりの表示) にする。
 */
async function loadRemoteWordsForEmptyLocalCache(projectId: string): Promise<Word[]> {
  try {
    const [remoteWords, pending] = await Promise.all([
      remoteRepository.getWords(projectId),
      syncQueue.getPending().catch(() => []),
    ]);
    const pendingDeletedWordIds = new Set(
      pending
        .filter((item) => item.table === 'words' && item.operation === 'delete')
        .map((item) => item.entityId),
    );
    const words = remoteWords.filter((word) => !pendingDeletedWordIds.has(word.id));
    if (words.length > 0) {
      try {
        await getDb().words.bulkPut(words);
      } catch {
        // キャッシュへの書き戻しは失敗しても表示には影響しない
      }
    }
    return words;
  } catch (error) {
    console.warn('Failed to load words from remote for an empty local wordbook:', error);
    return [];
  }
}

/**
 * 下部バーのセクション送りボタン。端のセクションでは「＋」になり、
 * その側に新しいセクションを作る。
 */
function SectionStepButton({
  direction,
  atEdge,
  disabled,
  onStep,
  onCreate,
}: {
  direction: 'prev' | 'next';
  atEdge: boolean;
  disabled?: boolean;
  onStep: () => void;
  onCreate: () => void;
}) {
  const create = atEdge && !disabled;
  return (
    <button
      type="button"
      onClick={create ? onCreate : onStep}
      disabled={disabled || (atEdge && !create)}
      aria-label={create ? '新しいセクション' : direction === 'prev' ? '前のセクション' : '次のセクション'}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40 ${
        create ? 'border-dashed bg-[var(--color-accent-light)]' : 'bg-[var(--color-surface)]'
      }`}
    >
      <Icon name={create ? 'add' : direction === 'prev' ? 'chevron_left' : 'chevron_right'} size={20} />
    </button>
  );
}

function isOwnedBy(project: Project | undefined | null, expectedUserId: string): project is Project {
  return Boolean(project && project.userId === expectedUserId);
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  // ホームのショートカットグリッドの「直近使った単語帳」用（recent-use.ts）
  useEffect(() => {
    markProjectUsed(projectId);
  }, [projectId]);
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { count: totalWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();
  const { shouldRender: projectTourReady, markSeen: markProjectTourSeen } = useTourSeen('project-intro');
  const { stage: tutorialStage, setStage: setTutorialStage } = useTutorialFlow();
  // フローがカード / クイズへ送り出した直後。遷移が終わるまでの一瞬に、
  // 次の段階では出してよくなった定着度 → A/P の解説がチラつかないよう止めておく。
  const [leavingForTutorial, setLeavingForTutorial] = useState(false);
  const advanceTutorialAndLeave = useCallback((next: TutorialStage) => {
    setLeavingForTutorial(true);
    setTutorialStage(next);
  }, [setTutorialStage]);
  // ガイドツアーのアンカー (data-tour) はスマホ用ツリーにしか無いので phone のときだけ出す
  const isMobileViewport = useLayoutMode() === 'phone';
  // ページ上端ではヘッダの下線を出さない（スクロールで表示）
  const pageScrolled = usePageScrolled();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [wordSortOrder, setWordSortOrder] = useState<ProjectWordSortOrder>('priority');
  // 学習順・未習得順は学習タグ (定着度) で並ぶので、タグを押すたびに並べ替えると
  // その行が目の前で飛んでしまう。並びに使う学習タグはこのスナップショットに
  // 凍結し、ページを開き直したとき (と並べ替えを選び直したとき) だけ取り直す。
  const [wordOrderSnapshot, setWordOrderSnapshot] = useState<ProjectWordOrderSnapshot | null>(null);
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  // バインダー (フォルダ) ピッカー。既存のバインダー名は開くときに集める
  const [binderPickerOpen, setBinderPickerOpen] = useState(false);
  const [binderNames, setBinderNames] = useState<string[]>([]);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [deleteWordTarget, setDeleteWordTarget] = useState<Word | null>(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);

  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [showScanCaptureModal, setShowScanCaptureModal] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  // 日本語訳は欄ごとに1訳。「＋ 訳を追加」で欄を増やして複数の訳を登録できる。
  const [manualWordTranslations, setManualWordTranslations] = useState<string[]>(['']);
  const [manualWordPartOfSpeech, setManualWordPartOfSpeech] = useState('');
  const [manualWordExampleSentence, setManualWordExampleSentence] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);
  const [manualWordSavingMessage, setManualWordSavingMessage] = useState<string | undefined>(undefined);
  const [manualWordAddedCount, setManualWordAddedCount] = useState(0);
  // 音声でまとめて追加するモーダル。保存は手入力と同じ経路 (addEnrichedManualWord)。
  const [showVoiceWordModal, setShowVoiceWordModal] = useState(false);
  const [voiceWordAdding, setVoiceWordAdding] = useState(false);
  const [voiceWordAddingMessage, setVoiceWordAddingMessage] = useState<string | undefined>(undefined);
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
  // 手動追加時の例文生成トグル。語源解析と違い既定オフ・コイン消費なし。
  const [manualWordExampleEnabled, setManualWordExampleEnabled] = useState(false);
  useEffect(() => {
    setManualWordExampleEnabled(readManualExamplePref());
  }, []);
  const handleManualWordExampleChange = useCallback((enabled: boolean) => {
    setManualWordExampleEnabled(enabled);
    writeManualExamplePref(enabled);
  }, []);
  useEffect(() => {
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

  // 認証やサブスクの確定で loadProject が作り直されると、前の呼び出しが
  // 後から終わって新しい結果を上書きしうる。最後に始めた呼び出しだけ反映する。
  const loadRequestIdRef = useRef(0);

  const loadProject = useCallback(async () => {
    if (authLoading) return;
    const requestId = ++loadRequestIdRef.current;
    const isStale = () => requestId !== loadRequestIdRef.current;
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

      if (isStale()) return;

      if (isOwnedBy(loadedProject, expectedUserId)) {
        setProject(loadedProject);
        setLoading(false);
        let loadedWords = await wordRepo.getWords(projectId);
        // ローカルキャッシュは同期の途中で単語帳だけ入って単語がまだ、という
        // 状態になりうる。0語のときはサーバーにも訊いて、本当に空かを確かめる。
        if (loadedWords.length === 0 && wordRepo === hybridRepository && user && navigator.onLine) {
          loadedWords = await loadRemoteWordsForEmptyLocalCache(projectId);
        }
        if (isStale()) return;
        setWords(loadedWords);
        setWordOrderSnapshot(buildProjectWordOrderSnapshot(loadedWords));
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
      if (isStale()) return;
      console.error('Failed to load project:', loadError);
      setError('単語帳の読み込みに失敗しました');
    } finally {
      if (!isStale()) {
        setLoading(false);
        setWordsLoaded(true);
      }
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
        setManualWordSectionName(null);
        setManualWordAddedCount(0);
        setShowManualWordModal(true);
      }
      // 「音声で作成」から来たときは音声追加モーダルを開く。
      if (consumeVoiceAddIntent(sessionStorage) === projectId) {
        setShowVoiceWordModal(true);
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
      orderSnapshot: wordOrderSnapshot,
    });
  }, [query, words, wordSortOrder, wordOrderSnapshot, wordFilterBookmark, wordFilterActiveness, wordFilterPos]);

  // セクション: 一覧はセクション単位で見せ、下部バーの左右の矢印でセクションを送る。
  // セクションの無い単語帳は全語で1つ。検索中は単語帳全体から探したいので区切らない。
  const sectionNames = useMemo(
    () => resolveProjectSectionNames(project?.sectionNames, words),
    [project?.sectionNames, words],
  );
  const searching = query.trim().length > 0;
  const sectionGroups = useMemo(
    () => (searching
      ? [{ name: null, words: filteredWords }]
      : buildWordSectionGroups(sectionNames, words, filteredWords)),
    [searching, sectionNames, words, filteredWords],
  );
  const [storedSectionIndex, setSectionIndex] = useState(0);
  const sectionIndex = Math.min(storedSectionIndex, sectionGroups.length - 1);
  const currentSectionGroup = sectionGroups[sectionIndex];
  const currentSectionName = searching ? null : currentSectionGroup.name;
  const currentSectionLabel = searching ? null : getSectionGroupLabel(currentSectionGroup, sectionGroups.length);
  const sectionWords = currentSectionGroup.words;
  // 作ったばかりのセクションへ移るための印。単語帳の更新が一覧に反映されてから移る。
  const pendingSectionFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingSectionFocusRef.current;
    if (!target) return;
    const index = sectionGroups.findIndex((group) => group.name === target);
    if (index >= 0) {
      pendingSectionFocusRef.current = null;
      setSectionIndex(index);
    }
  }, [sectionGroups]);
  const [createSectionPosition, setCreateSectionPosition] = useState<'start' | 'end' | null>(null);
  const [createSectionLoading, setCreateSectionLoading] = useState(false);
  const [moveSectionModalOpen, setMoveSectionModalOpen] = useState(false);
  const [moveSectionLoading, setMoveSectionLoading] = useState(false);
  // 手入力で追加する語の入り先。開いたときに見ていたセクションから始める。
  const [manualWordSectionName, setManualWordSectionName] = useState<string | null>(null);

  // 赤シート: 一覧の訳を赤いベタで隠す。紙の単語帳の赤シートと同じ使い方をする。
  // 下部バーの左のシートは英語 (見出し語) 側、右のシートは訳側を隠す。両方同時に掛けてもよい。
  // 開くたびにオフから始めたいので端末には覚えさせない。
  const [redSheet, setRedSheet] = useState(false);
  const [englishRedSheet, setEnglishRedSheet] = useState(false);
  // 下部固定バー (ページ送り + 赤シート)。1語でもあれば出す。ただし選択モード中は
  // 同じ位置に BulkActionBar が来るので譲る。
  const showWordToolbar = wordsLoaded && (filteredWords.length > 0 || sectionNames.length > 0) && !selectMode;

  // 選択は表示中のセクションの語が対象 (全選択もそのセクションだけ)
  const selectedDisplayedWordCount = useMemo(
    () => sectionWords.filter((word) => selectedWordIds.has(word.id)).length,
    [sectionWords, selectedWordIds],
  );
  const allFilteredWordsSelected = sectionWords.length > 0
    && sectionWords.every((word) => selectedWordIds.has(word.id));
  const selectedFilteredWords = useMemo(
    () => sectionWords.filter((word) => selectedWordIds.has(word.id)),
    [sectionWords, selectedWordIds],
  );

  // The guided flow's own tours on this page (flashcard / quiz nudges) take
  // priority over the status/A-P coach mark. Only those stages hold it back —
  // an unfinished flow elsewhere (e.g. a quiz left half-way) must not hide it.
  const tutorialFlowOnThisPage = isProjectPageFlowStage(tutorialStage) || leavingForTutorial;

  // Word-list coach mark: only while the plain list is visible and no competing
  // sheet/modal is open (the anchored rows are replaced in select mode), and not
  // while the guided flow is showing its own tour here (shown afterward instead).
  const runProjectTour =
    projectTourReady
    && isMobileViewport
    && !tutorialFlowOnThisPage
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
              advanceTutorialAndLeave('view-cards');
              router.push(`/flashcard/${projectId}`);
            },
          },
        },
      },
    ],
    [projectId, router, advanceTutorialAndLeave],
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
              advanceTutorialAndLeave('awaiting-quiz');
              router.push(`/quiz/${projectId}`);
            },
          },
        },
      },
    ],
    [projectId, router, advanceTutorialAndLeave],
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
        message: `${targets.length}語を ${getVocabularyTypeLabel(vocabularyType)} に変更しました`,
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
        // コピーしただけだと結果を確かめに行く導線が無いので、その場で
        // コピー先の単語帳を開けるようにする（タップする間だけ表示を延ばす）。
        action: {
          label: '開く',
          onClick: () => router.push(`/project/${targetProjectId}`),
        },
        duration: 6000,
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

  /**
   * セクションを1つ足して単語帳に保存する。失敗したら元に戻して false。
   * 既にある名前なら何もせず true (選び直すだけで済む)。
   */
  const handleCreateSection = async (rawName: string, position: 'start' | 'end' = 'end'): Promise<boolean> => {
    if (!project) return false;
    const name = normalizeSectionName(rawName);
    if (!name) return false;
    if (sectionNames.includes(name)) return true;
    const previous = project.sectionNames;
    const next = insertSectionName(sectionNames, name, position);
    setProject((prev) => (prev ? { ...prev, sectionNames: next } : prev));
    try {
      await mutationRepository.updateProject(projectId, { sectionNames: next });
      return true;
    } catch (sectionError) {
      console.error('Failed to create section:', sectionError);
      setProject((prev) => (prev ? { ...prev, sectionNames: previous } : prev));
      showToast({ message: 'セクションを作成できませんでした', type: 'error' });
      return false;
    }
  };

  /** 下部バーの端の「＋」から作ったセクションへそのまま移る。 */
  const handleConfirmCreateSection = async (name: string) => {
    if (!createSectionPosition || createSectionLoading) return;
    setCreateSectionLoading(true);
    const ok = await handleCreateSection(name, createSectionPosition);
    setCreateSectionLoading(false);
    if (!ok) return;
    pendingSectionFocusRef.current = name;
    setCreateSectionPosition(null);
  };

  const handleConfirmMoveToSection = async (sectionName: string | null) => {
    if (selectedWordIds.size === 0 || moveSectionLoading) return;
    const targets = words.filter((w) => selectedWordIds.has(w.id));
    if (targets.length === 0) return;

    setMoveSectionLoading(true);
    // 移した先のセクションへ一覧も移る (一覧の組み直しを待って移るので、更新より先に印を付ける)
    pendingSectionFocusRef.current = sectionName ?? null;
    setWords((prev) => prev.map((w) => (selectedWordIds.has(w.id) ? { ...w, sectionName } : w)));
    try {
      for (const w of targets) {
        if ((normalizeSectionName(w.sectionName) ?? null) !== sectionName) {
          await mutationRepository.updateWord(w.id, { sectionName });
        }
      }
      showToast({
        message: `${targets.length}語を「${sectionName ?? '未分類'}」に移動しました`,
        type: 'success',
      });
      setMoveSectionModalOpen(false);
      setSelectedWordIds(new Set());
      setSelectMode(false);
    } catch (moveError) {
      console.error('Failed to move words to section:', moveError);
      pendingSectionFocusRef.current = null;
      setWords((prev) => prev.map((w) => {
        const original = targets.find((t) => t.id === w.id);
        return original ? { ...w, sectionName: original.sectionName } : w;
      }));
      showToast({ message: 'セクションの移動に失敗しました', type: 'error' });
    } finally {
      setMoveSectionLoading(false);
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
          // タップで段階を選び直したら習得レベルも 0 から (古いレベルが残ると
          // 次に習得したときに復活してしまう)
          await mutationRepository.updateWord(wordId, { status: finalStatus, masteryLevel: 0 });
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

  // バインダー (フォルダ) の設定はピッカーシートで行う。window.prompt は
  // PWA スタンドアロン表示や一部のモバイルブラウザでブロックされるため使わない。
  const handleOpenBinderPicker = async () => {
    if (!project) return;
    setMenuOpen(false);
    // 既存のバインダー名を集めてから開く (取得に失敗しても新規作成はできる)
    try {
      const userId = user ? user.id : getGuestUserId();
      const projects = await repository.getProjects(userId);
      const names = new Set<string>();
      for (const p of projects) {
        const name = p.binder?.trim();
        if (name) names.add(name);
      }
      setBinderNames(Array.from(names).sort((a, b) => a.localeCompare(b, 'ja')));
    } catch {
      setBinderNames([]);
    }
    setBinderPickerOpen(true);
  };

  // バインダーを適用する。null でバインダーから外す
  const handleApplyBinder = async (rawBinder: string | null) => {
    setBinderPickerOpen(false);
    if (!project) return;
    const binder = rawBinder?.trim().slice(0, 40) || null;
    if (binder === (project.binder?.trim() || null)) return;
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
    setManualWordTranslations(['']);
    setManualWordPartOfSpeech('');
    setManualWordExampleSentence('');
  };

  const openManualWordModal = () => {
    setManualWordSectionName(currentSectionName);
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

  // 音声追加は英語で認識するので、古典の単語帳では出さない。
  const voiceAddAvailable = project?.kind !== 'classical';
  const openVoiceWordModal = useCallback(() => setShowVoiceWordModal(true), []);
  // 一覧で「登録済み」と示すための見出し語。大文字小文字は区別しない。
  const existingEnglishSet = useMemo(
    () => new Set(words.map((word) => word.english.trim().toLowerCase())),
    [words],
  );

  /**
   * 1語を AI で補完して単語帳に入れる (手入力と音声追加で共通)。
   *
   * 日本語訳は未入力なら enrich-manual (マスター/AI) が補完する。補完もできず
   * 訳が空のままなら保存しない —— 意味の無い単語はクイズ・カードで使えないため。
   * 画面には先に楽観的に足し、保存は裏で続ける。
   */
  const addEnrichedManualWord = async (input: {
    english: string;
    /** ユーザーが入力した日本語訳 (欄ごとに1訳)。空なら enrich-manual が補完する。 */
    translations?: string[];
    partOfSpeech?: string;
    exampleSentence?: string;
    /** 入れるセクション。null/未指定は未分類。 */
    sectionName?: string | null;
  }): Promise<'added' | 'no_japanese'> => {
    const english = input.english.trim();
    const sectionName = normalizeSectionName(input.sectionName);
    // 入力訳が複数あれば訳ごとの word_translations にする。補完 AI には第一訳だけを
    // 渡し、例文・マスターの語義合わせは第一訳に合わせる。
    const userTranslations = buildManualTranslations(input.translations ?? []);
    const japaneseInput = userTranslations.japanese;
    const userPos = input.partOfSpeech?.trim() ?? '';
    const userExample = input.exampleSentence?.trim() ?? '';

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
          includeExample: manualWordExampleEnabled,
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

    if (!japanese) return 'no_japanese';

    // 入力された複数訳、または補完された全訳を訳ごとの WordTranslation レコードに展開する
    const aiTranslations: WordTranslation[] | undefined = enrichedTranslationTexts.length > 0
      ? enrichedTranslationTexts.map((text, index) => ({
          translationJa: text,
          normalizedTranslationJa: text,
          source: 'ai' as const,
          meaningRank: index + 1,
          position: index,
          isPrimary: index === 0,
        }))
      : undefined;
    const enrichedTranslations = userTranslations.translations ?? aiTranslations;
    // japaneseSource: 'ai' は AI 補完の訳だけに付ける (ユーザーが入力した訳には付けない)
    const translationsFromAi = !userTranslations.translations && Boolean(aiTranslations);

    const optimisticWord: Word = {
      id: crypto.randomUUID(),
      projectId,
      english,
      japanese,
      ...(enrichedTranslations ? { translations: enrichedTranslations } : {}),
      ...(translationsFromAi ? { japaneseSource: 'ai' as const } : {}),
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      pronunciation: enrichedPronunciation || undefined,
      partOfSpeechTags: enrichedPartOfSpeechTags.length > 0 ? enrichedPartOfSpeechTags : undefined,
      exampleSentence: enrichedExampleSentence || undefined,
      exampleSentenceJa: enrichedExampleSentenceJa || undefined,
      morphology: enrichedMorphology,
      ...(sectionName ? { sectionName } : {}),
      status: 'new',
      createdAt: new Date().toISOString(),
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
      isFavorite: false,
    };

    setWords((prev) => [optimisticWord, ...prev]);
    refreshWordCount();

    mutationRepository
      .createWords([
        {
          projectId,
          english,
          japanese,
          ...(enrichedTranslations ? { translations: enrichedTranslations } : {}),
          ...(translationsFromAi ? { japaneseSource: 'ai' as const } : {}),
          distractors: ['選択肢1', '選択肢2', '選択肢3'],
          ...(enrichedPronunciation ? { pronunciation: enrichedPronunciation } : {}),
          ...(enrichedPartOfSpeechTags.length > 0 ? { partOfSpeechTags: enrichedPartOfSpeechTags } : {}),
          ...(enrichedExampleSentence ? { exampleSentence: enrichedExampleSentence } : {}),
          ...(enrichedExampleSentenceJa ? { exampleSentenceJa: enrichedExampleSentenceJa } : {}),
          ...(enrichedMorphology ? { morphology: enrichedMorphology } : {}),
          ...(sectionName ? { sectionName } : {}),
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
        showToast({ message: `「${english}」の保存に失敗しました`, type: 'error' });
        refreshWordCount();
      });

    return 'added';
  };

  const handleSaveManualWord = async () => {
    const english = manualWordEnglish.trim();
    if (!english || !project) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    setManualWordSaving(true);
    setManualWordSavingMessage('情報を生成中...');

    const outcome = await addEnrichedManualWord({
      english,
      translations: manualWordTranslations,
      partOfSpeech: manualWordPartOfSpeech,
      exampleSentence: manualWordExampleSentence,
      sectionName: manualWordSectionName,
    });

    // 日本語訳が入力されず自動補完もできなかった場合だけ入力をお願いする
    // （意味が空の単語はクイズ・カードで使いものにならないため保存しない）。
    if (outcome === 'no_japanese') {
      setManualWordSaving(false);
      setManualWordSavingMessage(undefined);
      showToast({ message: '日本語訳を自動生成できませんでした。日本語訳を入力してください', type: 'error' });
      return;
    }

    // Keep the modal open so several words can be entered in a row
    // (scan-like batch entry); the modal shows a running count and the
    // summary toast fires when the user closes it.
    resetManualWordForm();
    setManualWordAddedCount((count) => count + 1);
    setManualWordSaving(false);
    setManualWordSavingMessage(undefined);
  };

  /**
   * 音声で聞き取った語をまとめて追加する。
   *
   * 1語ずつ enrich-manual を呼ぶので、数語ずつ並べて待ち時間を縮める。
   * 一度に全部投げると、語源解析 (コイン消費) や AI の上限に一斉に当たる。
   */
  const handleAddVoiceWords = async (entries: string[]) => {
    const targets = entries.map((entry) => entry.trim()).filter(Boolean);
    if (!project || targets.length === 0) return;

    const { canAdd, wouldExceed } = canAddWords(targets.length);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    setVoiceWordAdding(true);
    // 音声で追加した語は、開いたときに見ていたセクションに入れる
    const voiceSectionName = currentSectionName;
    let done = 0;
    let added = 0;
    const failed: string[] = [];
    setVoiceWordAddingMessage(`追加中 0/${targets.length}`);

    const queue = [...targets];
    const worker = async () => {
      for (let english = queue.shift(); english !== undefined; english = queue.shift()) {
        const outcome = await addEnrichedManualWord({ english, sectionName: voiceSectionName });
        if (outcome === 'added') added += 1;
        else failed.push(english);
        done += 1;
        setVoiceWordAddingMessage(`追加中 ${done}/${targets.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(VOICE_ADD_CONCURRENCY, targets.length) }, worker));

    setVoiceWordAdding(false);
    setVoiceWordAddingMessage(undefined);
    setShowVoiceWordModal(false);

    if (added > 0) {
      showToast({ message: `${added}語を追加しました`, type: 'success' });
    }
    if (failed.length > 0) {
      showToast({
        message: `${failed.length}語は日本語訳を補完できず追加できませんでした（${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ' ほか' : ''}）`,
        type: 'error',
      });
    }
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
  const sectionNav: ProjectSectionNav = {
    visible: wordsLoaded && (filteredWords.length > 0 || sectionNames.length > 0),
    label: currentSectionLabel,
    words: sectionWords,
    atStart: sectionIndex === 0,
    atEnd: sectionIndex >= sectionGroups.length - 1,
    disabled: searching,
    onPrev: () => setSectionIndex(Math.max(0, sectionIndex - 1)),
    onNext: () => setSectionIndex(Math.min(sectionGroups.length - 1, sectionIndex + 1)),
    onCreateStart: () => setCreateSectionPosition('start'),
    onCreateEnd: () => setCreateSectionPosition('end'),
  };

  return (
    <>
      <DesktopProjectDetailView
        project={project}
        projectId={projectId}
        words={words}
        filteredWords={filteredWords}
        sectionNav={sectionNav}
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
        onSetBinder={() => void handleOpenBinderPicker()}
        onDeleteProject={() => setDeleteModalOpen(true)}
        onShare={handleOpenShareSheet}
        onToggleFavorite={(word) => void handleToggleFavorite(word)}
        onCycleStatus={(word, newStatus) => handleCycleStatus(word.id, newStatus)}
        onCycleVocabularyType={(word) => void handleCycleVocabularyType(word)}
        onDeleteWord={handleOpenDeleteWord}
        onScan={() => setShowScanCaptureModal(true)}
        onManualAdd={openManualWordModal}
        onVoiceAdd={voiceAddAvailable ? openVoiceWordModal : undefined}
      />
      {/* タブレット (iPad): 一覧 | 詳細 のマスター・ディテール。JS でだけマウントする (TabletOnly) */}
      <TabletOnly>
        <TabletProjectDetailView
          project={project}
          projectId={projectId}
          words={words}
          filteredWords={filteredWords}
          sectionNav={sectionNav}
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
          onSetBinder={() => void handleOpenBinderPicker()}
          onDeleteProject={() => setDeleteModalOpen(true)}
          onShare={handleOpenShareSheet}
          onToggleFavorite={(word) => void handleToggleFavorite(word)}
          onCycleStatus={(word, newStatus) => handleCycleStatus(word.id, newStatus)}
          onCycleVocabularyType={(word) => void handleCycleVocabularyType(word)}
          onDeleteWord={handleOpenDeleteWord}
          onScan={() => setShowScanCaptureModal(true)}
          onManualAdd={openManualWordModal}
          onVoiceAdd={voiceAddAvailable ? openVoiceWordModal : undefined}
          onWordUpdated={(updated) => setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))}
        />
      </TabletOnly>
      <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] font-[var(--font-body)] desktop:hidden tablet:hidden">
      {/* スクロールしても上部に固定されるヘッダー（グループページと同じパターン）。
          top はノッチ下端に合わせ、ノッチ帯は全体共通の StatusBarCover が覆う。
          下線はコンテンツがヘッダの下に潜り込んだとき（スクロール中）だけ出す。 */}
      <header
        className={`sticky z-40 flex items-center gap-2.5 border-b-2 bg-[var(--color-background)]/95 px-[14px] py-2.5 backdrop-blur-md desktop:hidden ${pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'}`}
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
            className="fixed z-[60] w-[170px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] desktop:hidden"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 62px)', right: 14 }}
          >
            <MenuButton icon="edit" label="名称変更" onClick={handleOpenRename} />
            <MenuButton icon="folder" label="バインダー設定" onClick={() => void handleOpenBinderPicker()} />
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

      <div className="flex items-start gap-3.5 px-5 pb-2.5 pt-[18px] desktop:pt-8">
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
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/quiz/${projectId}`}
            data-tour="project-quiz"
            onClick={() => { if (tutorialStage === 'open-quiz') advanceTutorialAndLeave('awaiting-quiz'); }}
            className="relative flex h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)] text-[13px] font-bold text-[var(--color-on-accent)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="check" size={14} />
            クイズを始める
          </Link>
        </div>
        <div className="relative h-[44px] flex-1">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/flashcard/${projectId}`}
            aria-label="カード"
            data-tour="project-flashcard"
            onClick={() => { if (tutorialStage === 'open-flashcard') advanceTutorialAndLeave('view-cards'); }}
            className="relative flex h-full w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[13px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="style" size={18} />
            カード
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
            className="relative flex h-full w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
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
                className="absolute right-0 top-[52px] z-30 w-[180px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]"
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
                {voiceAddAvailable && (
                  <MenuButton
                    icon="mic"
                    label="音声で追加"
                    onClick={() => {
                      setAddMenuOpen(false);
                      openVoiceWordModal();
                    }}
                  />
                )}
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
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-[7px] text-[var(--color-muted)]"
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
              ? 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
              : 'bg-[var(--color-surface)] text-[var(--solid-ink)]'
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
              ? 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
              : 'bg-[var(--color-surface)] text-[var(--solid-ink)]'
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
              ? 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
              : 'bg-[var(--color-surface)] text-[var(--solid-ink)]'
          }`}
        >
          <Icon name="check_box" size={15} />
        </button>
      </div>
      )}

      <div className={`flex flex-col px-4 ${selectMode ? 'pb-[160px]' : showWordToolbar ? 'pb-[104px]' : 'pb-[max(24px,env(safe-area-inset-bottom))]'}`}>
        {!wordsLoaded ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">単語を読み込み中...</span>
          </div>
        ) : sectionWords.length === 0 ? (
          counts.total === 0 && sectionNames.length === 0 ? (
            <EmptyWordbookState
              isPro={isPro}
              onScan={() => setShowScanCaptureModal(true)}
              onManualAdd={openManualWordModal}
              onVoiceAdd={voiceAddAvailable ? openVoiceWordModal : undefined}
            />
          ) : (
            <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
              {query
                ? '一致する単語がありません'
                : filteredWords.length > 0 || wordFilterActive
                  ? '条件に一致する単語がありません'
                  : 'このセクションには単語がありません'}
              {!query && !wordFilterActive && (
                <button
                  type="button"
                  onClick={openManualWordModal}
                  className="mx-auto mt-3 flex items-center gap-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-bold text-[var(--solid-ink)]"
                >
                  <Icon name="add" size={14} />
                  単語を追加
                </button>
              )}
            </div>
          )
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {sectionWords.map((word, index) => {
              const selected = selectedWordIds.has(word.id);
              return (
              <WordRow
                key={word.id}
                word={word}
                selectMode={selectMode}
                selected={selected}
                hideMeaning={redSheet}
                hideEnglish={englishRedSheet}
                splitMeaning
                tourAnchor={index === 0 && sectionIndex === 0}
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

      {/* モバイル: セクション名 / 赤シート (左=英語・右=訳) / セクション送りの下部固定バー。
          左右の矢印でセクションを送り、端まで来たら矢印が「＋」になってセクションを足せる
          (検索中は単語帳全体を1つに出すので送らない) */}
      {showWordToolbar && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[var(--solid-ink)] bg-[var(--color-background)]/95 backdrop-blur-md desktop:hidden"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          {/* 名前はバーの中央に固定する。左右を flex-1 で等分し、その間に置くので、
              左右に赤シートが並んでも表示位置は動かない */}
          <div className="mx-auto flex w-full max-w-[560px] items-center gap-2.5 px-[18px] pt-3">
            <div className="flex flex-1 items-center justify-start gap-2.5">
              <SectionStepButton
                direction="prev"
                atEdge={sectionIndex === 0}
                disabled={searching}
                onStep={() => setSectionIndex(sectionIndex - 1)}
                onCreate={() => setCreateSectionPosition('start')}
              />
              {/* 英語側の赤シート。一覧の左カラム (英語) を隠すので、バーでも左に置く */}
              <RedSheetToggle
                on={englishRedSheet}
                onToggle={() => setEnglishRedSheet((on) => !on)}
                label={englishRedSheet ? '英語の赤シートを外す' : '赤シートで英語を隠す'}
              />
            </div>
            <div className="flex min-w-0 max-w-[40%] shrink flex-col items-center text-center">
              {currentSectionLabel && (
                <span className="max-w-full truncate font-display text-[13px] font-extrabold leading-tight text-[var(--solid-ink)]">
                  {currentSectionLabel}
                </span>
              )}
              <span
                className={`whitespace-nowrap font-mono font-bold tabular-nums ${
                  currentSectionLabel ? 'text-[10px] text-[var(--color-muted)]' : 'text-[12px] text-[var(--solid-ink)]'
                }`}
              >
                {sectionWords.length}語
              </span>
            </div>
            <div className="flex flex-1 items-center justify-end gap-2.5">
              {/* 訳側の赤シート。オンの間は一覧の訳が赤いベタで隠れる */}
              <RedSheetToggle
                on={redSheet}
                onToggle={() => setRedSheet((on) => !on)}
                label={redSheet ? '訳の赤シートを外す' : '赤シートで訳を隠す'}
              />
              <SectionStepButton
                direction="next"
                atEdge={sectionIndex >= sectionGroups.length - 1}
                disabled={searching}
                onStep={() => setSectionIndex(sectionIndex + 1)}
                onCreate={() => setCreateSectionPosition('end')}
              />
            </div>
          </div>
        </div>
      )}

      {selectedWord && (
        <WordDetailOverlay
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onWordUpdated={(updated) => {
            setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
            setSelectedWord(updated);
          }}
          onDelete={handleOpenDeleteWord}
        />
      )}

      </div>

      {/* Shared overlays: rendered outside the desktop:hidden wrapper so the
          desktop view's filter / sort / select / add buttons can use them too */}
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
      />

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
        translations={manualWordTranslations}
        partOfSpeech={manualWordPartOfSpeech}
        exampleSentence={manualWordExampleSentence}
        morphologyEnabled={manualWordMorphologyEnabled}
        exampleEnabled={manualWordExampleEnabled}
        setExampleEnabled={handleManualWordExampleChange}
        onEnglishChange={setManualWordEnglish}
        onTranslationsChange={setManualWordTranslations}
        onPartOfSpeechChange={setManualWordPartOfSpeech}
        onExampleSentenceChange={setManualWordExampleSentence}
        onMorphologyEnabledChange={handleManualWordMorphologyChange}
        sectionNames={sectionNames}
        sectionName={manualWordSectionName}
        onSectionNameChange={setManualWordSectionName}
        onCreateSection={(name) => handleCreateSection(name)}
        onCancel={closeManualWordModal}
        onConfirm={handleSaveManualWord}
      />

      {showVoiceWordModal && (
        <VoiceWordModal
          adding={voiceWordAdding}
          addingMessage={voiceWordAddingMessage}
          existingEnglish={existingEnglishSet}
          morphologyEnabled={manualWordMorphologyEnabled}
          onMorphologyEnabledChange={handleManualWordMorphologyChange}
          onClose={() => setShowVoiceWordModal(false)}
          onAdd={handleAddVoiceWords}
        />
      )}

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
        onSortOrderChange={(next) => {
          // 並べ替えを選び直したときは、その時点の学習タグで並びを取り直す
          setWordOrderSnapshot(buildProjectWordOrderSnapshot(words));
          setWordSortOrder(next);
        }}
      />
      {/* バインダー (フォルダ) の設定。モバイル・デスクトップ共通のピッカー */}
      <BinderPickerSheet
        key={binderPickerOpen ? `binder-${project.binder ?? ''}` : 'binder-closed'}
        open={binderPickerOpen}
        onClose={() => setBinderPickerOpen(false)}
        project={project}
        binders={binderNames}
        onApply={(binder) => void handleApplyBinder(binder)}
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
          setSelectedWordIds(allFilteredWordsSelected ? new Set() : new Set(sectionWords.map((w) => w.id)));
        }}
        onBulkFavorite={() => void handleBulkToggleFavorite()}
        onBulkVocabularyType={(vocabularyType) => void handleBulkSetVocabularyType(vocabularyType)}
        onBulkImport={() => void handleOpenBulkImport()}
        onBulkSection={() => setMoveSectionModalOpen(true)}
        onBulkDelete={() => setBulkDeleteModalOpen(true)}
      />

      <MoveToSectionModal
        open={moveSectionModalOpen}
        count={selectedWordIds.size}
        sectionNames={sectionNames}
        initialSectionName={currentSectionName}
        loading={moveSectionLoading}
        onCancel={() => { if (!moveSectionLoading) setMoveSectionModalOpen(false); }}
        onCreateSection={(name) => handleCreateSection(name)}
        onConfirm={(name) => void handleConfirmMoveToSection(name)}
      />

      <CreateSectionModal
        open={createSectionPosition !== null}
        sectionNames={sectionNames}
        loading={createSectionLoading}
        onCancel={() => { if (!createSectionLoading) setCreateSectionPosition(null); }}
        onConfirm={(name) => void handleConfirmCreateSection(name)}
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
            <div className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">RENAME</div>
              <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">名称変更</h2>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirmRename(); }}
                autoFocus
                maxLength={60}
                className="mt-3 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  disabled={renameLoading}
                  className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmRename()}
                  disabled={renameLoading || !renameValue.trim()}
                  className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-[var(--color-on-ink)] disabled:opacity-50"
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
