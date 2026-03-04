'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import {
  springs,
  staggerContainer,
  staggerItem,
  cardSwipeVariants,
  swipeTransition,
  flipTransition,
  favoritePop,
  tapScale,
} from '@/lib/motion';
import type { Word, SubscriptionStatus } from '@/types';

// Progress storage key generator
const getProgressKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_progress_${projectId}${favoritesOnly ? '_favorites' : ''}`;
const getSessionKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_session_${projectId}${favoritesOnly ? '_favorites' : ''}`;

interface FlashcardProgress {
  wordIds: string[];
  currentIndex: number;
  savedAt: number;
}

// Helper: highlight the word in an example sentence
function highlightWord(sentence: string, word: string) {
  if (!sentence || !word) return sentence;
  const regex = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
  const parts = sentence.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <span key={i} className="font-bold text-[var(--color-primary)]">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// Mastery level from spaced repetition data
function getMasteryLevel(word: Word): { level: number; label: string; color: string } {
  const rep = word.repetition || 0;
  if (rep === 0) return { level: 0, label: '新規', color: 'var(--color-muted)' };
  if (rep <= 2) return { level: 1, label: '学習中', color: '#f59e0b' };
  if (rep <= 5) return { level: 2, label: '定着中', color: '#3b82f6' };
  return { level: 3, label: 'マスター', color: '#10b981' };
}

export default function FlashcardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const favoritesOnly = searchParams.get('favorites') === 'true';
  const returnPath = searchParams.get('from');
  const collectionId = searchParams.get('collectionId');
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [japaneseFirst, setJapaneseFirst] = useState(false);
  const [[swipeDirection, isAnimatingSwipe], setSwipeState] = useState<[number, boolean]>([0, false]);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEnglish, setEditEnglish] = useState('');
  const [editJapanese, setEditJapanese] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Favorite animation trigger
  const [favAnimKey, setFavAnimKey] = useState(0);

  // Drag
  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);
  const dragOpacity = useTransform(dragX, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const hasLoadedRef = useRef(false);

  // Save progress
  const saveProgress = useCallback((wordList: Word[], index: number) => {
    const progress: FlashcardProgress = {
      wordIds: wordList.map(w => w.id),
      currentIndex: index,
      savedAt: Date.now(),
    };
    const progressStr = JSON.stringify(progress);
    localStorage.setItem(getProgressKey(projectId, favoritesOnly), progressStr);
    sessionStorage.setItem(getSessionKey(projectId, favoritesOnly), progressStr);
  }, [projectId, favoritesOnly]);

  const backToProject = useCallback(() => {
    if (words.length > 0) {
      saveProgress(words, currentIndex);
    }
    router.push(returnPath || `/project/${projectId}`);
  }, [words, currentIndex, saveProgress, router, returnPath, projectId]);

  // Load words (unchanged logic, kept compact)
  useEffect(() => {
    if (authLoading) return;
    if (!isPro && !favoritesOnly) { router.push('/subscription'); return; }

    const loadWords = async () => {
      if (hasLoadedRef.current && words.length > 0) { setLoading(false); return; }

      try {
        const ensureProjectAccess = async (): Promise<boolean> => {
          const ownerUserId = user ? user.id : getGuestUserId();
          try {
            const localProject = await repository.getProject(projectId);
            if (localProject?.userId === ownerUserId) return true;
          } catch { /* skip */ }
          if (!navigator.onLine) return true;
          if (user) {
            try {
              const remoteProject = await remoteRepository.getProject(projectId);
              return remoteProject?.userId === ownerUserId;
            } catch { return true; }
          }
          return false;
        };

        // Try session storage restore
        const sessionKey = getSessionKey(projectId, favoritesOnly);
        const sessionProgressStr = sessionStorage.getItem(sessionKey);
        if (sessionProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(sessionProgressStr);
            const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
            if (progress.savedAt > thirtyMinutesAgo && progress.wordIds.length > 0) {
              let wordsData: Word[];
              if (collectionId) {
                wordsData = await loadCollectionWords(collectionId);
              } else if (projectId === 'all' && favoritesOnly) {
                const userId = user ? user.id : getGuestUserId();
                const projects = await repository.getProjects(userId);
                const allProjectWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
                wordsData = allProjectWords.flat().filter(w => w.isFavorite);
              } else {
                const hasAccess = await ensureProjectAccess();
                if (!hasAccess) { backToProject(); return; }
                const allWords = await repository.getWords(projectId);
                wordsData = favoritesOnly ? allWords.filter(w => w.isFavorite) : allWords;
              }
              const wordMap = new Map(wordsData.map(w => [w.id, w]));
              const orderedWords = progress.wordIds.map(id => wordMap.get(id)).filter((w): w is Word => w !== undefined);
              if (orderedWords.length >= progress.wordIds.length * 0.5 && orderedWords.length >= wordsData.length * 0.8) {
                setWords(orderedWords);
                setCurrentIndex(Math.min(progress.currentIndex, orderedWords.length - 1));
                hasLoadedRef.current = true;
                setLoading(false);
                return;
              }
            }
          } catch { sessionStorage.removeItem(sessionKey); }
        }

        let wordsData: Word[];
        if (collectionId) {
          wordsData = await loadCollectionWords(collectionId);
        } else if (projectId === 'all' && favoritesOnly) {
          const userId = user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const allProjectWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
          wordsData = allProjectWords.flat().filter(w => w.isFavorite);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) { backToProject(); return; }
          let allWords = await repository.getWords(projectId);
          if (allWords.length === 0 && user && navigator.onLine) {
            try { allWords = await remoteRepository.getWords(projectId); } catch { /* silent */ }
          }
          wordsData = favoritesOnly ? allWords.filter(w => w.isFavorite) : allWords;
        }

        if (wordsData.length === 0) { backToProject(); return; }

        // Try localStorage restore
        const progressKey = getProgressKey(projectId, favoritesOnly);
        const savedProgressStr = localStorage.getItem(progressKey);
        if (savedProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(savedProgressStr);
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            if (progress.savedAt > sevenDaysAgo) {
              const wordMap = new Map(wordsData.map(w => [w.id, w]));
              const orderedWords = progress.wordIds.map(id => wordMap.get(id)).filter((w): w is Word => w !== undefined);
              if (orderedWords.length >= wordsData.length * 0.8) {
                setWords(orderedWords);
                setCurrentIndex(Math.min(progress.currentIndex, orderedWords.length - 1));
                hasLoadedRef.current = true;
                setLoading(false);
                return;
              }
            }
          } catch { localStorage.removeItem(progressKey); }
        }

        setWords(sortWordsByPriority(wordsData));
        hasLoadedRef.current = true;
      } catch {
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, authLoading, favoritesOnly, isPro, user]);

  // Phase 2: Remote sync
  useEffect(() => {
    if (authLoading || !user || collectionId || (projectId === 'all' && favoritesOnly)) return;
    const syncRemote = async () => {
      try {
        const remoteWords = await remoteRepository.getWords(projectId);
        if (remoteWords.length === 0) return;
        setWords(prev => {
          if (prev.length === 0) return prev;
          if (remoteWords.length <= prev.length) return prev;
          const existingIds = new Set(prev.map(w => w.id));
          const remoteMap = new Map(remoteWords.map(w => [w.id, w]));
          const updated = prev.map(w => remoteMap.get(w.id) ?? w);
          const newWords = remoteWords.filter(w => !existingIds.has(w.id));
          return sortWordsByPriority([...updated, ...newWords]);
        });
      } catch { /* silent */ }
    };
    syncRemote();
  }, [authLoading, user, projectId, collectionId, favoritesOnly]);

  // Auto-save
  useEffect(() => {
    if (words.length > 0) saveProgress(words, currentIndex);
  }, [currentIndex, words, saveProgress]);

  // Save on leave
  useEffect(() => {
    const handleSave = () => { if (words.length > 0) saveProgress(words, currentIndex); };
    window.addEventListener('beforeunload', handleSave);
    const handleVisChange = () => { if (document.visibilityState === 'hidden') handleSave(); };
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('pagehide', handleSave);
    return () => {
      window.removeEventListener('beforeunload', handleSave);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('pagehide', handleSave);
    };
  }, [words, currentIndex, saveProgress]);

  const currentWord = words[currentIndex];

  const navigateTo = useCallback((direction: 1 | -1) => {
    if (isAnimatingSwipe) return;
    setSwipeState([direction, true]);
    const next = direction === 1
      ? (currentIndex < words.length - 1 ? currentIndex + 1 : 0)
      : (currentIndex > 0 ? currentIndex - 1 : words.length - 1);
    setTimeout(() => {
      setCurrentIndex(next);
      setIsFlipped(false);
      setSwipeState([direction, false]);
    }, 50);
  }, [isAnimatingSwipe, currentIndex, words.length]);

  const handleFlip = useCallback(() => {
    if (!isAnimatingSwipe) {
      setIsFlipped(prev => !prev);
      speakWord();
    }
  }, [isAnimatingSwipe]);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    const threshold = 80;
    const velocity = info.velocity.x;
    if (info.offset.x < -threshold || velocity < -500) {
      navigateTo(1);
    } else if (info.offset.x > threshold || velocity > 500) {
      navigateTo(-1);
    }
  }, [navigateTo]);

  const handleShuffle = () => {
    const shuffled = shuffleArray([...words]);
    setWords(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    saveProgress(shuffled, 0);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimatingSwipe) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); navigateTo(-1); break;
        case 'ArrowRight': e.preventDefault(); navigateTo(1); break;
        case ' ':
        case 'ArrowUp':
        case 'ArrowDown': e.preventDefault(); handleFlip(); break;
        case 'Escape': backToProject(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimatingSwipe, navigateTo, handleFlip, backToProject]);

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, isFavorite: newFavorite } : w));
    if (newFavorite) setFavAnimKey(k => k + 1);
  };

  const handleDeleteWord = async () => {
    if (!currentWord) return;
    const confirmed = window.confirm(`「${currentWord.english}」を削除しますか？`);
    if (!confirmed) return;
    await repository.deleteWord(currentWord.id);
    const newWords = words.filter((_, i) => i !== currentIndex);
    if (newWords.length === 0) { backToProject(); return; }
    if (currentIndex >= newWords.length) setCurrentIndex(newWords.length - 1);
    setWords(newWords);
    setIsFlipped(false);
  };

  function speakWord() {
    if (currentWord?.english && typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentWord.english);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }

  const handleOpenDictionary = () => {
    if (currentWord?.english) {
      window.open(`https://eow.alc.co.jp/search?q=${encodeURIComponent(currentWord.english)}`, '_blank');
    }
  };

  const handleOpenEditModal = () => {
    if (currentWord) {
      setEditEnglish(currentWord.english);
      setEditJapanese(currentWord.japanese);
      setIsEditModalOpen(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!currentWord || !editEnglish.trim() || !editJapanese.trim()) return;
    setIsSaving(true);
    try {
      await repository.updateWord(currentWord.id, { english: editEnglish.trim(), japanese: editJapanese.trim() });
      setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, english: editEnglish.trim(), japanese: editJapanese.trim() } : w));
      setIsEditModalOpen(false);
    } catch { /* silent */ } finally { setIsSaving(false); }
  };

  // Mastery info
  const mastery = currentWord ? getMasteryLevel(currentWord) : null;
  const progressPercent = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springs.gentle}
        >
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">フラッシュカードを準備中...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] grid grid-rows-[auto_1fr_auto] bg-[var(--color-background)] fixed inset-0">
      {/* Header */}
      <header className="sticky top-0 p-4 flex flex-col max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between">
          <motion.button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
            {...tapScale}
          >
            <Icon name="close" size={24} />
          </motion.button>

          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] rounded-full shadow-soft">
            <span className="text-[var(--color-primary)] font-bold">{currentIndex + 1}</span>
            <span className="text-[var(--color-muted)]">/</span>
            <span className="text-[var(--color-muted)]">{words.length}</span>
          </div>

          <motion.button
            onClick={handleShuffle}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
            whileTap={{ rotate: 180, scale: 0.9 }}
            transition={springs.snappy}
          >
            <Icon name="shuffle" size={22} />
          </motion.button>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[var(--color-primary)] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={springs.gentle}
          />
        </div>
      </header>

      {/* Favorites badge */}
      {favoritesOnly && (
        <motion.div
          className="flex justify-center -mt-2 mb-2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
        >
          <div className="chip chip-tough">
            <Icon name="flag" size={16} filled />
            <span>苦手な単語</span>
          </div>
        </motion.div>
      )}

      {/* Card area */}
      <main className="flex items-center justify-center px-6 overflow-hidden min-h-0 py-2" style={{ perspective: '1200px' }}>
        <AnimatePresence mode="popLayout" custom={swipeDirection}>
          <motion.div
            key={currentIndex}
            custom={swipeDirection}
            variants={cardSwipeVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={swipeTransition}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={handleDragEnd}
            style={{ x: dragX, rotate: dragRotate, opacity: dragOpacity }}
            className="w-full max-w-sm aspect-[3/4] max-h-full cursor-pointer"
            onClick={handleFlip}
          >
            {/* 3D Flip container */}
            <motion.div
              className="relative w-full h-full"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={flipTransition}
            >
              {/* Front */}
              <div
                className="absolute inset-0 rounded-2xl bg-[var(--color-surface)] shadow-card flex flex-col items-center justify-center p-6"
                style={{ backfaceVisibility: 'hidden' }}
              >
                {/* Mode badge */}
                <div className="absolute top-5 left-5">
                  <span className="px-3 py-1 bg-[var(--color-primary-light)] text-[var(--color-muted)] text-xs font-semibold rounded-full uppercase tracking-wide">
                    {japaneseFirst ? '日→英' : '英→日'}
                  </span>
                </div>

                {/* Mastery indicator */}
                {mastery && (
                  <div className="absolute top-5 right-14 flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {[0, 1, 2, 3].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full transition-colors"
                          style={{ backgroundColor: i <= mastery.level ? mastery.color : 'var(--color-border)' }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: mastery.color }}>{mastery.label}</span>
                  </div>
                )}

                {/* Voice button */}
                {!japaneseFirst && (
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); speakWord(); }}
                    className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-[var(--color-primary)]"
                    whileTap={{ scale: 0.85 }}
                    aria-label="発音を聞く"
                  >
                    <Icon name="volume_up" size={22} />
                  </motion.button>
                )}

                {/* Word */}
                <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] text-center tracking-tight">
                  {japaneseFirst ? currentWord?.japanese : currentWord?.english}
                </h1>

                {/* Pronunciation */}
                {!japaneseFirst && currentWord?.pronunciation && (
                  <p className="mt-2 text-sm text-[var(--color-muted)] font-mono">{currentWord.pronunciation}</p>
                )}

                {/* Part of speech */}
                {!japaneseFirst && currentWord?.partOfSpeechTags && currentWord.partOfSpeechTags.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {currentWord.partOfSpeechTags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] font-medium bg-[var(--color-primary-light)] text-[var(--color-primary)] rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Hint */}
                <p className="absolute bottom-5 text-sm text-[var(--color-muted)]">
                  タップして{japaneseFirst ? '英語' : '意味'}を表示
                </p>
              </div>

              {/* Back — Rich info card */}
              <div
                className="absolute inset-0 rounded-2xl bg-[var(--color-primary)] shadow-card flex flex-col overflow-hidden"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                {/* Voice button (jp first) */}
                {japaneseFirst && (
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); speakWord(); }}
                    className="absolute top-5 right-5 z-10 w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-white"
                    whileTap={{ scale: 0.85 }}
                    aria-label="発音を聞く"
                  >
                    <Icon name="volume_up" size={22} />
                  </motion.button>
                )}

                {/* Scrollable content */}
                <div
                  className="flex-1 overflow-y-auto p-6 flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate={isFlipped ? 'animate' : 'initial'}
                    className="flex flex-col gap-4 my-auto"
                    onClick={() => handleFlip()}
                  >
                    {/* Main answer */}
                    <motion.div variants={staggerItem} className="text-center">
                      <h2 className="text-3xl font-bold text-white">
                        {japaneseFirst ? currentWord?.english : currentWord?.japanese}
                      </h2>
                      {japaneseFirst && currentWord?.pronunciation && (
                        <p className="mt-1 text-sm text-white/60 font-mono">{currentWord.pronunciation}</p>
                      )}
                    </motion.div>

                    {/* Divider */}
                    <motion.div variants={staggerItem} className="w-12 h-0.5 bg-white/20 mx-auto rounded-full" />

                    {/* Example sentence */}
                    {currentWord?.exampleSentence && (
                      <motion.div variants={staggerItem} className="bg-white/10 rounded-xl p-4">
                        <p className="text-xs text-white/50 mb-1.5 font-semibold uppercase tracking-wider">例文</p>
                        <p className="text-sm text-white/90 leading-relaxed">
                          {highlightWord(currentWord.exampleSentence, currentWord.english)}
                        </p>
                        {currentWord.exampleSentenceJa && (
                          <p className="text-xs text-white/50 mt-2">{currentWord.exampleSentenceJa}</p>
                        )}
                      </motion.div>
                    )}

                    {/* Related words */}
                    {currentWord?.relatedWords && currentWord.relatedWords.length > 0 && (
                      <motion.div variants={staggerItem} className="bg-white/10 rounded-xl p-4">
                        <p className="text-xs text-white/50 mb-2 font-semibold uppercase tracking-wider">関連語</p>
                        <div className="flex flex-wrap gap-2">
                          {currentWord.relatedWords.slice(0, 5).map((rw, i) => (
                            <span key={i} className="px-2.5 py-1 bg-white/15 text-white/90 text-xs rounded-full">
                              {rw.term}
                              {rw.relation && <span className="text-white/40 ml-1">({rw.relation})</span>}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Usage patterns */}
                    {currentWord?.usagePatterns && currentWord.usagePatterns.length > 0 && (
                      <motion.div variants={staggerItem} className="bg-white/10 rounded-xl p-4">
                        <p className="text-xs text-white/50 mb-2 font-semibold uppercase tracking-wider">用法</p>
                        {currentWord.usagePatterns.slice(0, 2).map((up, i) => (
                          <p key={i} className="text-sm text-white/80 mb-1">
                            <span className="text-white/90 font-medium">{up.pattern}</span>
                            {up.meaningJa && <span className="text-white/50 ml-1.5">— {up.meaningJa}</span>}
                          </p>
                        ))}
                      </motion.div>
                    )}

                    {/* Learning stats */}
                    {mastery && currentWord?.lastReviewedAt && (
                      <motion.div variants={staggerItem} className="flex items-center justify-center gap-3 text-white/40 text-xs">
                        <span>正答: {currentWord.repetition}回</span>
                        <span>•</span>
                        <span>最終: {new Date(currentWord.lastReviewedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</span>
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                {/* Tap to flip back hint */}
                <div className="p-3 text-center">
                  <p className="text-xs text-white/40">タップして戻る</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom controls */}
      <div
        className="px-4 sm:px-6 pt-1 sm:pt-2"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Action buttons */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <motion.button
            onClick={() => { setJapaneseFirst(!japaneseFirst); setIsFlipped(false); }}
            className={`w-11 h-11 flex items-center justify-center rounded-full shadow-soft hover:shadow-md transition-all ${
              japaneseFirst ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
            }`}
            {...tapScale}
            aria-label={japaneseFirst ? '英→日モードに切替' : '日→英モードに切替'}
          >
            <Icon name="translate" size={20} />
          </motion.button>

          <motion.button
            key={`fav-${favAnimKey}`}
            onClick={handleToggleFavorite}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all"
            variants={currentWord?.isFavorite ? favoritePop : undefined}
            initial="initial"
            animate="animate"
            aria-label={currentWord?.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Icon
              name="flag"
              size={20}
              filled={currentWord?.isFavorite}
              className={`transition-colors ${currentWord?.isFavorite ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`}
            />
          </motion.button>

          <motion.button
            onClick={handleOpenDictionary}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            {...tapScale}
            aria-label="辞書で調べる"
          >
            <Icon name="search" size={20} />
          </motion.button>

          <motion.button
            onClick={handleOpenEditModal}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            {...tapScale}
            aria-label="単語を編集"
          >
            <Icon name="edit" size={20} />
          </motion.button>

          <motion.button
            onClick={handleDeleteWord}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md hover:bg-[var(--color-error-light)] transition-all text-[var(--color-muted)] hover:text-[var(--color-error)]"
            {...tapScale}
            aria-label="この単語を削除"
          >
            <Icon name="delete" size={20} />
          </motion.button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => navigateTo(-1)}
            disabled={isAnimatingSwipe}
            className="w-12 h-12 sm:w-14 sm:h-14"
          >
            <Icon name="chevron_left" size={24} />
          </Button>

          <Button
            variant="secondary"
            size="icon"
            onClick={handleFlip}
            disabled={isAnimatingSwipe}
            className="w-12 h-12 sm:w-14 sm:h-14"
            aria-label="カードをめくる"
          >
            <Icon name="refresh" size={24} />
          </Button>

          <Button
            variant="secondary"
            onClick={() => navigateTo(1)}
            disabled={isAnimatingSwipe}
            className="w-12 h-12 sm:w-14 sm:h-14"
            size="icon"
          >
            <Icon name="chevron_right" size={24} />
          </Button>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsEditModalOpen(false)}
          >
            <motion.div
              className="w-full max-w-sm bg-[var(--color-background)] rounded-2xl p-6 shadow-xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={springs.snappy}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-4">単語を編集</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-muted)] mb-1">英語</label>
                  <input
                    type="text"
                    value={editEnglish}
                    onChange={(e) => setEditEnglish(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="英単語"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-muted)] mb-1">日本語</label>
                  <input
                    type="text"
                    value={editJapanese}
                    onChange={(e) => setEditJapanese(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="日本語訳"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold hover:bg-[var(--color-surface)] transition-colors"
                  disabled={isSaving}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editEnglish.trim() || !editJapanese.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
