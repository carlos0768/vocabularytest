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
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white">
          <Icon name="style" size={15} filled />
        </div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]">Flashcard</span>
        <span className="font-mono text-[11px] text-[#8a857a]">フラッシュカード</span>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1.5">
        {DEMO_WORDS.map((_, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => { setFlipped(false); setTimeout(() => setIndex(i), 150); }}
            className={`h-1.5 rounded-full transition-all duration-200 ${i === index ? 'w-5 bg-[#1a1a1a]' : 'w-1.5 bg-[#1a1a1a]/20'}`}
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
            className="absolute inset-0 flex flex-col items-center justify-center rounded-[18px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-7 shadow-[4px_6px_0_#1a1a1a]"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="mb-3 rounded-full border border-[#1a1a1a]/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
              {word.pos}
            </span>
            <p className="font-display text-[clamp(28px,4vw,44px)] font-black leading-tight text-[#1a1a1a]">
              {word.en}
            </p>
            <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-[#8a857a]">
              <Icon name="touch_app" size={13} />
              タップして意味を確認
            </p>
          </div>

          {/* 裏面 */}
          <div
            className="absolute inset-0 flex flex-col justify-center rounded-[18px] border-[1.5px] border-[#1a1a1a] bg-white p-7 shadow-[4px_6px_0_#1a1a1a]"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="mb-2 rounded-full border border-[#1a1a1a]/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a857a] self-start">
              {word.pos}
            </span>
            <p className="font-display text-[20px] font-black leading-snug text-[#1a1a1a]">
              {word.ja}
            </p>
            <div className="mt-4 rounded-[10px] border border-[#1a1a1a]/10 bg-[#faf7f1] px-4 py-3">
              <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Example</p>
              <p className="text-[12px] leading-6 text-[#555]">{word.example}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-[#1a1a1a] bg-white shadow-[2px_2px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          aria-label="前のカード"
        >
          <Icon name="arrow_back" size={16} />
        </button>
        <span className="min-w-[48px] text-center font-mono text-[11px] font-bold text-[#8a857a]">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-[#1a1a1a] bg-white shadow-[2px_2px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white">
            <Icon name="quiz" size={15} filled />
          </div>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]">Quiz</span>
          <span className="font-mono text-[11px] text-[#8a857a]">4択クイズ</span>
        </div>
        <div className="rounded-[18px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-7 text-center shadow-[4px_6px_0_#1a1a1a]">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Result</p>
          <p className="mt-2 font-display text-[56px] font-black leading-none text-[#1a1a1a]">
            {score}<span className="text-2xl">/{DEMO_WORDS.length}</span>
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-[var(--color-accent)]">{pct}% 正解</p>
          <p className="mt-4 text-sm leading-7 text-[#555]">
            {pct === 100
              ? '全問正解！単語の習得度も上がりました。'
              : pct >= 60
              ? 'よくできました。間違えた単語を復習しましょう。'
              : '復習が必要です。何度も繰り返すと定着します。'}
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-5 inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[#1a1a1a] bg-white px-5 py-2.5 text-sm font-bold shadow-[2px_3px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
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
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white">
          <Icon name="quiz" size={15} filled />
        </div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]">Quiz</span>
        <span className="font-mono text-[11px] text-[#8a857a]">4択クイズ</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1a1a1a]/10">
          <div
            className="h-full rounded-full bg-[#1a1a1a] transition-all duration-300"
            style={{ width: `${(index / DEMO_WORDS.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-bold text-[#8a857a]">{index + 1}/{DEMO_WORDS.length}</span>
      </div>

      {/* Question */}
      <div className="rounded-[16px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] px-5 py-4 shadow-[3px_4px_0_#1a1a1a]">
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">
          次の英単語の意味は？
        </p>
        <p className="font-display text-[clamp(26px,3vw,36px)] font-black text-[#1a1a1a]">{word.en}</p>
        <span className="mt-1 inline-block rounded-full border border-[#1a1a1a]/20 px-2 py-0.5 font-mono text-[10px] text-[#8a857a]">
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
                  ? 'border-[#15803d] bg-[#dcfce7] text-[#15803d] shadow-[2px_3px_0_#15803d]'
                  : state === 'wrong'
                  ? 'border-[#dc2626] bg-[#fee2e2] text-[#dc2626] shadow-[2px_3px_0_#dc2626]'
                  : state === 'dim'
                  ? 'border-[#1a1a1a]/15 bg-white/50 text-[#1a1a1a]/25'
                  : 'border-[#1a1a1a] bg-white shadow-[2px_3px_0_#1a1a1a] hover:bg-[#faf7f1] active:translate-x-px active:translate-y-px active:shadow-none'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                  state === 'correct'
                    ? 'border-[#15803d] bg-[#15803d] text-white'
                    : state === 'wrong'
                    ? 'border-[#dc2626] bg-[#dc2626] text-white'
                    : state === 'dim'
                    ? 'border-[#1a1a1a]/15 text-[#1a1a1a]/25'
                    : 'border-[#1a1a1a]/30 text-[#8a857a]'
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
              ? 'border-[#15803d]/30 bg-[#dcfce7] text-[#15803d]'
              : 'border-[#dc2626]/30 bg-[#fee2e2] text-[#dc2626]'
          }`}>
            <Icon name={isCorrect ? 'check_circle' : 'cancel'} size={14} filled />
            {isCorrect ? '正解！' : `正解は「${word.options[word.correctIndex]}」`}
          </div>
          <button
            type="button"
            onClick={handleNext}
            className="flex shrink-0 items-center gap-1 rounded-[10px] border-[1.5px] border-[#1a1a1a] bg-[#1a1a1a] px-3 py-2.5 text-xs font-bold text-white shadow-[2px_2px_0_rgba(26,26,26,0.3)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
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
      className="mx-auto max-w-[1200px] border-b-[1.5px] border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24"
    >
      {/* Section heading */}
      <div className="mb-10 grid gap-5 lg:mb-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            <span className="mr-3 text-[#8a857a]">03 /</span>
            Try it yourself
          </p>
          <h2 className="mt-3 font-display text-[clamp(30px,4vw,48px)] font-black leading-[1.06] tracking-normal text-[#1a1a1a]">
            登録なしで、<br />実際に体験。
          </h2>
        </div>
        <p className="max-w-[560px] text-[15px] leading-8 text-[#555] lg:pt-8">
          フラッシュカードをめくったり、4択クイズに挑戦したり。MERKENの学習体験を、登録前に試してみてください。
        </p>
      </div>

      {/* Two demos side by side, scroll-reveal */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Flashcard — slides in from left */}
        <div
          ref={refLeft}
          className={`rounded-[20px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-6 shadow-[4px_6px_0_#1a1a1a] transition-all duration-700 ease-out md:p-8 ${
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
          className={`rounded-[20px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-6 shadow-[4px_6px_0_#1a1a1a] transition-all duration-700 ease-out md:p-8 ${
            visibleRight
              ? 'translate-x-0 opacity-100 delay-150'
              : 'translate-x-10 opacity-0'
          }`}
        >
          <QuizDemo />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-10 flex flex-col items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-[#1a1a1a]/30 bg-[#faf7f1] px-6 py-8 text-center">
        <p className="text-sm font-bold text-[#1a1a1a]">
          自分の単語帳でクイズとカードを使いたい？
        </p>
        <p className="text-[13px] leading-6 text-[#555]">
          ノートや教材を撮影するだけで、あなただけの単語帳が完成します。
        </p>
        <Link
          href="/signup?redirect=/"
          className="mt-1 inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[#1a1a1a] bg-[#1a1a1a] px-5 py-2.5 text-sm font-bold text-white shadow-[2px_3px_0_rgba(26,26,26,0.3)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
        >
          無料で始める
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>
    </section>
  );
}
