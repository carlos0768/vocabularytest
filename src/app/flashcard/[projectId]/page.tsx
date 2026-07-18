'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MorphologyFormulaChips } from '@/components/word/MorphologyFormulaChips';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { FlashcardTutorialGuide } from '@/components/onboarding/FlashcardTutorialGuide';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import { speakEnglish } from '@/lib/speech';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import { useIsMobileViewport } from '@/hooks/use-is-mobile-viewport';
import { useTutorialFlow } from '@/hooks/use-tutorial-flow';
import { getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import { formatPartOfSpeechLabels, getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import { triggerHaptic } from '@/lib/haptics';
import type { Word, SubscriptionStatus } from '@/types';

/* ---------- Mastery level (mirrors iOS) ---------- */
function getMasteryLevel(repetition: number): number {
  if (repetition === 0) return 0;
  if (repetition <= 2) return 1;
  if (repetition <= 5) return 2;
  return 3;
}

/* ---------- Mastery dots ---------- */
function MasteryDots({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-[5px]">
      <span className="mr-1 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-muted)]">MASTERY</span>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: i < level ? 'var(--color-success)' : 'rgba(26,26,26,0.08)',
            border: `1px solid ${i < level ? 'var(--color-success)' : 'var(--color-border)'}`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- HeaderBtn (立体スケッチ風) ---------- */
function HeaderBtn({
  children,
  onClick,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  'aria-haspopup': ariaHasPopup,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: 'menu';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

/* ---------- Action chip ---------- */
function ActionChip({
  icon,
  label,
  tint = 'var(--solid-ink)',
  filled,
  onClick,
}: {
  icon: string;
  label: string;
  tint?: string;
  filled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-[5px]">
      <div
        className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]"
        style={{ color: tint }}
      >
        <Icon name={icon} size={16} filled={filled} />
      </div>
      <span className="text-[10px] font-semibold text-[var(--color-muted)]">{label}</span>
    </button>
  );
}

/* ---------- Nav button (for prev/flip/next) ---------- */
function NavBtn({
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
      onClick={() => { triggerHaptic(); onClick?.(); }}
      aria-label={ariaLabel}
      className="flex h-[42px] w-[42px] scale-[1.3] items-center justify-center rounded-[21px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

function nextWordStatus(current: string): 'new' | 'review' | 'mastered' {
  if (current === 'new') return 'review';
  if (current === 'review') return 'mastered';
  return 'new';
}

// フラッシュカードはクイズと同じ優先度順（sortWordsByPriority）でカードを並べる。
// 表示順はクイズ出題順と常に一致し、状態保存は行わない。ロジックはすべて
// フロントエンドで完結するため、順番仕様の変更にサーバー更新は不要。
function sortFlashcardWords(wordList: Word[]): Word[] {
  return sortWordsByPriority(wordList);
}

export default function FlashcardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const favoritesOnly = searchParams.get('favorites') === 'true';
  const collectionId = searchParams.get('collectionId');
  const { user, subscription, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  /* Guided tutorial: count forward advances toward the "view N cards" goal */
  const { stage: tutorialStage, setStage: setTutorialStage } = useTutorialFlow();
  const isMobileViewport = useIsMobileViewport();
  const tutorialActive = tutorialStage === 'view-cards' && isMobileViewport;
  const [tutorialAdvances, setTutorialAdvances] = useState(0);

  /* Swipe state */
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slidePhase, setSlidePhase] = useState<'exit' | 'enter' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const hasLoadedRef = useRef(false);
  const cacheRestoredRef = useRef(false);

  /* Phase 0: instant restore from home-cache */
  useLayoutEffect(() => {
    if (cacheRestoredRef.current || hasLoadedRef.current) return;
    if (!getHasLoaded()) return;
    cacheRestoredRef.current = true;
    const cachedWords = getCachedProjectWords()[projectId];
    if (cachedWords && cachedWords.length > 0 && !favoritesOnly && !collectionId) {
      setWords(sortFlashcardWords(cachedWords));
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [projectId, favoritesOnly, collectionId]);

  const backToProject = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    const loadWords = async () => {
      if (hasLoadedRef.current && words.length > 0) { setLoading(false); return; }
      try {
        const ensureProjectAccess = async (): Promise<boolean> => {
          const ownerUserId = user ? user.id : getGuestUserId();
          try {
            const localProject = await repository.getProject(projectId);
            if (localProject?.userId === ownerUserId) return true;
          } catch { /* continue */ }
          if (!navigator.onLine) return true;
          if (user) {
            try { return (await remoteRepository.getProject(projectId))?.userId === ownerUserId; }
            catch { return true; }
          }
          return false;
        };

        let loadedWords: Word[];
        if (collectionId) {
          loadedWords = await loadCollectionWords(collectionId);
        } else if (projectId === 'all' && favoritesOnly) {
          const userId = user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const arrays = await Promise.all(projects.map(p => repository.getWords(p.id)));
          loadedWords = arrays.flat().filter(w => w.isFavorite);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) { backToProject(); return; }
          loadedWords = await repository.getWords(projectId);
          if (loadedWords.length === 0 && user && navigator.onLine) {
            try { loadedWords = await remoteRepository.getWords(projectId); } catch { /* ignore */ }
          }
        }

        if (loadedWords.length === 0) { backToProject(); return; }

        // クイズと同じ優先度順に並べて、常に先頭カードから開始する。
        setWords(sortFlashcardWords(loadedWords));
        setCurrentIndex(0);
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to load flashcard words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };
    loadWords();
  }, [authLoading, projectId, favoritesOnly, collectionId, repository, user, backToProject, words.length]);

  const currentWord = words[currentIndex];

  const handleNext = useCallback((withAnimation = false) => {
    if (isAnimating) return;
    if (tutorialActive) setTutorialAdvances((count) => count + 1);
    const nextIndex = currentIndex < words.length - 1 ? currentIndex + 1 : 0;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('left'); setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(nextIndex); setIsFlipped(false); setSlidePhase('enter');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        }));
      }, 200);
    } else {
      setCurrentIndex(nextIndex); setIsFlipped(false);
    }
  }, [isAnimating, currentIndex, words.length, tutorialActive]);

  const handlePrev = useCallback((withAnimation = false) => {
    if (isAnimating) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : words.length - 1;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('right'); setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(prevIndex); setIsFlipped(false); setSlidePhase('enter');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        }));
      }, 200);
    } else {
      setCurrentIndex(prevIndex); setIsFlipped(false);
    }
  }, [isAnimating, currentIndex, words.length]);

  const handleFlip = useCallback(() => {
    if (!isAnimating && !isSwiping.current) setIsFlipped((prev) => !prev);
  }, [isAnimating]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
      setSwipeX(deltaX);
    }
  };
  const handleTouchEnd = () => {
    if (isAnimating) return;
    if (swipeX < -80) handleNext(true);
    else if (swipeX > 80) handlePrev(true);
    setSwipeX(0);
    setTimeout(() => { isSwiping.current = false; }, 50);
  };

  /* Keyboard nav */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (isAnimating) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); handlePrev(true); break;
        case 'ArrowRight': e.preventDefault(); handleNext(true); break;
        case ' ': case 'ArrowUp': case 'ArrowDown': e.preventDefault(); handleFlip(); break;
        case 'Escape': backToProject(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimating, currentIndex, words.length, isFlipped, handlePrev, handleNext, handleFlip, backToProject]);

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, isFavorite: newFavorite } : w));
  };

  const handleCycleStatus = async () => {
    if (!currentWord) return;
    const newStatus = nextWordStatus(currentWord.status);
    await repository.updateWord(currentWord.id, { status: newStatus });
    setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, status: newStatus } : w));
  };

  const handleDeleteWord = async () => {
    if (!currentWord) return;
    const confirmed = window.confirm(`「${currentWord.english}」を削除しますか？`);
    if (!confirmed) return;
    await repository.deleteWord(currentWord.id);
    const newWords = words.filter((_, i) => i !== currentIndex);
    if (newWords.length === 0) { backToProject(); return; }
    if (currentIndex >= newWords.length) setCurrentIndex(newWords.length - 1);
    setWords(newWords); setIsFlipped(false);
  };

  function speakWord() {
    speakEnglish(currentWord?.english);
  }

  const handleSearchEijiro = () => {
    const term = currentWord?.english?.trim();
    if (!term || typeof window === 'undefined') return;
    triggerHaptic();
    const url = `https://eow.alc.co.jp/search?q=${encodeURIComponent(term)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /* Card transform */
  const getCardTransform = () => {
    if (slidePhase === 'exit') {
      if (slideDirection === 'left') return 'translateX(-120%)';
      if (slideDirection === 'right') return 'translateX(120%)';
    }
    if (slidePhase === 'enter') {
      if (slideDirection === 'left') return 'translateX(120%)';
      if (slideDirection === 'right') return 'translateX(-120%)';
    }
    if (swipeX !== 0) return `translateX(${swipeX}px) rotate(${swipeX * 0.02}deg)`;
    return 'translateX(0)';
  };

  /* Status label */
  const statusLabel = (s: string) => ({ new: '未学習', review: '学習中', active: '定着中', mastered: '習得' }[s] ?? s);
  const statusColor = (s: string) =>
    s === 'mastered' ? 'var(--color-success)' : s === 'active' ? '#2563eb' : s === 'review' ? '#137fec' : 'var(--color-muted)';

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--solid-ink)] border-t-transparent" />
          <p className="text-[var(--color-muted)]">フラッシュカードを準備中...</p>
        </div>
      </div>
    );
  }

  const masteryLevel = getMasteryLevel(currentWord?.repetition ?? 0);
  const total = words.length;
  const currentPartOfSpeechLabel = formatPartOfSpeechLabels(currentWord?.partOfSpeechTags);
  const tutorialTarget = Math.min(10, total);
  const tutorialSeen = Math.min(total, 1 + tutorialAdvances);

  return (
    <>
    <div className="ds-fixed-main fixed inset-0 z-30 hidden flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:flex">
      <div className="ds-fc-wrap">
        <div className="ds-quiz-head" style={{ maxWidth: 720 }}>
          <button type="button" className="x" onClick={backToProject} aria-label="閉じる">
            <Icon name="close" />
          </button>
          <div className="ds-qbar"><div className="fi" style={{ width: `${((currentIndex + 1) / Math.max(total, 1)) * 100}%` }} /></div>
          <span className="ds-qcount">{currentIndex + 1} <span className="muted" style={{ fontWeight: 500 }}>/ {total}</span></span>
        </div>
        <div className="mono muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 4 }}>
          {favoritesOnly ? 'お気に入り' : collectionId ? 'コレクション' : '単語帳'} · フラッシュカード
        </div>

        <div className="ds-fc-scene">
          <div className={'ds-fc-card' + (isFlipped ? ' flipped' : '')} onClick={handleFlip}>
            <div className="ds-fc-face front">
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleToggleFavorite(); }}
                aria-label="お気に入り"
                style={{ position: 'absolute', top: 18, right: 18, color: currentWord?.isFavorite ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >
                <Icon name="bookmark" filled={currentWord?.isFavorite} />
              </button>
              <div className="en" style={{ fontSize: currentWord?.english && currentWord.english.length > 14 ? 46 : undefined }}>
                {currentWord?.english}
              </div>
              <div className="ph">{currentWord?.pronunciation || '\u00a0'}</div>
              {currentPartOfSpeechLabel && <span className="ds-tag accent">{currentPartOfSpeechLabel}</span>}
              <div className="hint"><Icon name="touch_app" style={{ fontSize: 14 }} />クリックで意味を表示</div>
            </div>
            <div className="ds-fc-face back" style={{ overflowY: 'auto', justifyContent: 'flex-start', padding: '28px 40px 40px' }}>
              {/* margin:auto で内容が短いときは中央寄せ、長いときは上からスクロール */}
              <div style={{ margin: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div className="ja">{currentWord && <TranslationDisplay word={currentWord} />}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {currentWord?.partOfSpeechTags?.map((tag) => <span key={tag} className="ds-tag accent">{getPartOfSpeechLabel(tag)}</span>)}
                </div>
                {currentWord?.exampleSentence && (
                  <div
                    style={{
                      maxWidth: 460,
                      width: '100%',
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      padding: '12px 16px',
                      textAlign: 'left',
                    }}
                  >
                    <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6 }}>例文</div>
                    <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--color-ink)' }}>{currentWord.exampleSentence}</div>
                    {currentWord.exampleSentenceJa && (
                      <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>{currentWord.exampleSentenceJa}</div>
                    )}
                  </div>
                )}
                {currentWord && hasDisplayableMorphology(currentWord.morphology) && (
                  <div
                    style={{
                      maxWidth: 460,
                      width: '100%',
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      padding: '12px 16px',
                      textAlign: 'left',
                    }}
                  >
                    <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-ink)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="account_tree" style={{ fontSize: 13 }} />語源
                    </div>
                    <MorphologyFormulaChips morphology={currentWord.morphology} />
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10, whiteSpace: 'pre-line' }}>
                      {currentWord.morphology.explanation}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>
                  <Icon name="touch_app" style={{ fontSize: 14 }} />クリックで戻る
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* モバイルと同じアクションチップ（回転などのナビの上段） */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 20 }}>
          <ActionChip icon="search" label="英辞郎" onClick={handleSearchEijiro} />
          <ActionChip icon="volume_up" label="発音" onClick={speakWord} />
          <ActionChip
            icon="task_alt"
            label={statusLabel(currentWord?.status ?? 'new')}
            tint={statusColor(currentWord?.status ?? 'new')}
            onClick={handleCycleStatus}
          />
          <ActionChip
            icon="bookmark"
            label="お気に入り"
            tint={currentWord?.isFavorite ? 'var(--color-accent)' : 'var(--solid-ink)'}
            filled={currentWord?.isFavorite}
            onClick={handleToggleFavorite}
          />
          <ActionChip icon="delete" label="削除" tint="var(--color-error)" onClick={handleDeleteWord} />
        </div>

        <div className="ds-fc-controls" style={{ marginTop: 18 }}>
          <button type="button" className="ds-fc-big dunno" onClick={() => { triggerHaptic(); handlePrev(); }}>
            <Icon name="chevron_left" />前へ
          </button>
          <button type="button" className="ds-fc-big know" onClick={() => { triggerHaptic(); handleFlip(); }} aria-label="カードを回転">
            <Icon name="cached" />回転
          </button>
          <button type="button" className="ds-fc-big dunno" onClick={() => { triggerHaptic(); handleNext(); }}>
            次へ<Icon name="chevron_right" />
          </button>
        </div>
      </div>
    </div>

    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
      {/* Header: HeaderBtn close | progress | HeaderBtn details */}
      <div
        className="flex shrink-0 items-center justify-between px-4 pb-2.5"
        style={{ paddingTop: 'max(8px, calc(env(safe-area-inset-top) + 8px))' }}
      >
        <HeaderBtn onClick={backToProject} aria-label="閉じる">
          <Icon name="close" size={16} />
        </HeaderBtn>

        <div className="flex flex-col items-center gap-[3px]">
          <div className="font-mono text-[11px] font-bold tabular-nums text-[var(--solid-ink)]">
            {currentIndex + 1}<span className="text-[var(--color-muted)]">/{total}</span>
          </div>
          <div className="h-1 w-[120px] overflow-hidden rounded-sm bg-[rgba(26,26,26,0.08)]">
            <div className="h-full bg-[var(--solid-ink)]" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
          </div>
        </div>

        {/* 並び替え・保存メニューは廃止。進捗表示を中央に保つためのスペーサー。 */}
        <div className="h-[38px] w-[38px]" aria-hidden="true" />
      </div>

      {/* Card area (no ghost cards) */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5">
        {/* Flashcard */}
        <div
          className="relative w-full"
          onClick={handleFlip}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: getCardTransform(),
            transition: slidePhase === 'enter' ? 'none' : (isAnimating || swipeX === 0 ? 'transform 0.2s ease-out' : 'none'),
            perspective: '1200px',
          }}
        >
          <div
            className="grid w-full"
            style={{
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transformStyle: 'preserve-3d',
              transition: isAnimating ? 'none' : 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'transform',
            }}
          >
            <div
              className="relative col-start-1 row-start-1 flex min-h-[380px] w-full flex-col rounded-[18px] border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-[22px_18px_18px]"
              style={{
                backfaceVisibility: 'hidden',
                boxShadow: '4px 4px 0 var(--solid-ink)',
                pointerEvents: isFlipped ? 'none' : 'auto',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              {/* POS badge + favorite */}
              <div className="flex items-center justify-between">
                {currentWord?.partOfSpeechTags?.[0] ? (
                  <div className="rounded border border-[var(--solid-ink)] bg-white px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--solid-ink)]">
                    {getPartOfSpeechLabel(currentWord.partOfSpeechTags[0])}
                  </div>
                ) : <div />}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleToggleFavorite(); }}
                  className={`inline-flex ${currentWord?.isFavorite ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
                >
                  <Icon name="bookmark" size={18} filled={currentWord?.isFavorite} />
                </button>
              </div>

              {/* Big word */}
              <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
                <div className="font-mono text-xs text-[var(--color-muted)]">{currentWord?.pronunciation ?? ''}</div>
                <div className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[var(--solid-ink)]">
                  {currentWord?.english}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); speakWord(); }}
                  className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-[13px] py-[7px] text-xs font-bold text-[var(--solid-ink)]"
                >
                  <Icon name="volume_up" size={14} /> 発音
                </button>
              </div>

              {/* Mastery + status at bottom */}
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-[var(--color-border)] pt-3">
                <MasteryDots level={masteryLevel} />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleCycleStatus(); }}
                  className="rounded-full px-2 py-[3px] font-mono text-[9px] font-bold"
                  style={{
                    color: statusColor(currentWord?.status ?? 'new'),
                    border: `1px solid ${statusColor(currentWord?.status ?? 'new')}`,
                    background: 'white',
                  }}
                >
                  {statusLabel(currentWord?.status ?? 'new')}
                </button>
              </div>

              {/* Tap hint */}
              <div className="mt-2 text-center text-[11px] font-semibold text-[var(--color-muted)]">タップで意味を見る</div>
            </div>

            <div
              className="relative col-start-1 row-start-1 flex min-h-[380px] w-full flex-col rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] p-[22px_18px_18px]"
              style={{
                backfaceVisibility: 'hidden',
                boxShadow: '4px 4px 0 rgba(0,0,0,0.3)',
                pointerEvents: isFlipped ? 'auto' : 'none',
                transform: 'rotateY(180deg)',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <h2 className="text-3xl font-bold text-white">
                  {currentWord && <TranslationDisplay word={currentWord} />}
                </h2>
                <p className="text-sm text-white/60">{currentWord?.english}</p>
                {currentWord?.pronunciation && (
                  <p className="font-mono text-xs text-white/50">{currentWord.pronunciation}</p>
                )}
                {currentWord?.exampleSentence && (
                  <div className="mt-2 w-full rounded-xl bg-white/10 p-3.5 text-left">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[1.5px] text-white/50">例文</p>
                    <p className="text-sm leading-relaxed text-white/90">{currentWord.exampleSentence}</p>
                    {currentWord.exampleSentenceJa && (
                      <p className="mt-1.5 text-xs leading-relaxed text-white/60">{currentWord.exampleSentenceJa}</p>
                    )}
                  </div>
                )}
              </div>
              {/* Mastery inside back too */}
              <div className="mt-3 flex items-center justify-center border-t border-white/10 pt-3">
                <MasteryDots level={masteryLevel} />
              </div>
              <div className="mt-2 text-center text-[11px] font-semibold text-white/50">タップで戻る</div>
            </div>
          </div>
        </div>

        {/* Swipe hints */}
        <div className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
          <Icon name="chevron_left" size={20} />
        </div>
        <div className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
          <Icon name="chevron_right" size={20} />
        </div>
      </div>

      {/* 5 Action chips */}
      <div className="flex shrink-0 justify-center gap-3 px-5 pt-3.5">
        <ActionChip icon="search" label="英辞郎" onClick={handleSearchEijiro} />
        <ActionChip icon="volume_up" label="発音" onClick={speakWord} />
        <ActionChip
          icon="task_alt"
          label={statusLabel(currentWord?.status ?? 'new')}
          tint={statusColor(currentWord?.status ?? 'new')}
          onClick={handleCycleStatus}
        />
        <ActionChip
          icon="bookmark" label="お気に入り"
          tint={currentWord?.isFavorite ? 'var(--color-accent)' : 'var(--solid-ink)'}
          filled={currentWord?.isFavorite}
          onClick={handleToggleFavorite}
        />
        <ActionChip icon="delete" label="削除" tint="var(--color-error)" onClick={handleDeleteWord} />
      </div>

      {/* Navigation row: prev | next */}
      <div
        className="flex shrink-0 items-center justify-center gap-6 px-5 pt-3"
        style={{ paddingBottom: 'max(20px, calc(env(safe-area-inset-bottom) + 14px))' }}
      >
        <NavBtn onClick={() => handlePrev(true)} aria-label="前のカード">
          <Icon name="chevron_left" size={18} />
        </NavBtn>
        <NavBtn onClick={handleFlip} aria-label="カードを回転">
          <Icon name="cached" size={18} />
        </NavBtn>
        <NavBtn onClick={() => handleNext(true)} aria-label="次のカード">
          <Icon name="chevron_right" size={18} />
        </NavBtn>
      </div>

    </div>

    {tutorialActive && total > 0 && (
      <FlashcardTutorialGuide
        seen={tutorialSeen}
        target={tutorialTarget}
        onReturn={() => { setTutorialStage('open-quiz'); backToProject(); }}
      />
    )}
    </>
  );
}
