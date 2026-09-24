'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const DEMO_WORDS = [
  {
    en: 'ubiquitous',
    pos: '形容詞',
    ja: '至る所にある、遍在する',
    example: 'Smartphones are ubiquitous in modern life.',
    options: ['孤独な、孤立した', '至る所にある', '複雑な、難解な', '古代の、太古の'],
    correctIndex: 1,
  },
  {
    en: 'austere',
    pos: '形容詞',
    ja: '厳格な、簡素な',
    example: 'The room had an austere, minimalist design.',
    options: ['厳格な、簡素な', '豪華な、華やかな', '柔軟な、しなやかな', '巨大な、壮大な'],
    correctIndex: 0,
  },
  {
    en: 'lament',
    pos: '動詞',
    ja: '嘆く、惜しむ',
    example: 'She lamented the loss of her favorite notebook.',
    options: ['祝う、称える', '発見する、見つける', '嘆く、惜しむ', '無視する、忘れる'],
    correctIndex: 2,
  },
  {
    en: 'embrace',
    pos: '動詞',
    ja: '受け入れる、取り入れる',
    example: 'We should embrace new ways of learning.',
    options: ['拒絶する、断る', '破壊する、壊す', '放置する、無視する', '受け入れる、取り入れる'],
    correctIndex: 3,
  },
  {
    en: 'persistence',
    pos: '名詞',
    ja: '粘り強さ、継続すること',
    example: 'Persistence is the key to mastering vocabulary.',
    options: ['怠慢、不精', '粘り強さ、継続すること', '速度、敏速さ', '才能、素質'],
    correctIndex: 1,
  },
];

/* ── スクロール検知フック ── */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ── フラッシュカードデモ ── */
function FlashcardDemo() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const word = DEMO_WORDS[index];
  const total = DEMO_WORDS.length;

  function goNext() {
    setFlipped(false);
    setTimeout(() => setIndex((i) => (i + 1) % total), 150);
  }

  function goPrev() {
    setFlipped(false);
    setTimeout(() => setIndex((i) => (i - 1 + total) % total), 150);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Label */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--solid-ink)] text-[var(--color-on-ink)]">
          <Icon name="style" size={15} filled />
        </div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--solid-ink)]">Flashcard</span>
        <span className="font-mono text-[11px] text-[var(--color-ink-mute)]">フラッシュカード</span>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1.5">
        {DEMO_WORDS.map((_, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => { setFlipped(false); setTimeout(() => setIndex(i), 150); }}
            className={`h-1.5 rounded-full transition-all duration-200 ${i === index ? 'w-5 bg-[var(--solid-ink)]' : 'w-1.5 bg-[var(--solid-ink)]/20'}`}
            aria-label={`カード ${i + 1}`}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="cursor-pointer select-none"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setFlipped((f) => !f)}
        aria-label={flipped ? '表に戻す' : '裏を見る'}
      >
        <div
          className="relative min-h-[200px] transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* 表面 */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-paper)] p-7 shadow-[4px_6px_0_var(--solid-shadow)]"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="mb-3 rounded-full border border-[var(--solid-ink)]/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-mute)]">
              {word.pos}
            </span>
            <p className="font-display text-[clamp(28px,4vw,44px)] font-black leading-tight text-[var(--solid-ink)]">
              {word.en}
            </p>
            <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-mute)]">
              <Icon name="touch_app" size={13} />
              タップして意味を確認
            </p>
          </div>

          {/* 裏面 */}
          <div
            className="absolute inset-0 flex flex-col justify-center rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] p-7 shadow-[4px_6px_0_var(--solid-shadow)]"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="mb-2 rounded-full border border-[var(--solid-ink)]/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-mute)] self-start">
              {word.pos}
            </span>
            <p className="font-display text-[20px] font-black leading-snug text-[var(--solid-ink)]">
              {word.ja}
            </p>
            <div className="mt-4 rounded-[10px] border border-[var(--solid-ink)]/10 bg-[var(--color-paper)] px-4 py-3">
              <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-mute)]">Example</p>
              <p className="text-[12px] leading-6 text-[var(--color-ink-soft)]">{word.example}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_2px_0_var(--solid-shadow)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          aria-label="前のカード"
        >
          <Icon name="arrow_back" size={16} />
        </button>
        <span className="min-w-[48px] text-center font-mono text-[11px] font-bold text-[var(--color-ink-mute)]">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_2px_0_var(--solid-shadow)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          aria-label="次のカード"
        >
          <Icon name="arrow_forward" size={16} />
        </button>
      </div>
    </div>
  );
}

/* ── 4択クイズデモ ── */
function QuizDemo() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const word = DEMO_WORDS[index];
  const isAnswered = selected !== null;
  const isCorrect = selected === word.correctIndex;

  function handleSelect(i: number) {
    if (isAnswered) return;
    setSelected(i);
    if (i === word.correctIndex) setScore((s) => s + 1);
  }

  function handleNext() {
    if (index + 1 >= DEMO_WORDS.length) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
    }
  }

  function handleRestart() {
    setIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  }

  if (finished) {
    const pct = Math.round((score / DEMO_WORDS.length) * 100);
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--solid-ink)] text-[var(--color-on-ink)]">
            <Icon name="quiz" size={15} filled />
          </div>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--solid-ink)]">Quiz</span>
          <span className="font-mono text-[11px] text-[var(--color-ink-mute)]">4択クイズ</span>
        </div>
        <div className="rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-paper)] p-7 text-center shadow-[4px_6px_0_var(--solid-shadow)]">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-mute)]">Result</p>
          <p className="mt-2 font-display text-[56px] font-black leading-none text-[var(--solid-ink)]">
            {score}<span className="text-2xl">/{DEMO_WORDS.length}</span>
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-[var(--color-accent)]">{pct}% 正解</p>
          <p className="mt-4 text-sm leading-7 text-[var(--color-ink-soft)]">
            {pct === 100
              ? '全問正解！単語の習得度も上がりました。'
              : pct >= 60
              ? 'よくできました。間違えた単語を復習しましょう。'
              : '復習が必要です。何度も繰り返すと定着します。'}
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-5 inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-bold shadow-[2px_3px_0_var(--solid-shadow)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          >
            <Icon name="replay" size={15} />
            もう一度
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Label */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--solid-ink)] text-[var(--color-on-ink)]">
          <Icon name="quiz" size={15} filled />
        </div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--solid-ink)]">Quiz</span>
        <span className="font-mono text-[11px] text-[var(--color-ink-mute)]">4択クイズ</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--solid-ink)]/10">
          <div
            className="h-full rounded-full bg-[var(--solid-ink)] transition-all duration-300"
            style={{ width: `${(index / DEMO_WORDS.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--color-ink-mute)]">{index + 1}/{DEMO_WORDS.length}</span>
      </div>

      {/* Question */}
      <div className="rounded-[16px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-paper)] px-5 py-4 shadow-[3px_4px_0_var(--solid-shadow)]">
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-mute)]">
          次の英単語の意味は？
        </p>
        <p className="font-display text-[clamp(26px,3vw,36px)] font-black text-[var(--solid-ink)]">{word.en}</p>
        <span className="mt-1 inline-block rounded-full border border-[var(--solid-ink)]/20 px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-mute)]">
          {word.pos}
        </span>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 gap-2">
        {word.options.map((opt, i: number) => {
          let state: 'default' | 'correct' | 'wrong' | 'dim' = 'default';
          if (isAnswered) {
            if (i === word.correctIndex) state = 'correct';
            else if (i === selected) state = 'wrong';
            else state = 'dim';
          }
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleSelect(i)}
              disabled={isAnswered}
              className={`flex items-center gap-3 rounded-[12px] border-[1.5px] px-4 py-3 text-left text-sm font-bold transition-all duration-150 ${
                state === 'correct'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-[2px_3px_0_#15803d]'
                  : state === 'wrong'
                  ? 'border-[var(--color-danger)] bg-[var(--color-error-light)] text-[var(--color-danger)] shadow-[2px_3px_0_#dc2626]'
                  : state === 'dim'
                  ? 'border-[var(--solid-ink)]/15 bg-[var(--color-surface)]/50 text-[var(--solid-ink)]/25'
                  : 'border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-shadow)] hover:bg-[var(--color-paper)] active:translate-x-px active:translate-y-px active:shadow-none'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                  state === 'correct'
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : state === 'wrong'
                    ? 'border-[var(--color-danger)] bg-[var(--color-danger)] text-[var(--color-on-accent)]'
                    : state === 'dim'
                    ? 'border-[var(--solid-ink)]/15 text-[var(--solid-ink)]/25'
                    : 'border-[var(--solid-ink)]/30 text-[var(--color-ink-mute)]'
                }`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 leading-5">{opt}</span>
              {state === 'correct' && <Icon name="check_circle" size={15} filled className="shrink-0" />}
              {state === 'wrong' && <Icon name="cancel" size={15} filled className="shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Feedback + Next */}
      {isAnswered && (
        <div className="flex items-center gap-2">
          <div className={`flex flex-1 items-center gap-2 rounded-[10px] border px-3 py-2.5 text-xs font-bold ${
            isCorrect
              ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-accent)]'
              : 'border-[var(--color-danger)]/30 bg-[var(--color-error-light)] text-[var(--color-danger)]'
          }`}>
            <Icon name={isCorrect ? 'check_circle' : 'cancel'} size={14} filled />
            {isCorrect ? '正解！' : `正解は「${word.options[word.correctIndex]}」`}
          </div>
          <button
            type="button"
            onClick={handleNext}
            className="flex shrink-0 items-center gap-1 rounded-[10px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-xs font-bold text-[var(--color-on-ink)] shadow-[2px_2px_0_color-mix(in_srgb,_var(--solid-ink)_30%,_transparent)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          >
            {index + 1 >= DEMO_WORDS.length ? '結果へ' : '次へ'}
            <Icon name="arrow_forward" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── メインのデモセクション ── */
export function LpDemoSection() {
  const { ref: refLeft, visible: visibleLeft } = useScrollReveal(0.1);
  const { ref: refRight, visible: visibleRight } = useScrollReveal(0.1);

  return (
    <section
      id="demo"
      className="mx-auto max-w-[1200px] border-b-[1.5px] border-[var(--solid-ink)] px-5 py-16 md:px-10 lg:py-24"
    >
      {/* Section heading */}
      <div className="mb-10 grid gap-5 lg:mb-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            <span className="mr-3 text-[var(--color-ink-mute)]">03 /</span>
            Try it yourself
          </p>
          <h2 className="mt-3 font-display text-[clamp(30px,4vw,48px)] font-black leading-[1.06] tracking-normal text-[var(--solid-ink)]">
            登録なしで、<br />実際に体験。
          </h2>
        </div>
        <p className="max-w-[560px] text-[15px] leading-8 text-[var(--color-ink-soft)] lg:pt-8">
          フラッシュカードをめくったり、4択クイズに挑戦したり。MERKENの学習体験を、登録前に試してみてください。
        </p>
      </div>

      {/* Two demos side by side, scroll-reveal */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Flashcard — slides in from left */}
        <div
          ref={refLeft}
          className={`rounded-[20px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-paper)] p-6 shadow-[4px_6px_0_var(--solid-shadow)] transition-all duration-700 ease-out md:p-8 ${
            visibleLeft
              ? 'translate-x-0 opacity-100'
              : '-translate-x-10 opacity-0'
          }`}
        >
          <FlashcardDemo />
        </div>

        {/* Quiz — slides in from right, slightly delayed */}
        <div
          ref={refRight}
          className={`rounded-[20px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-paper)] p-6 shadow-[4px_6px_0_var(--solid-shadow)] transition-all duration-700 ease-out md:p-8 ${
            visibleRight
              ? 'translate-x-0 opacity-100 delay-150'
              : 'translate-x-10 opacity-0'
          }`}
        >
          <QuizDemo />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-10 flex flex-col items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-[var(--solid-ink)]/30 bg-[var(--color-paper)] px-6 py-8 text-center">
        <p className="text-sm font-bold text-[var(--solid-ink)]">
          自分の単語帳でクイズとカードを使いたい？
        </p>
        <p className="text-[13px] leading-6 text-[var(--color-ink-soft)]">
          ノートや教材を撮影するだけで、あなただけの単語帳が完成します。
        </p>
        <Link
          href="/signup?redirect=/"
          className="mt-1 inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-ink)] shadow-[2px_3px_0_color-mix(in_srgb,_var(--solid-ink)_30%,_transparent)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
        >
          無料で始める
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>
    </section>
  );
}
