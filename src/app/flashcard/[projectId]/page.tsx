'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MorphologyFormulaChips } from '@/components/word/MorphologyFormulaChips';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { FlashcardTutorialGuide } from '@/components/onboarding/FlashcardTutorialGuide';
import { FlashcardScrubber } from '@/components/quiz/FlashcardScrubber';
import { getRepository } from '@/lib/db';
import {
  FLASHCARD_FILTERS,
  countFlashcardFilters,
  filterFlashcardWords,
  isFlashcardFilter,
  type FlashcardFilter,
} from '@/lib/quiz/flashcard-filter';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId, getWrongAnswers } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import { speakEnglish, speakAndWait, stopSpeaking } from '@/lib/speech';
import { afterPaint, isPageHidden } from '@/lib/ui/after-paint';
import { createTtsPlayer, type TtsPlayer } from '@/lib/speech/tts-player';
import type { TtsLang } from '@/lib/speech/cloud-text-to-speech';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import { useIsMobileViewport } from '@/hooks/use-is-mobile-viewport';
import { useTutorialFlow } from '@/hooks/use-tutorial-flow';
import { getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import { formatPartOfSpeechLabels, getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import { useMorphologyBackfill } from '@/hooks/use-morphology-backfill';
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
  active,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  'aria-haspopup': ariaHasPopup,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
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
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
      style={{ background: active ? 'var(--solid-ink)' : '#fff', color: active ? '#fff' : 'var(--solid-ink)' }}
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

// 自動再生: 英語読み上げ後の間、日本語読み上げ後に次のカードへ進むまでの間 (ms)
const AUTOPLAY_GAP_MS = 500;
const AUTOPLAY_NEXT_DELAY_MS = 1200;

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
  /** バインダー横断の山札。`/flashcard/all?binder=<バインダー名>` で来る。 */
  const binderName = projectId === 'all' ? searchParams.get('binder') : null;
  const { user, subscription, loading: authLoading } = useAuth();

  // 山札は「読み込んだ全部 (allWords)」と「絞り込み後 (words)」に分ける。
  // 表示・送り・自動再生はすべて絞り込み後の words を見る。
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [deckFilter, setDeckFilter] = useState<FlashcardFilter>(() => {
    const requested = searchParams.get('filter');
    return isFlashcardFilter(requested) ? requested : 'all';
  });
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  // 誤答回数は /words の絞り込みと同じ localStorage の記録。開いた時点で固定する。
  const wrongCounts = useMemo(
    () => new Map(getWrongAnswers().map((wrong) => [wrong.wordId, wrong.wrongCount])),
    [],
  );
  const words = useMemo(
    () => filterFlashcardWords(allWords, deckFilter, wrongCounts),
    [allWords, deckFilter, wrongCounts],
  );
  const filterCounts = useMemo(
    () => countFlashcardFilters(allWords, wrongCounts),
    [allWords, wrongCounts],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  /* 自動再生 (英語→日本語を読み上げ続けながらカードを自動送りする) */
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const wordsRef = useRef<Word[]>(words);
  useEffect(() => { wordsRef.current = words; }, [words]);
  // ホーム画面遷移などでアプリがバックグラウンドになっても読み上げが
  // 打ち切られにくいよう、極小音量のループ音声を鳴らして「再生中のタブ」
  // としてブラウザ/OSに認識させる。ページ内遷移(アンマウント)では止める。
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = silentAudioRef.current;
    if (!audio) return;
    if (isAutoPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isAutoPlaying]);

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

  /* 点々スクラバー（カード直下の点を長押し＋スワイプして山札を早送りする） */
  const [isScrubbing, setIsScrubbing] = useState(false);
  // 早送り中に前後送りのスライド演出が割り込むと、指の位置と表示がずれる。
  // 演出側から現在地を書き戻さないよう、進行中の送りに知らせるための ref。
  const isScrubbingRef = useRef(false);

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
    if (cachedWords && cachedWords.length > 0 && !favoritesOnly && !collectionId && !binderName) {
      setAllWords(sortFlashcardWords(cachedWords));
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [projectId, favoritesOnly, collectionId, binderName]);

  const backToProject = useCallback(() => {
    setIsAutoPlaying(false);
    stopSpeaking();
    router.back();
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    const loadWords = async () => {
      if (hasLoadedRef.current && allWords.length > 0) { setLoading(false); return; }
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
        } else if (binderName) {
          // バインダーに入っている単語帳をまとめて1つの山札にする
          const userId = user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const inBinder = projects.filter((p) => (p.binder?.trim() ?? '') === binderName);
          const arrays = await Promise.all(inBinder.map((p) => repository.getWords(p.id)));
          loadedWords = arrays.flat();
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
        setAllWords(sortFlashcardWords(loadedWords));
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
  }, [authLoading, projectId, favoritesOnly, collectionId, binderName, repository, user, backToProject, allWords.length]);

  const currentWord = words[currentIndex];
  // word.morphology が無い単語は lexicon 共有キャッシュから表示時に補完し、
  // words 状態にも反映して再表示時のフェッチを防ぐ。
  // 早送り中は通り過ぎるだけのカードなので取りに行かない（1枚ごとに
  // /api/words/morphology を叩くと、指を滑らせただけで大量の通信が出る）。
  const currentMorphology = useMorphologyBackfill(isScrubbing ? null : currentWord ?? null, {
    onBackfilled: (updated) => {
      setAllWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    },
  });

  const handleNext = useCallback((withAnimation = false) => {
    if (isAnimating) return;
    if (tutorialActive) setTutorialAdvances((count) => count + 1);
    const nextIndex = currentIndex < words.length - 1 ? currentIndex + 1 : 0;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('left'); setSlidePhase('exit');
      setTimeout(() => {
        // 演出の途中で早送りが始まっていたら、現在地を上書きせず演出だけ畳む。
        if (isScrubbingRef.current) { setSlidePhase(null); setSlideDirection(null); setIsAnimating(false); return; }
        setCurrentIndex(nextIndex); setIsFlipped(false); setSlidePhase('enter');
        afterPaint(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        });
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
        if (isScrubbingRef.current) { setSlidePhase(null); setSlideDirection(null); setIsAnimating(false); return; }
        setCurrentIndex(prevIndex); setIsFlipped(false); setSlidePhase('enter');
        afterPaint(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        });
      }, 200);
    } else {
      setCurrentIndex(prevIndex); setIsFlipped(false);
    }
  }, [isAnimating, currentIndex, words.length]);

  const handleFlip = useCallback(() => {
    if (!isAnimating && !isSwiping.current) setIsFlipped((prev) => !prev);
  }, [isAnimating]);

  /** 点々スクラバーの飛び先。演出は挟まず、指に即追従させる。 */
  const lastSeekIndexRef = useRef(0);
  const handleSeek = useCallback((index: number) => {
    setCurrentIndex((prev) => (prev === index ? prev : index));
    setIsFlipped(false);
    // 早送りで通り過ぎたカードも「見た枚数」に数える（1フレームに何度呼ばれても、
    // 実際に別のカードへ移ったときだけ加算する）。
    if (lastSeekIndexRef.current === index) return;
    lastSeekIndexRef.current = index;
    if (tutorialActive) setTutorialAdvances((count) => count + 1);
  }, [tutorialActive]);

  /**
   * 早送りの開始・終了。
   *
   * 開始時は自動再生を畳む —— 読み上げが後ろから追いかけてくると、指を止めた
   * ところと鳴っている単語がずれるうえ、送るたびに読み上げが切り直される。
   */
  const handleScrubbingChange = useCallback((scrubbing: boolean) => {
    isScrubbingRef.current = scrubbing;
    setIsScrubbing(scrubbing);
    if (!scrubbing) return;
    setIsFlipped(false);
    setSwipeX(0);
    setIsAutoPlaying(false);
    stopSpeaking();
  }, []);

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

  // handleNext/handlePrev は isAnimating などが変わるたびに再生成されるため、
  // ref 越しに呼ぶことで自動再生ループの useEffect を無駄に再起動させない。
  const handleNextRef = useRef(handleNext);
  const handlePrevRef = useRef(handlePrev);
  useEffect(() => { handleNextRef.current = handleNext; }, [handleNext]);
  useEffect(() => { handlePrevRef.current = handlePrev; }, [handlePrev]);

  /**
   * 合成音声プレイヤー。画面ロック中も鳴らすには、ユーザー操作の中で作った
   * 要素をそのまま使い回す必要があるので、再生ボタンのタップで解錠する。
   */
  const ttsPlayerRef = useRef<TtsPlayer | null>(null);

  const toggleAutoPlay = useCallback(() => {
    triggerHaptic();
    const next = !isAutoPlaying;
    // ユーザー操作の呼び出しスタック内で同期的に play()/pause() しておくと、
    // ブラウザの自動再生ポリシー上より確実に許可される (useEffect 側でも保険をかける)。
    if (next) {
      silentAudioRef.current?.play().catch(() => {});
      if (!ttsPlayerRef.current) ttsPlayerRef.current = createTtsPlayer();
      ttsPlayerRef.current.unlock();
    } else {
      silentAudioRef.current?.pause();
      ttsPlayerRef.current?.stop();
    }
    setIsAutoPlaying(next);
  }, [isAutoPlaying]);

  /**
   * 自動再生の読み上げ。
   *
   * まず合成音声(mp3)で鳴らす —— iOS は画面ロック中に SpeechSynthesis が
   * 発話しないため、これが「画面を消しても鳴り続ける」ための本命。
   * 音声が用意できないとき(未ログイン・上限・生成失敗)はブラウザの読み上げに
   * そのまま落とす。鳴らないより、画面が点いている間だけでも鳴った方がよい。
   */
  const speakForAutoPlay = useCallback(async (text: string | null | undefined, lang: TtsLang) => {
    const played = await ttsPlayerRef.current?.play(text, lang);
    if (played === 'played') return;
    await speakAndWait(text, lang);
  }, []);

  /* 自動再生ループ: 英語→(間)→表面を裏返して日本語→(間)→次のカードへ、を繰り返す */
  useEffect(() => {
    if (!isAutoPlaying) return;
    const word = wordsRef.current[currentIndex];
    if (!word) { setIsAutoPlaying(false); return; }
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

    // 次のカードの音声を先に取っておき、カードの切り替わりで待たせない。
    const nextWord = wordsRef.current[currentIndex + 1] ?? wordsRef.current[0];
    if (nextWord) {
      ttsPlayerRef.current?.prefetch(nextWord.english, 'en');
      ttsPlayerRef.current?.prefetch(nextWord.japanese, 'ja');
    }

    (async () => {
      setIsFlipped(false);
      await speakForAutoPlay(word.english, 'en');
      if (cancelled) return;
      await wait(AUTOPLAY_GAP_MS);
      if (cancelled) return;
      setIsFlipped(true);
      await speakForAutoPlay(word.japanese, 'ja');
      if (cancelled) return;
      await wait(AUTOPLAY_NEXT_DELAY_MS);
      if (cancelled) return;
      // 画面消灯中はスライド演出を挟まない。演出は描画が前提なので、
      // 隠れている間に走らせても意味がないうえ、進行を遅らせるだけ。
      handleNextRef.current(!isPageHidden());
    })();

    return () => {
      cancelled = true;
      stopSpeaking();
      ttsPlayerRef.current?.stop();
    };
  }, [isAutoPlaying, currentIndex, speakForAutoPlay]);

  /* 自動再生中は画面消灯を防ぎ、バックグラウンド/ロック中も読み上げが続きやすくする (対応環境のみ) */
  useEffect(() => {
    if (!isAutoPlaying || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (released) { lock.release().catch(() => {}); return; }
        sentinel = lock;
      } catch { /* 非対応・許可なし: 読み上げ自体は続行する */ }
    };
    acquire();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) acquire();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [isAutoPlaying]);

  /* Media Session: ロック画面/通知からの再生・一時停止・前後送りに対応させる */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => setIsAutoPlaying(true));
    ms.setActionHandler('pause', () => setIsAutoPlaying(false));
    ms.setActionHandler('nexttrack', () => handleNextRef.current(true));
    ms.setActionHandler('previoustrack', () => handlePrevRef.current(true));
    return () => {
      try {
        ms.setActionHandler('play', null);
        ms.setActionHandler('pause', null);
        ms.setActionHandler('nexttrack', null);
        ms.setActionHandler('previoustrack', null);
        ms.playbackState = 'none';
      } catch { /* 非対応環境 */ }
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const word = words[currentIndex];
    if (!isAutoPlaying || !word) {
      navigator.mediaSession.playbackState = 'paused';
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: word.english,
      artist: word.japanese,
      album: 'MERKEN フラッシュカード',
    });
    navigator.mediaSession.playbackState = 'playing';
  }, [isAutoPlaying, words, currentIndex]);

  // フラッシュカードページを閉じる (アンマウントする) ときは必ず読み上げを止める。
  // バックグラウンド化 (ホーム画面遷移など) では呼ばれない —— unmount 時のみ発火する。
  useEffect(() => {
    const audio = silentAudioRef.current;
    return () => {
      stopSpeaking();
      ttsPlayerRef.current?.dispose();
      ttsPlayerRef.current = null;
      audio?.pause();
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'none'; } catch { /* 非対応環境 */ }
      }
    };
  }, []);

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setAllWords(prev => prev.map(w => (w.id === currentWord.id ? { ...w, isFavorite: newFavorite } : w)));
  };

  const handleCycleStatus = async () => {
    if (!currentWord) return;
    const newStatus = nextWordStatus(currentWord.status);
    await repository.updateWord(currentWord.id, { status: newStatus });
    setAllWords(prev => prev.map(w => (w.id === currentWord.id ? { ...w, status: newStatus } : w)));
  };

  const handleDeleteWord = async () => {
    if (!currentWord) return;
    const confirmed = window.confirm(`「${currentWord.english}」を削除しますか？`);
    if (!confirmed) return;
    await repository.deleteWord(currentWord.id);
    const remaining = words.filter((w) => w.id !== currentWord.id);
    if (allWords.length <= 1) { backToProject(); return; }
    if (currentIndex >= remaining.length) setCurrentIndex(Math.max(0, remaining.length - 1));
    setAllWords((prev) => prev.filter((w) => w.id !== currentWord.id));
    setIsFlipped(false);
  };

  /** 絞り込みを変えたら山札の先頭から。裏返し・自動再生の状態も畳む。 */
  const handleChangeFilter = useCallback((next: FlashcardFilter) => {
    triggerHaptic();
    setFilterMenuOpen(false);
    setDeckFilter(next);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsAutoPlaying(false);
    stopSpeaking();
  }, []);

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
    // 早送り中は少し引いて、指の下を高速で流れている束であることを見せる。
    if (isScrubbing) return 'translateX(0) scale(0.96)';
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

  /* ---------- 絞り込みで0枚になったとき ---------- */
  if (allWords.length > 0 && words.length === 0) {
    const label = FLASHCARD_FILTERS.find((option) => option.key === deckFilter)?.label ?? '条件';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-background)] px-8 text-center font-[var(--font-body)]">
        <Icon name="filter_alt_off" size={30} className="text-[var(--color-muted)]" />
        <p className="text-[13.5px] font-bold leading-[1.8] text-[var(--color-muted)]">
          「{label}」に当てはまる単語がありません。
        </p>
        <button
          type="button"
          onClick={() => handleChangeFilter('all')}
          className="flex h-11 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 font-display text-[13px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          すべての単語に戻す
        </button>
        <button
          type="button"
          onClick={backToProject}
          className="text-[12.5px] font-bold text-[var(--color-muted)] underline"
        >
          閉じる
        </button>
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
    {/* 自動再生中、バックグラウンドでも読み上げが止まりにくくするための無音ループ (画面には表示しない) */}
    <audio ref={silentAudioRef} src="/audio/silence-loop.wav" loop playsInline preload="auto" hidden aria-hidden="true" />
    <div className="ds-fixed-main fixed inset-0 z-30 hidden flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:flex">
      <div className="ds-fc-wrap">
        <div className="ds-quiz-head" style={{ maxWidth: 720 }}>
          <button type="button" className="x" onClick={backToProject} aria-label="閉じる">
            <Icon name="close" />
          </button>
          <div className="ds-qbar"><div className="fi" style={{ width: `${((currentIndex + 1) / Math.max(total, 1)) * 100}%` }} /></div>
          <span className="ds-qcount">{currentIndex + 1} <span className="muted" style={{ fontWeight: 500 }}>/ {total}</span></span>
          <button
            type="button"
            className="x"
            onClick={toggleAutoPlay}
            aria-label={isAutoPlaying ? '自動再生を停止' : '自動再生を開始'}
            style={isAutoPlaying ? { background: 'var(--solid-ink)', color: 'var(--color-on-ink)' } : undefined}
          >
            <Icon name={isAutoPlaying ? 'pause' : 'play_arrow'} />
          </button>
        </div>
        <div className="mono muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 4 }}>
          {favoritesOnly ? '保存済み' : collectionId ? 'コレクション' : binderName ? 'バインダー' : '単語帳'} · フラッシュカード
        </div>

        {/* 流す単語の絞り込み。0件の軸は押せない（空の山札にしないため） */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {FLASHCARD_FILTERS.map((option) => {
            const count = filterCounts[option.key];
            const active = option.key === deckFilter;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                disabled={count === 0}
                onClick={() => handleChangeFilter(option.key)}
                className={`flex h-[30px] shrink-0 items-center gap-1 rounded-full border-2 px-3 font-display text-[12px] font-extrabold transition-colors duration-100 disabled:opacity-40 ${
                  active
                    ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-surface)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
                }`}
              >
                <Icon name={option.icon} size={14} filled={active} />
                {option.label}
                <span className="font-mono text-[10px] tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="ds-fc-scene">
          <div className={'ds-fc-card' + (isFlipped ? ' flipped' : '')} onClick={handleFlip}>
            <div className="ds-fc-face front">
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); handleToggleFavorite(); }}
                aria-label="保存"
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
                {currentWord && hasDisplayableMorphology(currentMorphology) && (
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
                    <MorphologyFormulaChips morphology={currentMorphology} />
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10, whiteSpace: 'pre-line' }}>
                      {currentMorphology.explanation}
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

        {/* カード直下の点々。デスクトップでは押しっぱなしのドラッグで早送りする */}
        <div style={{ marginTop: 10 }}>
          <FlashcardScrubber
            total={total}
            currentIndex={currentIndex}
            onSeek={handleSeek}
            onScrubbingChange={handleScrubbingChange}
          />
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
            label="保存"
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

    <div className="fixed inset-x-0 top-0 z-30 flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
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

        <div className="flex items-center gap-2">
          {/* 流す単語の絞り込み（保存済み・間違えた など） */}
          <div className="relative">
            <HeaderBtn
              onClick={() => { triggerHaptic(); setFilterMenuOpen((open) => !open); }}
              active={deckFilter !== 'all' || filterMenuOpen}
              aria-label="流す単語を絞り込む"
              aria-haspopup="menu"
              aria-expanded={filterMenuOpen}
            >
              <Icon name="filter_alt" size={16} filled={deckFilter !== 'all'} />
            </HeaderBtn>
            {filterMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={() => setFilterMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default bg-transparent"
                />
                <div
                  role="menu"
                  className="absolute right-0 top-[44px] z-50 w-[210px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)]"
                >
                  {FLASHCARD_FILTERS.map((option) => {
                    const count = filterCounts[option.key];
                    const active = option.key === deckFilter;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        disabled={count === 0}
                        onClick={() => handleChangeFilter(option.key)}
                        className={`flex w-full items-center gap-2.5 border-b-2 border-[var(--color-border)] px-3.5 py-3 text-left text-[13px] font-bold last:border-b-0 disabled:opacity-40 ${
                          active ? 'bg-[var(--solid-ink)] text-[var(--color-surface)]' : 'text-[var(--solid-ink)]'
                        }`}
                      >
                        <Icon name={option.icon} size={16} filled={active} />
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        <span className="font-mono text-[11px] tabular-nums opacity-80">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <HeaderBtn
            onClick={toggleAutoPlay}
            active={isAutoPlaying}
            aria-label={isAutoPlaying ? '自動再生を停止' : '自動再生を開始'}
          >
            <Icon name={isAutoPlaying ? 'pause' : 'play_arrow'} size={16} filled={isAutoPlaying} />
          </HeaderBtn>
        </div>
      </div>

      {/* Card area (no ghost cards) */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-5">
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
            className="grid w-full grid-cols-[minmax(0,1fr)]"
            style={{
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transformStyle: 'preserve-3d',
              transition: isAnimating ? 'none' : 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'transform',
            }}
          >
            <div
              className="relative col-start-1 row-start-1 flex min-h-[380px] w-full flex-col rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-paper)] p-[22px_18px_18px]"
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
                <div className="max-w-full break-words font-mono text-xs text-[var(--color-muted)]">{currentWord?.pronunciation ?? ''}</div>
                <div
                  className="max-w-full break-words font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[var(--solid-ink)]"
                  style={{ fontSize: currentWord?.english && currentWord.english.length > 14 ? 30 : undefined }}
                >
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
                    background: 'var(--color-surface)',
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
                <h2 className="max-w-full break-words text-3xl font-bold text-white">
                  {currentWord && <TranslationDisplay word={currentWord} />}
                </h2>
                <p className="max-w-full break-words text-sm text-white/60">{currentWord?.english}</p>
                {currentWord?.pronunciation && (
                  <p className="max-w-full break-words font-mono text-xs text-white/50">{currentWord.pronunciation}</p>
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

        {/* カード直下の点々。長押し＋スワイプで山札を早送りする */}
        <div className="mt-2.5 w-full shrink-0">
          <FlashcardScrubber
            total={total}
            currentIndex={currentIndex}
            onSeek={handleSeek}
            onScrubbingChange={handleScrubbingChange}
          />
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
          icon="bookmark" label="保存"
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
