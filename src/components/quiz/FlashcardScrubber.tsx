'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  SCRUB_HOLD_MS,
  SCRUB_MOVE_THRESHOLD_PX,
  getScrubDots,
  getScrubIndexFromRatio,
  getScrubRatioFromPosition,
  type ScrubDotKind,
} from '@/lib/quiz/flashcard-scrubber';
import { triggerHaptic } from '@/lib/haptics';

/**
 * カードの真下に置く「点々スクラバー」。
 *
 * Instagram のドットのように薄い点を並べ、そこを長押し（またはそのまま横へ
 * スワイプ）すると、指の位置に対応するカードへ即座に飛ぶ。押している間ずっと
 * 追従するので、指を滑らせるだけで山札が爆速で流れる。
 *
 * - 長押し / 横スワイプ = スクラブ開始。離すまで指に追従
 * - 短く叩いただけ = 何も起きない（触れただけで山札が飛ばないように）
 *
 * 点は最大5個。送り幅を決めるのは点ではなく帯（trackRef）の幅全体なので、
 * 何百枚あっても左端から右端まで一振りで流せる。
 *
 * 送りの適用は requestAnimationFrame で1フレーム1回に間引く。pointermove は
 * 端末によっては1フレームに何度も飛んでくるので、そのまま setState に流すと
 * 描画が追いつかず、逆に「重い早送り」になる。
 */

const HINT_STORAGE_KEY = 'flashcard-scrubber-hint-seen';

/**
 * 「長押しで早送り」の案内を出すかどうか。一度でも使った人には二度と出さない。
 *
 * localStorage は React の外の状態なので、useSyncExternalStore で読む。
 * サーバー側スナップショットは「見たことがある」= 出さない を返す。案内は
 * ハイドレート後に出れば十分で、先に出しておくと初回描画がちらつく。
 */
let hintSeenCache: boolean | null = null;
const hintListeners = new Set<() => void>();

function subscribeHintSeen(listener: () => void): () => void {
  hintListeners.add(listener);
  return () => { hintListeners.delete(listener); };
}

function getHintSeen(): boolean {
  if (hintSeenCache === null) {
    try {
      hintSeenCache = window.localStorage.getItem(HINT_STORAGE_KEY) === '1';
    } catch {
      hintSeenCache = true;
    }
  }
  return hintSeenCache;
}

function getHintSeenOnServer(): boolean {
  return true;
}

/**
 * 点の直径 (px)。
 * 'edge'（＝その先が省略されている側の端）は小さく描いて続きがあることを示す。
 * 早送り中はひとまわり大きくして、掴んでいる感じを出す。
 */
function getDotSize(kind: ScrubDotKind, scrubbing: boolean): number {
  if (kind === 'active') return scrubbing ? 9 : 7;
  if (kind === 'edge') return scrubbing ? 4 : 3;
  return scrubbing ? 6 : 5;
}

function markHintSeen(): void {
  if (hintSeenCache === true) return;
  hintSeenCache = true;
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, '1');
  } catch {
    /* プライベートモード等で保存できなくても操作は成立する */
  }
  for (const listener of hintListeners) listener();
}

export function FlashcardScrubber({
  total,
  currentIndex,
  tone = 'light',
  onSeek,
  onScrubbingChange,
}: {
  /** 山札の枚数 */
  total: number;
  /** 今表示しているカードの番号（0起点） */
  currentIndex: number;
  /** 置く場所の地色。dark はカード裏面などの濃い背景用 */
  tone?: 'light' | 'dark';
  /** 飛び先が変わるたびに呼ぶ（1フレーム1回まで） */
  onSeek: (index: number) => void;
  /** スクラブの開始・終了。読み上げの停止や重い表示の抑制に使う */
  onScrubbingChange?: (scrubbing: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const hintSeen = useSyncExternalStore(subscribeHintSeen, getHintSeen, getHintSeenOnServer);

  const dots = useMemo(() => getScrubDots(total, currentIndex), [total, currentIndex]);

  /* --- ポインタ操作の可変状態。再レンダーを挟まずに読み書きしたいので ref --- */
  const holdTimerRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const pendingXRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastIndexRef = useRef(currentIndex);
  const onSeekRef = useRef(onSeek);
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);
  useEffect(() => { onScrubbingChangeRef.current = onScrubbingChange; }, [onScrubbingChange]);

  const totalRef = useRef(total);
  useEffect(() => { totalRef.current = total; }, [total]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  /**
   * 指の x からカードを決めて送る。カードが1枚動くたびに短く震わせて、
   * 目で追えない速さで流していても「今めくった」手応えが指に残るようにする。
   * 呼び出し自体が1フレーム1回に間引かれているので、震えの上限も同じ。
   */
  const applyPosition = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = getScrubRatioFromPosition(clientX, rect.left, rect.width);
    const index = getScrubIndexFromRatio(ratio, totalRef.current);
    if (index !== lastIndexRef.current) {
      lastIndexRef.current = index;
      triggerHaptic(5);
    }
    onSeekRef.current(index);
  }, []);

  /** pointermove の嵐を1フレーム1回に間引く */
  const scheduleApply = useCallback((clientX: number) => {
    pendingXRef.current = clientX;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const x = pendingXRef.current;
      pendingXRef.current = null;
      if (x !== null && scrubbingRef.current) applyPosition(x);
    });
  }, [applyPosition]);

  const beginScrub = useCallback((clientX: number) => {
    if (scrubbingRef.current) return;
    clearHoldTimer();
    scrubbingRef.current = true;
    setIsScrubbing(true);
    markHintSeen();
    triggerHaptic(14);
    onScrubbingChangeRef.current?.(true);
    applyPosition(clientX);
  }, [applyPosition, clearHoldTimer]);

  const endScrub = useCallback(() => {
    clearHoldTimer();
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingXRef.current = null;
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setIsScrubbing(false);
    onScrubbingChangeRef.current?.(false);
  }, [clearHoldTimer]);

  useEffect(() => endScrub, [endScrub]);

  // スクラブしていない間は、外からの送り（次へ/自動再生）に合わせて
  // 振動の基準にしているカード番号を追従させる。
  useEffect(() => {
    if (!scrubbingRef.current) lastIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (total <= 1 || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    const clientX = e.clientX;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => beginScrub(clientX), SCRUB_HOLD_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current) {
      scheduleApply(e.clientX);
      return;
    }
    if (holdTimerRef.current === null) return;
    // 長押しを待たずに横へ動き出したら、それはもう早送りの意思とみなす。
    // 縦に逃げた指（画面スクロール）では始めない。
    const dx = Math.abs(e.clientX - startXRef.current);
    const dy = Math.abs(e.clientY - startYRef.current);
    if (dx > SCRUB_MOVE_THRESHOLD_PX && dx > dy) beginScrub(e.clientX);
    else if (dy > SCRUB_MOVE_THRESHOLD_PX * 2) clearHoldTimer();
  };

  const handlePointerUp = () => {
    if (scrubbingRef.current) {
      endScrub();
      return;
    }
    // 長押しに届かずに離した＝ただのタップ。何もしない。
    // 点はあくまで早送りのための帯で、触れただけでカードが動くと、
    // 画面下端を持ち直しただけで山札が飛んでしまう。
    clearHoldTimer();
  };

  if (dots.length <= 1) return null;

  const dark = tone === 'dark';
  const idleDot = dark ? 'rgba(255,255,255,0.28)' : 'rgba(26,26,26,0.18)';
  const activeColor = dark ? '#fff' : 'var(--solid-ink)';

  return (
    <div className="relative flex w-full flex-col items-center select-none">
      {/* 当たり判定（＝送り幅の基準）は横いっぱい。点はその中央に5個だけ置く。 */}
      <div
        role="slider"
        tabIndex={-1}
        aria-label="カードの早送り"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentIndex + 1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={endScrub}
        onContextMenu={(e) => e.preventDefault()}
        className="flex w-full cursor-pointer items-center justify-center"
        style={{
          height: isScrubbing ? 32 : 24,
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
          transition: 'height 150ms ease-out',
        }}
      >
        <div
          ref={trackRef}
          className="flex h-full w-full max-w-[280px] items-center justify-center rounded-full transition-colors duration-150"
          style={{
            background: isScrubbing ? (dark ? 'rgba(255,255,255,0.12)' : 'rgba(26,26,26,0.06)') : 'transparent',
          }}
        >
          {/* key はカード番号ではなくスロット位置。窓がずれても同じ要素が
              残るので、点は入れ替わらずその場で大きさだけ変わる。 */}
          {dots.map((dot, slot) => {
            const size = getDotSize(dot.kind, isScrubbing);
            return (
              <span key={slot} className="flex shrink-0 justify-center" style={{ width: 14 }}>
                <span
                  className="shrink-0 self-center rounded-full transition-all duration-150"
                  style={{
                    width: size,
                    height: size,
                    background: dot.kind === 'active' ? activeColor : idleDot,
                  }}
                />
              </span>
            );
          })}
        </div>
      </div>

      {!hintSeen && !isScrubbing && (
        <div className="pointer-events-none mt-0.5 font-mono text-[9px] font-bold tracking-[0.02em] text-[var(--color-muted)] opacity-70">
          長押ししてスワイプで早送り
        </div>
      )}
    </div>
  );
}
