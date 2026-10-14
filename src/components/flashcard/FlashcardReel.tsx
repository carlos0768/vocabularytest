'use client';

// フラッシュカードのリール表示。縦に1枚ずつスナップさせて流し、タップで意味を出す。
// 見た目は公開単語帳のリール (`src/components/reel/ReelCard.tsx`) に揃えている。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import { reelIndexFromScroll } from '@/lib/quiz/flashcard-view';
import type { Word } from '@/types';

// 中身を描くのは表示中のカードの前後この枚数まで。数千語の単語帳でも枠だけ並べる。
const RENDER_WINDOW = 2;
// 最後のスクロールイベントからこの間 (ms) 動きが無ければ、止まったカードを現在地にする。
const SETTLE_MS = 120;

export function FlashcardReel({
  words,
  currentIndex,
  revealed,
  onSettle,
  onToggleReveal,
  onSpeak,
  onToggleFavorite,
}: {
  words: Word[];
  currentIndex: number;
  /** 現在のカードの意味を出しているか。 */
  revealed: boolean;
  /** 指を離してスクロールが止まったカードの番号。 */
  onSettle: (index: number) => void;
  onToggleReveal: () => void;
  onSpeak: (word: Word) => void;
  onToggleFavorite: (word: Word) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  // スクロール中に通過しているカード。描く範囲だけに使い、現在地は止まってから確定する。
  const [visibleIndex, setVisibleIndex] = useState(currentIndex);
  const settleTimerRef = useRef<number | null>(null);
  const positionedRef = useRef(false);
  const onSettleRef = useRef(onSettle);
  useEffect(() => { onSettleRef.current = onSettle; }, [onSettle]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setPanelHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  // 現在地が外から変わったとき (評価・自動再生・絞り込み) はそのカードまで流す。
  // 隣なら滑らかに、遠い (末尾から先頭へ戻る・初回表示) なら一瞬で飛ぶ。
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || panelHeight === 0) return;
    const target = currentIndex * panelHeight;
    const distance = Math.abs(el.scrollTop - target);
    if (distance < 2) { positionedRef.current = true; return; }
    const far = !positionedRef.current || distance > panelHeight * 1.5;
    positionedRef.current = true;
    // 飛んだ先の描画範囲は onScroll が追いかける (currentIndex の前後も常に描く)。
    el.scrollTo({ top: target, behavior: far ? 'auto' : 'smooth' });
  }, [currentIndex, panelHeight]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || panelHeight === 0) return;
    const index = reelIndexFromScroll(el.scrollTop, panelHeight, words.length);
    setVisibleIndex((prev) => (prev === index ? prev : index));
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      const current = scrollerRef.current;
      if (!current) return;
      onSettleRef.current(reelIndexFromScroll(current.scrollTop, panelHeight, words.length));
    }, SETTLE_MS);
  }, [panelHeight, words.length]);

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className="no-scrollbar min-h-0 w-full flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {words.map((word, index) => {
        const near = Math.abs(index - visibleIndex) <= RENDER_WINDOW || Math.abs(index - currentIndex) <= RENDER_WINDOW;
        return (
          <div
            key={word.id}
            className="snap-start snap-always"
            style={{ height: panelHeight || '100%' }}
          >
            {near && (
              <ReelPanel
                word={word}
                isCurrent={index === currentIndex}
                revealed={index === currentIndex && revealed}
                onToggleReveal={onToggleReveal}
                onSpeak={onSpeak}
                onToggleFavorite={onToggleFavorite}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReelPanel({
  word,
  isCurrent,
  revealed,
  onToggleReveal,
  onSpeak,
  onToggleFavorite,
}: {
  word: Word;
  isCurrent: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
  onSpeak: (word: Word) => void;
  onToggleFavorite: (word: Word) => void;
}) {
  const tags = word.partOfSpeechTags ?? [];
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-16 text-center"
      onClick={isCurrent ? onToggleReveal : undefined}
    >
      {tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-secondary-text)]"
            >
              {getPartOfSpeechLabel(tag)}
            </span>
          ))}
        </div>
      )}
      <p className="t-word-display max-w-full break-words">{word.english}</p>
      <p className="font-mono text-base text-[var(--color-secondary-text)]">{word.pronunciation || '\u00a0'}</p>

      {revealed ? (
        <div className="mt-2 flex w-full flex-col items-center gap-4 animate-[fadeIn_200ms_ease-out]">
          <div className="text-3xl font-bold leading-snug text-[var(--color-foreground)]">
            <TranslationDisplay word={word} />
          </div>
          {word.exampleSentence && (
            <div className="max-w-md space-y-1.5">
              <p className="line-clamp-3 text-base leading-relaxed text-[var(--color-foreground)]">{word.exampleSentence}</p>
              {word.exampleSentenceJa && (
                <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-secondary-text)]">{word.exampleSentenceJa}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-center gap-1 font-mono text-[10px] font-bold text-[var(--color-muted)]">
          <Icon name="touch_app" size={12} />タップで意味を表示
        </div>
      )}

      {/* 右端の縦並びボタン (発音・保存)。親指の届く下寄りに置く */}
      <div className="absolute bottom-6 right-4 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSpeak(word); }}
          aria-label="発音"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]"
        >
          <Icon name="volume_up" size={20} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(word); }}
          aria-label={word.isFavorite ? '保存を解除' : '保存'}
          aria-pressed={word.isFavorite}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] ${
            word.isFavorite ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
          }`}
        >
          <Icon name="bookmark" size={20} filled={word.isFavorite} />
        </button>
      </div>
    </div>
  );
}
