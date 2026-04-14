'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { DeleteConfirmModal, Icon, Modal, type ProgressStep } from '@/components/ui';
import { WordLimitModal } from '@/components/limits';
import { ManualWordInputModal } from '@/components/home/ProjectModals';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { NotionCheckbox } from '@/components/home/WordList';
import { WordDetailView } from '@/components/word/WordDetailView';
import { getProjectColor } from '@/components/project/ProjectCard';
import { ProjectShareSheet } from '@/components/project/ProjectShareSheet';
import { WordFilterSheet, WordSortSheet } from '@/components/project/WordListSheets';
import { RichTextBlock } from '@/components/project/RichTextBlock';
import { BlockInserter } from '@/components/project/BlockInserter';
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
import type { CustomColumn, CustomColumnType, LexiconEntry, Project, ProjectBlock, ProjectBlockType, ProjectShareScope, RichTextBlockData, Word, WordStatus, SubscriptionStatus } from '@/types';
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

// Compare two word arrays by content (id-keyed) on the fields that affect
// list rendering. If equivalent, Phase 2's setWords can reuse the previous
// state reference and React will bail out of re-rendering, preventing the
// visible chirp when returning to the page with a warm home cache.
// Order-independent so cache order vs fetch order doesn't matter — the list
// is always sorted by filteredWords useMemo before display.
function areWordListsEquivalentForDisplay(a: Word[], b: Word[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const mapA = new Map<string, Word>();
  for (const w of a) mapA.set(w.id, w);
  for (const wb of b) {
    const wa = mapA.get(wb.id);
    if (!wa) return false;
    if (wa.status !== wb.status) return false;
    if (wa.isFavorite !== wb.isFavorite) return false;
    if (wa.vocabularyType !== wb.vocabularyType) return false;
    if (wa.english !== wb.english) return false;
    if (wa.japanese !== wb.japanese) return false;
    if (wa.createdAt !== wb.createdAt) return false;
    const pa = wa.partOfSpeechTags ?? [];
    const pb = wb.partOfSpeechTags ?? [];
    if (pa.length !== pb.length) return false;
    for (let j = 0; j < pa.length; j++) {
      if (pa[j] !== pb[j]) return false;
    }
  }
  return true;
}

// Format a custom column cell value for display in the word list table.
// Numbers and dates fall back to the raw string if they cannot be parsed
// (e.g. the user entered text in an older untyped column).
function formatCustomColumnValue(value: string, type: CustomColumnType): string {
  if (!value) return '';
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString('ja-JP') : value;
  }
  if (type === 'date') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  }
  return value;
}

// Avoid setProject re-render when the fetched project matches what we
// already have for display purposes.
function areProjectsEquivalentForDisplay(a: Project | null, b: Project | undefined | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aCols = a.customColumns ?? [];
  const bCols = b.customColumns ?? [];
  const columnsEqual =
    aCols.length === bCols.length &&
    aCols.every((col, i) => col.id === bCols[i].id && col.title === bCols[i].title);
  const aBlocks = a.blocks ?? [];
  const bBlocks = b.blocks ?? [];
  const blocksEqual =
    aBlocks.length === bBlocks.length &&
    aBlocks.every((block, i) => {
      const other = bBlocks[i];
      if (!other) return false;
      if (block.id !== other.id || block.type !== other.type || block.position !== other.position) {
        return false;
      }
      // Compare data by JSON equality — cheap for small rich-text blobs.
      return JSON.stringify(block.data) === JSON.stringify(other.data);
    });
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.iconImage === b.iconImage &&
    (a.description ?? '') === (b.description ?? '') &&
    (a.sourceLabels?.length ?? 0) === (b.sourceLabels?.length ?? 0) &&
    columnsEqual &&
    blocksEqual
  );
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

  // Scroll position restoration
  const scrollKey = `project-scroll-${projectId}`;
  const scrollRestoredRef = useRef(false);
  const hasSavedScroll = typeof window !== 'undefined' && !!sessionStorage.getItem(`project-scroll-${projectId}`);
  const [contentVisible, setContentVisible] = useState(!hasSavedScroll);

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

  const [showAddColumnSheet, setShowAddColumnSheet] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnType, setNewColumnType] = useState<CustomColumnType>('text');
  const [addColumnSaving, setAddColumnSaving] = useState(false);

  const [editingCell, setEditingCell] = useState<{ wordId: string; columnId: string } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');

  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  const [titleInlineEditing, setTitleInlineEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [showAddMethodSheet, setShowAddMethodSheet] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [openWordId, setOpenWordId] = useState<string | null>(null);

  const handleOpenWordModal = useCallback((wordId: string) => {
    setOpenWordId(wordId);
  }, []);

  const handleCloseWordModal = useCallback(() => {
    setOpenWordId(null);
  }, []);

  // Mirror updates from the modal back into the local list state so the row re-renders immediately.
  const handleWordUpdatedFromModal = useCallback((updated: Word) => {
    setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }, []);

  const [selectedScanMode, setSelectedScanMode] = useState<ExtractMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const scanCameraInputRef = useRef<HTMLInputElement>(null);
  const scanGalleryInputRef = useRef<HTMLInputElement>(null);
  const wordTableScrollRef = useRef<HTMLDivElement>(null);
  const [pendingScanSource, setPendingScanSource] = useState<'camera' | 'gallery'>('gallery');

  // Word list toolbar: search, filter, sort
  const [wordSearchText, setWordSearchText] = useState('');
  const [wordShowSearch, setWordShowSearch] = useState(false);
  const [wordSortOrder, setWordSortOrder] = useState<'createdAsc' | 'alphabetical' | 'statusAsc'>('createdAsc');
  const [wordFilterBookmark, setWordFilterBookmark] = useState(false);
  const [wordFilterActiveness, setWordFilterActiveness] = useState<'all' | 'active' | 'passive'>('all');
  const [wordFilterPos, setWordFilterPos] = useState<string | null>(null);
  const [wordShowFilterSheet, setWordShowFilterSheet] = useState(false);
  const [wordShowSortSheet, setWordShowSortSheet] = useState(false);

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

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
              setProject((prev) => areProjectsEquivalentForDisplay(prev, localProject) ? prev : localProject);
              setActiveRepository(localRepository);
              const localWords = await localRepository.getWords(projectId);
              setWords((prev) => areWordListsEquivalentForDisplay(prev, localWords) ? prev : localWords);
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
            setProject((prev) => areProjectsEquivalentForDisplay(prev, localProject) ? prev : localProject);
            setActiveRepository(localRepository);
            setLoading(false);
            showedLocalProject = true;
            void (async () => {
              try {
                const localWords = await localRepository.getWords(projectId);
                setWords((prev) => areWordListsEquivalentForDisplay(prev, localWords) ? prev : localWords);
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
          setProject((prev) => areProjectsEquivalentForDisplay(prev, remoteProject) ? prev : remoteProject ?? prev);
          setActiveRepository(remoteRepository);
          setLoading(false);
          void (async () => {
            try {
              const remoteWords = await remoteRepository.getWords(projectId);
              setWords((prev) => areWordListsEquivalentForDisplay(prev, remoteWords) ? prev : remoteWords);
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
            setProject((prev) => areProjectsEquivalentForDisplay(prev, fallback) ? prev : fallback);
            setActiveRepository(defaultRepository);
            setLoading(false);
            void (async () => {
              try {
                const fallbackWords = await defaultRepository.getWords(projectId);
                setWords((prev) => areWordListsEquivalentForDisplay(prev, fallbackWords) ? prev : fallbackWords);
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

  // Convert vertical mouse-wheel to horizontal scroll on the word table,
  // so desktop users can reveal long translations without shift+wheel.
  useEffect(() => {
    const el = wordTableScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY === 0) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wordsLoaded]);

  // Restore scroll position before paint, then reveal content
  useLayoutEffect(() => {
    if (!wordsLoaded || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      const y = parseInt(saved, 10);
      if (Number.isFinite(y) && y > 0) {
        window.scrollTo(0, y);
      }
    }
    setContentVisible(true);
  }, [wordsLoaded, scrollKey]);

  // Scan-to-add handlers
  const handleScanModeSelect = (mode: ExtractMode, eikenLevel: EikenLevel) => {
    if ((mode === 'circled' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      setShowScanModeModal(false);
      startTransition(() => { router.push('/subscription'); });
      return;
    }
    setSelectedScanMode(mode);
    setSelectedEikenLevel(eikenLevel);
    if (pendingScanSource === 'camera') {
      scanCameraInputRef.current?.click();
    } else {
      scanGalleryInputRef.current?.click();
    }
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

  const handleToggleSelectWord = (wordId: string) => {
    setSelectedWordIds(prev => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId); else next.add(wordId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedWordIds.size === filteredWords.length) {
      setSelectedWordIds(new Set());
    } else {
      setSelectedWordIds(new Set(filteredWords.map(w => w.id)));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedWordIds.size === 0) return;
    setBulkDeleteLoading(true);
    try {
      for (const id of selectedWordIds) {
        await mutationRepository.deleteWord(id);
      }
      setWords(prev => prev.filter(w => !selectedWordIds.has(w.id)));
      showToast({ message: `${selectedWordIds.size}語を削除しました`, type: 'success' });
      invalidateHomeCache();
      refreshWordCount();
      setSelectedWordIds(new Set());
      setSelectMode(false);
    } catch (error) {
      console.error('Failed to bulk delete:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setBulkDeleteLoading(false);
      setBulkDeleteModalOpen(false);
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

  const handleOpenAddColumnSheet = () => {
    setNewColumnTitle('');
    setNewColumnType('text');
    setShowAddColumnSheet(true);
  };

  const handleConfirmAddColumn = async () => {
    if (!project) return;
    const title = newColumnTitle.trim();
    if (!title) return;

    const newColumn: CustomColumn = {
      id: crypto.randomUUID(),
      title,
      type: newColumnType,
    };
    const nextColumns = [...(project.customColumns ?? []), newColumn];
    setAddColumnSaving(true);
    try {
      await mutationRepository.updateProject(project.id, { customColumns: nextColumns });
      setProject((prev) => (prev ? { ...prev, customColumns: nextColumns } : prev));
      showToast({ message: '列を追加しました', type: 'success' });
      setShowAddColumnSheet(false);
    } catch (error) {
      console.error('Failed to add custom column:', error);
      showToast({ message: '列の追加に失敗しました', type: 'error' });
    } finally {
      setAddColumnSaving(false);
    }
  };

  // ============ Project blocks (Notion-like) ============
  // Convention: blocks with position < WORDLIST_PIVOT render above the word
  // list section; blocks with position >= WORDLIST_PIVOT render below. This
  // lets us keep the existing word-list UI intact while still persisting
  // user-added blocks in a single ordered array.
  const WORDLIST_PIVOT = 1000;
  const [newlyAddedBlockId, setNewlyAddedBlockId] = useState<string | null>(null);

  const sortedBlocks = useMemo<ProjectBlock[]>(() => {
    const arr = project?.blocks ?? [];
    return [...arr].sort((a, b) => a.position - b.position);
  }, [project?.blocks]);

  const blocksAbove = useMemo(
    () => sortedBlocks.filter((b) => b.position < WORDLIST_PIVOT),
    [sortedBlocks],
  );
  const blocksBelow = useMemo(
    () => sortedBlocks.filter((b) => b.position >= WORDLIST_PIVOT),
    [sortedBlocks],
  );

  const persistBlocks = useCallback(
    async (nextBlocks: ProjectBlock[]) => {
      if (!project) return;
      try {
        await mutationRepository.updateProject(project.id, { blocks: nextBlocks });
        setProject((prev) => (prev ? { ...prev, blocks: nextBlocks } : prev));
      } catch (error) {
        console.error('Failed to persist project blocks:', error);
        showToast({ message: 'ブロックの保存に失敗しました', type: 'error' });
      }
    },
    [project, mutationRepository, showToast],
  );

  const handleInsertBlock = useCallback(
    (type: ProjectBlockType, location: 'above' | 'below', anchorIndex?: number) => {
      if (!project) return;
      if (type !== 'richText') return; // database block is disabled in Phase 1
      const newBlock: ProjectBlock = {
        id: crypto.randomUUID(),
        type,
        position: 0, // assigned below
        data: { html: '' } as RichTextBlockData,
      };

      const current = [...sortedBlocks];
      let insertionPos: number;
      if (location === 'above') {
        // anchorIndex is the index in blocksAbove after which to insert;
        // -1 means insert at the very top.
        const aboveArr = blocksAbove;
        const beforePos =
          anchorIndex !== undefined && anchorIndex >= 0 ? aboveArr[anchorIndex]?.position ?? 0 : -1000;
        const afterPos =
          anchorIndex !== undefined && anchorIndex + 1 < aboveArr.length
            ? aboveArr[anchorIndex + 1].position
            : WORDLIST_PIVOT;
        insertionPos = (beforePos + afterPos) / 2;
      } else {
        const belowArr = blocksBelow;
        const beforePos =
          anchorIndex !== undefined && anchorIndex >= 0
            ? belowArr[anchorIndex]?.position ?? WORDLIST_PIVOT
            : WORDLIST_PIVOT;
        const afterPos =
          anchorIndex !== undefined && anchorIndex + 1 < belowArr.length
            ? belowArr[anchorIndex + 1].position
            : WORDLIST_PIVOT + 1000;
        insertionPos = (beforePos + afterPos) / 2;
      }
      newBlock.position = insertionPos;
      const next = [...current, newBlock].sort((a, b) => a.position - b.position);
      setNewlyAddedBlockId(newBlock.id);
      void persistBlocks(next);
    },
    [project, sortedBlocks, blocksAbove, blocksBelow, persistBlocks],
  );

  const handleUpdateBlockHtml = useCallback(
    (blockId: string, html: string) => {
      if (!project) return;
      const next = sortedBlocks.map((b) =>
        b.id === blockId ? { ...b, data: { ...b.data, html } as RichTextBlockData } : b,
      );
      void persistBlocks(next);
    },
    [project, sortedBlocks, persistBlocks],
  );

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      if (!project) return;
      const next = sortedBlocks.filter((b) => b.id !== blockId);
      void persistBlocks(next);
    },
    [project, sortedBlocks, persistBlocks],
  );

  const handleStartCellEdit = (wordId: string, columnId: string, currentRawValue: string) => {
    setEditingCell({ wordId, columnId });
    setEditingCellValue(currentRawValue);
  };

  const handleCancelCellEdit = () => {
    setEditingCell(null);
    setEditingCellValue('');
  };

  const handleSaveCellEdit = async () => {
    if (!editingCell || !project) return;
    const { wordId, columnId } = editingCell;
    const word = words.find((w) => w.id === wordId);
    const col = project.customColumns?.find((c) => c.id === columnId);
    if (!word || !col) {
      setEditingCell(null);
      return;
    }

    const value = editingCellValue;
    const existing = word.customSections ?? [];
    const idx = existing.findIndex((s) => s.id === columnId);
    let nextSections;
    if (idx >= 0) {
      nextSections = existing.map((s) =>
        s.id === columnId ? { ...s, content: value, title: col.title } : s,
      );
    } else {
      nextSections = [...existing, { id: columnId, title: col.title, content: value }];
    }

    // No-op short-circuit
    if (idx >= 0 && existing[idx].content === value && existing[idx].title === col.title) {
      setEditingCell(null);
      setEditingCellValue('');
      return;
    }

    const previousWord = word;
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, customSections: nextSections } : w)));
    setEditingCell(null);
    setEditingCellValue('');

    try {
      await mutationRepository.updateWord(wordId, { customSections: nextSections });
      invalidateHomeCache();
    } catch (error) {
      console.error('Failed to save cell:', error);
      showToast({ message: 'セルの保存に失敗しました', type: 'error' });
      setWords((prev) => prev.map((w) => (w.id === wordId ? previousWord : w)));
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

  const beginTitleEdit = () => {
    if (!project) return;
    setTitleDraft(project.title);
    setTitleInlineEditing(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const commitInlineTitle = async () => {
    if (!project) {
      setTitleInlineEditing(false);
      return;
    }
    const trimmed = titleDraft.trim();
    setTitleInlineEditing(false);
    if (!trimmed || trimmed === project.title) return;
    try {
      await mutationRepository.updateProject(project.id, { title: trimmed });
      setProject((prev) => (prev ? { ...prev, title: trimmed } : prev));
      invalidateHomeCache();
    } catch (error) {
      console.error('Failed to update project name:', error);
      showToast({ message: '名前の変更に失敗しました', type: 'error' });
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
      result = result.filter((w) => w.vocabularyType === 'active');
    } else if (wordFilterActiveness === 'passive') {
      result = result.filter((w) => w.vocabularyType === 'passive');
    }

    if (wordSortOrder === 'alphabetical') {
      result = [...result].sort((a, b) => a.english.localeCompare(b.english, undefined, { sensitivity: 'base' }));
    } else if (wordSortOrder === 'statusAsc') {
      const statusOrder: Record<string, number> = { new: 0, review: 1, mastered: 2 };
      result = [...result].sort((a, b) => (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0));
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
  const headerBackground = headerFrom;
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
      <div className="min-h-screen bg-[var(--color-background)] pb-28 lg:pb-[calc(20vh+5rem)]" style={contentVisible ? undefined : { visibility: 'hidden' }}>
        <div
          className="project-detail-header-safe-top z-[50] sticky top-0"
          style={{ background: headerBackground }}
        >
          <div
            className="max-w-lg lg:max-w-xl mx-auto px-5 py-1.5"
          >
            <div className="flex items-center justify-between min-h-[44px]">
              <button
                type="button"
                onClick={() => startTransition(() => router.push('/'))}
                className="w-10 h-10 flex items-center justify-center"
                aria-label="ホームへ戻る"
              >
                <Icon name="chevron_left" size={24} className="text-white" />
              </button>
              <div className="flex items-center gap-1">
                {isPro && (
                  <button
                    type="button"
                    onClick={handleOpenShareSheet}
                    className="w-10 h-10 flex items-center justify-center"
                    aria-label="共有"
                  >
                    <Icon name="ios_share" size={20} className="text-white" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteProjectModalOpen(true)}
                  className="w-10 h-10 flex items-center justify-center"
                  aria-label="メニュー"
                >
                  <Icon name="more_horiz" size={22} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-lg lg:max-w-3xl xl:max-w-5xl mx-auto px-5 pt-4 lg:px-6 lg:-mt-2 space-y-5">
          {/* Title + description (Notion-style, inline-editable) */}
          <section className="mb-3">
            <div className="flex items-center gap-2">
              {titleInlineEditing ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitInlineTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setTitleInlineEditing(false);
                    }
                  }}
                  maxLength={50}
                  className="flex-1 text-2xl font-bold text-[var(--color-foreground)] leading-tight bg-transparent border-0 border-b border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none px-0 py-0"
                />
              ) : (
                <h1
                  onClick={beginTitleEdit}
                  className="flex-1 text-2xl font-bold text-[var(--color-foreground)] leading-tight break-words cursor-text"
                >
                  {project.title}
                </h1>
              )}
              <button
                type="button"
                onClick={beginTitleEdit}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-muted)] hover:bg-[var(--color-surface)] transition-colors"
                aria-label="単語帳名を編集"
              >
                <Icon name="edit" size={18} />
              </button>
            </div>
          </section>

          {/* User blocks rendered above the word list (Notion-like).
              Inserters adjacent to surrounding widgets (title above, stats
              card below) are hidden; only between-block inserters remain. */}
          {blocksAbove.length > 0 && (
            <section className="space-y-1">
              {blocksAbove.map((block, idx) => (
                <div key={block.id}>
                  {block.type === 'richText' && (
                    <RichTextBlock
                      block={block}
                      autoFocus={newlyAddedBlockId === block.id}
                      onChange={(html) => handleUpdateBlockHtml(block.id, html)}
                      onDelete={() => handleDeleteBlock(block.id)}
                    />
                  )}
                  {idx < blocksAbove.length - 1 && (
                    <BlockInserter
                      onInsert={(type) => handleInsertBlock(type, 'above', idx)}
                    />
                  )}
                </div>
              ))}
            </section>
          )}

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
                      ? 'bg-[var(--color-primary)]/12 border-[var(--color-primary)]/35 text-[var(--color-primary)]'
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
                      ? 'bg-[var(--color-primary)]/12 border-[var(--color-primary)]/35 text-[var(--color-primary)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label="フィルタ"
                >
                  <Icon name="filter_list" size={18} />
                </button>
                {/* Sort */}
                <button
                  type="button"
                  onClick={() => setWordShowSortSheet(true)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    wordSortOrder !== 'createdAsc'
                      ? 'bg-[var(--color-primary)]/12 border-[var(--color-primary)]/35 text-[var(--color-primary)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label={`並べ替え: ${wordSortOrder === 'createdAsc' ? '追加順' : wordSortOrder === 'alphabetical' ? 'アルファベット' : '未習得順'}`}
                  title={wordSortOrder === 'createdAsc' ? '追加順' : wordSortOrder === 'alphabetical' ? 'アルファベット' : '未習得順'}
                >
                  <Icon name="swap_vert" size={18} />
                </button>
                {/* Select mode */}
                <button
                  type="button"
                  onClick={() => { setSelectMode(v => !v); setSelectedWordIds(new Set()); }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    selectMode
                      ? 'bg-[var(--color-primary)]/12 border-[var(--color-primary)]/35 text-[var(--color-primary)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border-light)] text-[var(--color-muted)]'
                  }`}
                  aria-label="選択"
                >
                  <Icon name="check_box" size={18} />
                </button>
                {/* Filter badge */}
                {(wordFilterActive || wordSearchText) && (
                  <span className="text-xs font-medium tabular-nums text-[var(--color-primary)]">
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

            {/* Filter bottom sheet */}
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
              onReset={() => {
                setWordFilterBookmark(false);
                setWordFilterActiveness('all');
                setWordFilterPos(null);
              }}
            />

            {/* Sort bottom sheet */}
            <WordSortSheet
              open={wordShowSortSheet}
              onClose={() => setWordShowSortSheet(false)}
              sortOrder={wordSortOrder}
              onSortOrderChange={setWordSortOrder}
            />

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
              <div
                ref={wordTableScrollRef}
                className="overflow-x-auto overflow-y-hidden"
                style={{ scrollbarWidth: 'thin' }}
              >
                <table className="border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-sm text-[var(--color-muted)]">
                      {selectMode && (
                        <th className="w-8 py-1 text-center">
                          <button type="button" onClick={handleSelectAll} className="inline-flex items-center justify-center">
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded border-2 text-xs ${
                              selectedWordIds.size === filteredWords.length && filteredWords.length > 0
                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-background)]'
                                : 'border-[var(--color-border)] bg-transparent'
                            }`}>
                              {selectedWordIds.size === filteredWords.length && filteredWords.length > 0 && <Icon name="check" size={14} />}
                            </span>
                          </button>
                        </th>
                      )}
                      <th className="w-5 py-1" />
                      <th className="px-2 py-1 text-left font-semibold text-[var(--color-foreground)]">単語</th>
                      <th className="w-10 px-1 py-1 text-center font-semibold text-[var(--color-foreground)]">A/P</th>
                      <th className="w-10 px-1 py-1 text-center font-semibold text-[var(--color-foreground)]">品詞</th>
                      <th className="px-2 py-1 text-left font-semibold text-[var(--color-foreground)] whitespace-nowrap">訳</th>
                      {(project?.customColumns ?? []).map((col) => (
                        <th
                          key={col.id}
                          className="px-2 py-1 text-left font-semibold text-[var(--color-foreground)] whitespace-nowrap"
                        >
                          {col.title}
                        </th>
                      ))}
                      <th className="px-2 py-1 text-left">
                        <button
                          type="button"
                          onClick={handleOpenAddColumnSheet}
                          aria-label="プロパティを追加"
                          className="inline-flex items-center gap-1 text-xs font-normal text-[var(--color-muted)] hover:text-[var(--color-foreground)] whitespace-nowrap"
                        >
                          <Icon name="add" size={14} />
                          <span>プロパティ</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-light)]">
                    {filteredWords.map((word) => (
                      <tr
                        key={word.id}
                        role={selectMode ? undefined : 'link'}
                        tabIndex={0}
                        onClick={() => {
                          if (editingCell?.wordId === word.id) return;
                          if (selectMode) {
                            handleToggleSelectWord(word.id);
                          } else {
                            handleOpenWordModal(word.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (editingCell?.wordId === word.id) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (selectMode) {
                              handleToggleSelectWord(word.id);
                            } else {
                              handleOpenWordModal(word.id);
                            }
                          }
                        }}
                        className={`cursor-pointer transition-colors active:bg-[var(--color-surface-secondary)] ${selectMode && selectedWordIds.has(word.id) ? 'bg-[var(--color-primary)]/5' : ''}`}
                      >
                        {selectMode && (
                          <td className="w-8 pl-2 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded border-2 text-xs ${
                              selectedWordIds.has(word.id)
                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-background)]'
                                : 'border-[var(--color-border)] bg-transparent'
                            }`}>
                              {selectedWordIds.has(word.id) && <Icon name="check" size={14} />}
                            </span>
                          </td>
                        )}
                        <td className="w-5 pl-1 py-2.5">
                          <NotionCheckbox
                            wordId={word.id}
                            status={word.status}
                            onStatusChange={(newStatus) => { void handleCycleStatus(word.id, newStatus); }}
                          />
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-base font-bold text-[var(--color-foreground)]">{word.english}</span>
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
                        <td className="px-2 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap" title={word.japanese}>
                          {word.japanese}
                        </td>
                        {(project?.customColumns ?? []).map((col) => {
                          const rawValue = word.customSections?.find((s) => s.id === col.id)?.content ?? '';
                          const isEditing = editingCell?.wordId === word.id && editingCell?.columnId === col.id;
                          const display = formatCustomColumnValue(rawValue, col.type);

                          if (isEditing) {
                            const inputType = col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text';
                            return (
                              <td
                                key={col.id}
                                className="px-2 py-1 max-w-[200px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type={inputType}
                                  inputMode={col.type === 'number' ? 'decimal' : undefined}
                                  autoFocus
                                  value={editingCellValue}
                                  onChange={(e) => setEditingCellValue(e.target.value)}
                                  onBlur={() => { void handleSaveCellEdit(); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      e.preventDefault();
                                      void handleSaveCellEdit();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      handleCancelCellEdit();
                                    }
                                  }}
                                  className="w-full px-2 py-1 text-xs text-[var(--color-foreground)] bg-[var(--color-surface)] border border-[var(--color-primary)] rounded outline-none"
                                />
                              </td>
                            );
                          }

                          return (
                            <td
                              key={col.id}
                              className="px-2 py-2.5 text-xs text-[var(--color-muted)] whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis cursor-text hover:bg-[var(--color-surface-secondary)]"
                              title={display || rawValue}
                              onClick={(e) => {
                                if (selectMode) return;
                                e.stopPropagation();
                                handleStartCellEdit(word.id, col.id, rawValue);
                              }}
                            >
                              {display || '—'}
                            </td>
                          );
                        })}
                        <td className="w-10 px-1 py-2.5" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* User blocks rendered below the word list (Notion-like).
              The inserter directly below the word list (adjacent to a widget)
              is hidden. Between-block inserters and the final page-bottom
              inserter remain visible. When empty, a single page-bottom
              inserter is rendered with extra top margin so it is not flush
              against the word list. */}
          <section className="space-y-1">
            {blocksBelow.length === 0 ? (
              <div className="mt-16">
                <BlockInserter
                  onInsert={(type) => handleInsertBlock(type, 'below', -1)}
                />
              </div>
            ) : (
              blocksBelow.map((block, idx) => (
                <div key={block.id}>
                  {block.type === 'richText' && (
                    <RichTextBlock
                      block={block}
                      autoFocus={newlyAddedBlockId === block.id}
                      onChange={(html) => handleUpdateBlockHtml(block.id, html)}
                      onDelete={() => handleDeleteBlock(block.id)}
                    />
                  )}
                  <BlockInserter
                    onInsert={(type) => handleInsertBlock(type, 'below', idx)}
                  />
                </div>
              ))
            )}
          </section>
        </main>

        {/* Bottom action bar */}
        {words.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-3 z-40 lg:ml-[280px]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))', visibility: 'visible' }}>
            <div className="max-w-lg mx-auto flex items-center gap-3">
              {selectMode ? (
                <>
                  <button
                    onClick={() => { setSelectMode(false); setSelectedWordIds(new Set()); }}
                    className="px-4 py-3 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-muted)]"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => setBulkDeleteModalOpen(true)}
                    disabled={selectedWordIds.size === 0}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-error)] text-white font-semibold text-sm disabled:opacity-50"
                  >
                    <Icon name="delete" size={18} />
                    {selectedWordIds.size > 0 ? `${selectedWordIds.size}語を削除` : '削除'}
                  </button>
                </>
              ) : (
                <>
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
                    onClick={() => setShowAddMethodSheet(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm"
                  >
                    <Icon name="add" size={18} />
                    単語追加
                  </button>
                </>
              )}
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
        isOpen={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title={`${selectedWordIds.size}語を削除`}
        message={`選択した${selectedWordIds.size}語を削除します。この操作は取り消せません。`}
        isLoading={bulkDeleteLoading}
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

      {/* Add method action sheet */}
      {showAddMethodSheet && (
        <div className="fixed inset-0 z-50 lg:flex lg:items-center lg:justify-center lg:pl-[280px]" onClick={() => setShowAddMethodSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--color-surface)] rounded-t-2xl p-5 lg:ml-[280px] lg:static lg:left-auto lg:right-auto lg:bottom-auto lg:ml-0 lg:max-w-md lg:rounded-2xl lg:shadow-2xl lg:border lg:border-[var(--color-border)]"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="max-w-lg mx-auto">
              <div className="w-10 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-5 lg:hidden" />
              <p className="text-base font-bold text-[var(--color-foreground)] mb-4">単語を追加</p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setShowAddMethodSheet(false);
                    if (!canAddWords(1)) { setShowWordLimitModal(true); return; }
                    setPendingScanSource('camera');
                    setShowScanModeModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity"
                >
                  <Icon name="photo_camera" size={20} />
                  カメラで撮影
                </button>
                <button
                  onClick={() => {
                    setShowAddMethodSheet(false);
                    if (!canAddWords(1)) { setShowWordLimitModal(true); return; }
                    setPendingScanSource('gallery');
                    setShowScanModeModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity"
                >
                  <Icon name="photo_library" size={20} />
                  画像を選択
                </button>
                <button
                  onClick={() => {
                    setShowAddMethodSheet(false);
                    if (!canAddWords(1)) { setShowWordLimitModal(true); return; }
                    setShowManualWordModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] font-semibold text-sm hover:opacity-80 transition-opacity"
                >
                  <Icon name="edit" size={20} />
                  手動で追加
                </button>
              </div>
              <button
                onClick={() => setShowAddMethodSheet(false)}
                className="w-full mt-3 py-3 rounded-xl text-[var(--color-muted)] font-semibold text-sm hover:bg-[var(--color-surface-secondary)] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add custom column bottom sheet */}
      {showAddColumnSheet && (
        <div className="fixed inset-0 z-50 lg:flex lg:items-center lg:justify-center lg:pl-[280px]" onClick={() => !addColumnSaving && setShowAddColumnSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--color-surface)] rounded-t-2xl p-5 lg:ml-[280px] lg:static lg:left-auto lg:right-auto lg:bottom-auto lg:ml-0 lg:max-w-md lg:rounded-2xl lg:shadow-2xl lg:border lg:border-[var(--color-border)]"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-lg mx-auto">
              <div className="w-10 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-5 lg:hidden" />
              <p className="text-base font-bold text-[var(--color-foreground)] mb-4">新しいプロパティを追加</p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                  プロパティ名
                </label>
                <input
                  type="text"
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  placeholder="例: 例文メモ"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newColumnTitle.trim() && !addColumnSaving) {
                      void handleConfirmAddColumn();
                    }
                  }}
                  className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                  種類
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'text', label: 'テキスト', icon: 'notes' },
                    { value: 'number', label: '数値', icon: 'tag' },
                    { value: 'date', label: '日付', icon: 'calendar_today' },
                  ] as { value: CustomColumnType; label: string; icon: string }[]).map((opt) => {
                    const selected = newColumnType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewColumnType(opt.value)}
                        className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-[var(--radius-lg)] border transition-colors ${
                          selected
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-foreground)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
                        }`}
                      >
                        <Icon name={opt.icon} size={20} />
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddColumnSheet(false)}
                  disabled={addColumnSaving}
                  className="flex-1 py-3 rounded-xl text-[var(--color-muted)] font-semibold text-sm hover:bg-[var(--color-surface-secondary)] transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => { void handleConfirmAddColumn(); }}
                  disabled={!newColumnTitle.trim() || addColumnSaving}
                  className="flex-1 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm disabled:opacity-50"
                >
                  {addColumnSaving ? '追加中...' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        ref={scanCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
      <input
        ref={scanGalleryInputRef}
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

      <Modal
        isOpen={!!openWordId}
        onClose={handleCloseWordModal}
        variant="sheet"
        showCloseButton={false}
      >
        {openWordId && (
          <WordDetailView
            key={openWordId}
            wordId={openWordId}
            onClose={handleCloseWordModal}
            variant="modal"
            onWordUpdated={handleWordUpdatedFromModal}
          />
        )}
      </Modal>

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
