'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DesktopProjectDetailView } from '@/components/desktop/DesktopProjectDetail';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/toast';
import { WordLimitModal } from '@/components/limits';
import { ScanCaptureModal } from '@/components/home/ScanCaptureModal';
import { ProjectShareSheet } from '@/components/project/ProjectShareSheet';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { WordFilterSheet, WordSortSheet } from '@/components/project/WordListSheets';
import { WordDetailView } from '@/components/word/WordDetailView';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { getRepository, hybridRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { scheduleWordStatusWrite } from '@/lib/db/debounced-status-write';
import { invalidateHomeCache } from '@/lib/home-cache';
import { markProjectVisited } from '@/lib/project-visit';
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
import type { Project, ProjectShareScope, SubscriptionStatus, VocabularyType, Word, WordStatus } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

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

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [wordSortOrder, setWordSortOrder] = useState<ProjectWordSortOrder>('createdAsc');
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
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [sharePrepareLoading, setSharePrepareLoading] = useState(false);
  const [shareScopeUpdating, setShareScopeUpdating] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
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
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

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
        setError('単語帳が見つかりません');
      }
    } catch (loadError) {
      console.error('Failed to load project:', loadError);
      setError('単語帳の読み込みに失敗しました');
    } finally {
      setLoading(false);
      setWordsLoaded(true);
    }
  }, [authLoading, projectId, repository, user]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project?.id) markProjectVisited(project.id);
  }, [project?.id]);

  const counts = useMemo(() => {
    const wordStats = countProjectWordStats(words);
    return {
      total: wordStats.total,
      mastered: wordStats.mastered,
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

  const handleExitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedWordIds(new Set());
  }, []);

  const handleToggleSelectWord = useCallback((wordId: string) => {
    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
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
          ? `${targets.length}語をお気に入りに追加しました`
          : `${targets.length}語をお気に入りから外しました`,
        type: 'success',
      });
    } catch (favoriteError) {
      console.error('Failed to bulk update favorite:', favoriteError);
      setWords((prev) => prev.map((w) => {
        const original = targets.find((t) => t.id === w.id);
        return original ? { ...w, isFavorite: original.isFavorite } : w;
      }));
      showToast({ message: 'お気に入り更新に失敗しました', type: 'error' });
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
        message: scope === 'public' ? '共有ページに公開しました' : '非公開（招待コードのみ）にしました',
        type: 'success',
      });
    } catch (scopeError) {
      console.error('Failed to update share scope:', scopeError);
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

  const handleSaveManualWord = async () => {
    const english = manualWordEnglish.trim();
    const japanese = manualWordJapanese.trim();
    if (!english || !japanese || !project) return;

    const { canAdd, wouldExceed } = canAddWords(1);
    if (!canAdd || wouldExceed) {
      setShowWordLimitModal(true);
      return;
    }

    const userPos = manualWordPartOfSpeech.trim();
    const userExample = manualWordExampleSentence.trim();

    setManualWordSaving(true);
    setManualWordSavingMessage('情報を生成中...');

    let enrichedPronunciation = '';
    let enrichedPartOfSpeechTags: string[] = userPos ? [userPos] : [];
    let enrichedExampleSentence = userExample;
    let enrichedExampleSentenceJa = '';

    try {
      const enrichResponse = await fetch('/api/words/enrich-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          english,
          japanese,
          ...(userPos ? { partOfSpeechTags: [userPos] } : {}),
          ...(userExample ? { exampleSentence: userExample } : {}),
        }),
      });

      if (enrichResponse.ok) {
        const data = (await enrichResponse.json()) as {
          success?: boolean;
          enriched?: {
            pronunciation?: string;
            partOfSpeechTags?: string[];
            exampleSentence?: string;
            exampleSentenceJa?: string;
          };
        };
        if (data.success && data.enriched) {
          enrichedPronunciation = data.enriched.pronunciation ?? '';
          if (data.enriched.partOfSpeechTags && data.enriched.partOfSpeechTags.length > 0) {
            enrichedPartOfSpeechTags = data.enriched.partOfSpeechTags;
          }
          if (!enrichedExampleSentence && data.enriched.exampleSentence) {
            enrichedExampleSentence = data.enriched.exampleSentence;
          }
          enrichedExampleSentenceJa = data.enriched.exampleSentenceJa ?? '';
        }
      }
    } catch (enrichError) {
      console.warn('[manual-word] enrich error:', enrichError);
    }

    const optimisticWord: Word = {
      id: crypto.randomUUID(),
      projectId,
      english,
      japanese,
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      pronunciation: enrichedPronunciation || undefined,
      partOfSpeechTags: enrichedPartOfSpeechTags.length > 0 ? enrichedPartOfSpeechTags : undefined,
      exampleSentence: enrichedExampleSentence || undefined,
      exampleSentenceJa: enrichedExampleSentenceJa || undefined,
      status: 'new',
      createdAt: new Date().toISOString(),
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
      isFavorite: false,
    };

    setWords((prev) => [optimisticWord, ...prev]);
    showToast({ message: '単語を追加しました', type: 'success' });
    resetManualWordForm();
    setShowManualWordModal(false);
    setManualWordSaving(false);
    setManualWordSavingMessage(undefined);
    refreshWordCount();

    mutationRepository
      .createWords([
        {
          projectId,
          english,
          japanese,
          distractors: ['選択肢1', '選択肢2', '選択肢3'],
          ...(enrichedPronunciation ? { pronunciation: enrichedPronunciation } : {}),
          ...(enrichedPartOfSpeechTags.length > 0 ? { partOfSpeechTags: enrichedPartOfSpeechTags } : {}),
          ...(enrichedExampleSentence ? { exampleSentence: enrichedExampleSentence } : {}),
          ...(enrichedExampleSentenceJa ? { exampleSentenceJa: enrichedExampleSentenceJa } : {}),
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
        sortActive={wordSortOrder !== 'createdAsc'}
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
        onToggleFavorite={(word) => void handleToggleFavorite(word)}
        onCycleVocabularyType={(word) => void handleCycleVocabularyType(word)}
        onWordUpdated={(updated) => {
          setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        }}
        onDeleteWord={handleOpenDeleteWord}
      />
      <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
      <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
        <HeaderBtn onClick={() => router.replace('/')} aria-label="ホームへ戻る">
          <Icon name="chevron_left" size={16} />
        </HeaderBtn>
        <div className="relative flex gap-2">
          <HeaderBtn aria-label="メニュー" onClick={() => setMenuOpen((open) => !open)}>
            <Icon name="more_horiz" size={16} />
          </HeaderBtn>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default bg-transparent"
                aria-label="メニューを閉じる"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-11 z-30 w-[170px] overflow-hidden rounded-[14px] border-[1.25px] border-[var(--solid-ink)] bg-white shadow-[3px_4px_0_var(--solid-ink)]">
                <MenuButton icon="edit" label="名称変更" onClick={handleOpenRename} />
                <MenuButton icon="image" label="画像設定" onClick={handleOpenImagePicker} />
                <MenuButton icon="ios_share" label="共有" onClick={handleOpenShareSheet} />
                <MenuButton
                  icon="delete"
                  label="削除"
                  destructive
                  onClick={() => { setMenuOpen(false); setDeleteModalOpen(true); }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3.5 px-5 pb-2.5 pt-[18px] lg:pt-8">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[13px] border-[1.25px] bg-center bg-cover font-display text-[28px] font-extrabold text-white"
          style={{
            backgroundColor: bg,
            backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            borderColor: 'var(--solid-ink)',
            boxShadow: '2.5px 2.5px 0 var(--solid-ink)',
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

      <div className="px-5 pb-3.5">
        <StackedBar total={counts.total} m={counts.mastered} l={counts.learning} n={counts.newCount} />
      </div>

      <div className="flex items-center gap-2 px-[18px] pb-4">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--color-accent)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/quiz/${projectId}`}
            className="relative flex h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--color-accent)] bg-[var(--color-accent)] text-[13px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
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
            className="relative flex h-full w-full items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
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
            className="relative flex h-full w-full items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
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
                className="absolute right-0 top-[52px] z-30 w-[180px] overflow-hidden rounded-[14px] border-[1.25px] border-[var(--solid-ink)] bg-white shadow-[3px_4px_0_var(--solid-ink)]"
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
                    setShowManualWordModal(true);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 pb-2">
        <label
          htmlFor="project-word-search"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-[7px] text-[var(--color-muted)] shadow-[2px_2px_0_var(--solid-ink)]"
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
          className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none ${
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
          className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none ${
            wordSortOrder !== 'createdAsc'
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
          className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none ${
            selectMode
              ? 'bg-[var(--solid-ink)] text-white'
              : 'bg-white text-[var(--solid-ink)]'
          }`}
        >
          <Icon name="check_box" size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-[160px]">
        {!wordsLoaded ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">単語を読み込み中...</span>
          </div>
        ) : filteredWords.length === 0 ? (
          <div className="rounded-xl border-[1.25px] border-[var(--color-border)] bg-white px-4 py-10 text-center text-sm text-[var(--color-muted)]">
            {query ? '一致する単語がありません' : '単語がありません'}
          </div>
        ) : (
          filteredWords.map((word) => (
            <WordRow
              key={word.id}
              word={word}
              selectMode={selectMode}
              selected={selectedWordIds.has(word.id)}
              onToggleSelect={() => handleToggleSelectWord(word.id)}
              onCycleStatus={(newStatus) => handleCycleStatus(word.id, newStatus)}
              onCycleVocabularyType={() => void handleCycleVocabularyType(word)}
              onToggleFavorite={() => void handleToggleFavorite(word)}
              onSelect={() => setSelectedWord(word)}
            />
          ))
        )}
      </div>

      <ManualWordModal
        open={showManualWordModal}
        loading={manualWordSaving}
        loadingMessage={manualWordSavingMessage}
        english={manualWordEnglish}
        japanese={manualWordJapanese}
        partOfSpeech={manualWordPartOfSpeech}
        exampleSentence={manualWordExampleSentence}
        onEnglishChange={setManualWordEnglish}
        onJapaneseChange={setManualWordJapanese}
        onPartOfSpeechChange={setManualWordPartOfSpeech}
        onExampleSentenceChange={setManualWordExampleSentence}
        onCancel={() => {
          setShowManualWordModal(false);
          resetManualWordForm();
        }}
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

      <DeleteProjectModal
        open={deleteModalOpen}
        loading={deleteLoading}
        title={project.title}
        onCancel={() => { if (!deleteLoading) setDeleteModalOpen(false); }}
        onConfirm={() => void handleConfirmDelete()}
      />

      {selectedWord && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelectedWord(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10">
            <div
              className="w-full overflow-y-auto"
              style={{
                maxWidth: 480,
                maxHeight: '80dvh',
                background: '#faf7f1',
                border: '1.5px solid var(--solid-ink)',
                borderRadius: 20,
                boxShadow: '4px 5px 0 var(--solid-ink)',
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
          desktop view's filter / sort / select buttons can use them too */}
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

      <BulkActionBar
        open={selectMode}
        selectedCount={selectedWordIds.size}
        totalCount={filteredWords.length}
        allSelected={filteredWords.length > 0 && filteredWords.every((w) => selectedWordIds.has(w.id))}
        allFavoriteInSelection={
          selectedWordIds.size > 0 &&
          filteredWords.filter((w) => selectedWordIds.has(w.id)).every((w) => w.isFavorite)
        }
        favoriteLoading={bulkFavoriteLoading}
        vocabularyTypeLoading={bulkVocabularyTypeLoading}
        onCancel={handleExitSelectMode}
        onToggleSelectAll={() => {
          if (filteredWords.length === 0) return;
          const allSel = filteredWords.every((w) => selectedWordIds.has(w.id));
          setSelectedWordIds(allSel ? new Set() : new Set(filteredWords.map((w) => w.id)));
        }}
        onBulkFavorite={() => void handleBulkToggleFavorite()}
        onBulkVocabularyType={(vocabularyType) => void handleBulkSetVocabularyType(vocabularyType)}
        onBulkDelete={() => setBulkDeleteModalOpen(true)}
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
            <div className="w-full max-w-[360px] rounded-[16px] border-[1.25px] border-[var(--solid-ink)] bg-white p-5" style={{ boxShadow: '3px 4px 0 var(--solid-ink)' }}>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">RENAME</div>
              <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">名称変更</h2>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirmRename(); }}
                autoFocus
                maxLength={60}
                className="mt-3 w-full rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none focus:shadow-[2px_2px_0_var(--color-accent)]"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  disabled={renameLoading}
                  className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmRename()}
                  disabled={renameLoading || !renameValue.trim()}
                  className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
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
          className="w-full max-w-[360px] rounded-[16px] border-[1.25px] border-[var(--solid-ink)] bg-white p-5"
          style={{ boxShadow: '3px 4px 0 var(--solid-ink)' }}
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
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
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

function ManualWordModal({
  open,
  loading,
  loadingMessage,
  english,
  japanese,
  partOfSpeech,
  exampleSentence,
  onEnglishChange,
  onJapaneseChange,
  onPartOfSpeechChange,
  onExampleSentenceChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  loadingMessage?: string;
  english: string;
  japanese: string;
  partOfSpeech: string;
  exampleSentence: string;
  onEnglishChange: (value: string) => void;
  onJapaneseChange: (value: string) => void;
  onPartOfSpeechChange: (value: string) => void;
  onExampleSentenceChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [showOptional, setShowOptional] = useState(false);

  if (!open) return null;
  const canSubmit = english.trim().length > 0 && japanese.trim().length > 0 && !loading;

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
          className="w-full max-w-[400px] rounded-[16px] border-[1.25px] border-[var(--solid-ink)] bg-white p-5"
          style={{ boxShadow: '3px 4px 0 var(--solid-ink)' }}
        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            ADD WORD
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            単語を追加
          </h2>
          <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            品詞・例文・発音記号は AI が自動で補完します。
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                英単語
              </label>
              <input
                type="text"
                value={english}
                onChange={(e) => onEnglishChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onConfirm(); }}
                placeholder="例: beautiful"
                disabled={loading}
                maxLength={50}
                autoFocus
                className="w-full rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none focus:shadow-[2px_2px_0_var(--color-accent)] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                日本語訳
              </label>
              <input
                type="text"
                value={japanese}
                onChange={(e) => onJapaneseChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onConfirm(); }}
                placeholder="例: 美しい"
                disabled={loading}
                maxLength={100}
                className="w-full rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none focus:shadow-[2px_2px_0_var(--color-accent)] disabled:opacity-60"
              />
            </div>

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
                    className="w-full rounded-[10px] border-[1.25px] border-[var(--color-border)] bg-white px-3 py-2 text-[12px] text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
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
                    className="w-full rounded-[10px] border-[1.25px] border-[var(--color-border)] bg-white px-3 py-2 text-[12px] text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
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
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canSubmit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              {loading ? (loadingMessage ?? '保存中...') : '追加'}
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
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

function ToolChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full border-[1.25px] border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
      <Icon name={icon} size={12} />
      <span className="text-[#4a4a4a]">{label}</span>
    </span>
  );
}

function StackedBar({ total, m, l, n }: { total: number; m: number; l: number; n: number }) {
  const pctM = total ? (m / total) * 100 : 0;
  const pctL = total ? (l / total) * 100 : 0;
  const pctN = total ? (n / total) * 100 : 0;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white">
        <div style={{ width: `${pctM}%`, background: 'var(--color-success)' }} />
        <div style={{ width: `${pctL}%`, background: 'var(--color-warning)' }} />
        <div style={{ width: `${pctN}%`, background: 'rgba(26,26,26,0.12)' }} />
      </div>
      <div className="mt-[7px] flex gap-3.5 font-[var(--font-body)]">
        <BarDot color="var(--color-success)" label="習得" count={m} />
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

const STATUS_MID_PREFIX = 'notion_cb_mid_';

function StatusSquares({
  wordId,
  status,
  onStatusChange,
}: {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
}) {
  const [filledCount, setFilledCount] = useState(() => {
    if (status === 'mastered') return 3;
    if (status === 'new') return 0;
    try {
      const val = localStorage.getItem(STATUS_MID_PREFIX + wordId);
      if (val === 'down2' || val === '1') return 2;
      if (val === 'down1') return 1;
    } catch { /* ignore */ }
    return 1;
  });
  const [direction, setDirection] = useState<'up' | 'down'>(() =>
    status === 'mastered' ? 'down' : 'up'
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (status === 'new') { setFilledCount(0); setDirection('up'); return; }
      if (status === 'mastered') { setFilledCount(3); setDirection('down'); return; }
      try {
        const val = localStorage.getItem(STATUS_MID_PREFIX + wordId);
        if (val === 'down2') { setFilledCount(2); setDirection('down'); }
        else if (val === 'down1') { setFilledCount(1); setDirection('down'); }
        else if (val === '1') { setFilledCount(2); setDirection('up'); }
        else { setFilledCount(1); setDirection('up'); }
      } catch { setFilledCount(1); setDirection('up'); }
    });
    return () => { cancelled = true; };
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (direction === 'up') {
        if (filledCount === 0) {
          localStorage.setItem(STATUS_MID_PREFIX + wordId, '0');
          setFilledCount(1);
          onStatusChange('review');
        } else if (filledCount === 1) {
          localStorage.setItem(STATUS_MID_PREFIX + wordId, '1');
          setFilledCount(2);
        } else if (filledCount === 2) {
          localStorage.removeItem(STATUS_MID_PREFIX + wordId);
          setFilledCount(3);
          setDirection('down');
          onStatusChange('mastered');
        }
      } else {
        if (filledCount === 3) {
          localStorage.setItem(STATUS_MID_PREFIX + wordId, 'down2');
          setFilledCount(2);
          onStatusChange('review');
        } else if (filledCount === 2) {
          localStorage.setItem(STATUS_MID_PREFIX + wordId, 'down1');
          setFilledCount(1);
        } else if (filledCount === 1) {
          localStorage.removeItem(STATUS_MID_PREFIX + wordId);
          setFilledCount(0);
          setDirection('up');
          onStatusChange('new');
        }
      }
    } catch { /* localStorage unavailable */ }
  }, [filledCount, direction, onStatusChange, wordId]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`ステータス: ${status === 'new' ? '未学習' : status === 'review' ? '学習中' : '習得済み'}`}
      className="shrink-0 rounded p-0.5 transition-colors active:bg-[rgba(26,26,26,0.06)]"
    >
      <div className="flex flex-col gap-[1.5px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[10px] w-[10px] rounded-[2px] border-[1.25px] border-[var(--solid-ink)]"
            style={{ background: i < filledCount ? 'var(--solid-ink)' : 'transparent' }}
          />
        ))}
      </div>
    </button>
  );
}

function StatusPill({ kind }: { kind: WordStatus }) {
  const config = {
    new: { t: '未学習', bg: '#fff', fg: 'var(--color-muted)', bd: 'var(--color-border)' },
    review: { t: '学習中', bg: 'rgba(19,127,236,0.1)', fg: '#137fec', bd: '#137fec' },
    mastered: { t: '習得', bg: 'rgba(61,122,78,0.12)', fg: 'var(--color-success)', bd: 'var(--color-success)' },
  }[kind];

  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold leading-none"
      style={{ color: config.fg, background: config.bg, border: `1px solid ${config.bd}` }}
    >
      {config.t}
    </span>
  );
}

function WordRow({
  word,
  selectMode,
  selected,
  onToggleSelect,
  onCycleStatus,
  onCycleVocabularyType,
  onToggleFavorite,
  onSelect,
}: {
  word: Word;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onCycleStatus: (newStatus: WordStatus) => void;
  onCycleVocabularyType: () => void;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  const pos = word.partOfSpeechTags?.[0] ?? null;
  const cardClasses = selectMode
    ? `relative rounded-xl border-[1.25px] bg-white px-[13px] py-2 transition-colors ${
        selected ? 'border-[var(--solid-ink)] bg-[rgba(19,127,236,0.06)]' : 'border-[var(--solid-ink)]'
      }`
    : 'relative rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-[13px] py-2';

  if (selectMode) {
    return (
      <div className="relative">
        <div className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          className={`${cardClasses} block w-full text-left transition-all duration-100 active:translate-x-px active:translate-y-px`}
        >
          <div className="flex items-center gap-2.5">
            <SelectCheckbox checked={selected} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
              <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
                <span className="truncate">{word.japanese}</span>
              </div>
            </div>
            <VocabularyTypeBadge vocabularyType={word.vocabularyType} />
            <BookmarkBadge active={word.isFavorite} />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
      <div className={cardClasses}>
        <div className="flex items-center gap-2.5">
          <StatusSquares wordId={word.id} status={word.status} onStatusChange={onCycleStatus} />

          <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
            <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
            <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
              {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
              <span className="truncate">{word.japanese}</span>
            </div>
          </button>

          <VocabularyTypeButton
            vocabularyType={word.vocabularyType}
            onClick={onCycleVocabularyType}
            className="shrink-0"
          />
          <button
            type="button"
            onClick={onToggleFavorite}
            className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center text-[var(--color-accent)]"
            aria-label="お気に入りを切り替え"
          >
            <Icon name="bookmark" size={22} filled={word.isFavorite} />
          </button>
        </div>
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

function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
        checked
          ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
          : 'border-[var(--solid-ink)] bg-white text-transparent'
      }`}
      aria-hidden
    >
      {checked && <Icon name="check" size={13} />}
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
  onCancel,
  onToggleSelectAll,
  onBulkFavorite,
  onBulkVocabularyType,
  onBulkDelete,
}: {
  open: boolean;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  allFavoriteInSelection: boolean;
  favoriteLoading: boolean;
  vocabularyTypeLoading: VocabularyType | null;
  onCancel: () => void;
  onToggleSelectAll: () => void;
  onBulkFavorite: () => void;
  onBulkVocabularyType: (vocabularyType: VocabularyType) => void;
  onBulkDelete: () => void;
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const hasSelection = selectedCount > 0;
  const actionLoading = favoriteLoading || vocabularyTypeLoading !== null;
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
          <div className="relative flex items-center gap-2 rounded-[14px] border-[1.25px] border-[var(--solid-ink)] bg-white px-2.5 py-2.5">
            <button
              type="button"
              onClick={onCancel}
              aria-label="選択を終了"
              className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="close" size={16} />
            </button>
            <button
              type="button"
              onClick={onToggleSelectAll}
              disabled={totalCount === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-2.5 py-[7px] text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
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
                className="relative z-50 inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
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
              className="inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 text-[12px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
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
      className="inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
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
      className="inline-flex h-[38px] w-full items-center justify-between rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 text-[12px] font-bold text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50"
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
          className="w-full max-w-[360px] rounded-[16px] border-[1.25px] border-[var(--solid-ink)] bg-white p-5"
          style={{ boxShadow: '3px 4px 0 var(--solid-ink)' }}
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
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
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
          className="w-full max-w-[360px] rounded-[16px] border-[1.25px] border-[var(--solid-ink)] bg-white p-5"
          style={{ boxShadow: '3px 4px 0 var(--solid-ink)' }}
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
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
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
