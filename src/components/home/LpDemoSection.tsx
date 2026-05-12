'use client';

import { useState } from 'react';
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

type TabType = 'flashcard' | 'quiz';

/* ── タブボタン ── */
function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-[12px] px-4 py-3 text-sm font-bold transition-all duration-150 ${
        active
          ? 'border-[1.5px] border-[#1a1a1a] bg-[#1a1a1a] text-white shadow-[2px_3px_0_rgba(26,26,26,0.25)]'
          : 'text-[#8a857a] hover:text-[#1a1a1a]'
      }`}
    >
      <Icon name={icon} size={16} filled={active} />
      {label}
    </button>
  );
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
    <div className="flex flex-col items-center gap-6">
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
        className="w-full max-w-[400px] cursor-pointer select-none"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setFlipped((f) => !f)}
        aria-label={flipped ? '表に戻す' : '裏を見る'}
      >
        <div
          className="relative min-h-[220px] transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* 表面 */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-[20px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-8 shadow-[4px_6px_0_#1a1a1a]"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="mb-3 rounded-full border border-[#1a1a1a]/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
              {word.pos}
            </span>
            <p className="font-display text-[clamp(32px,6vw,52px)] font-black leading-tight text-[#1a1a1a]">
              {word.en}
            </p>
            <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-[#8a857a]">
              <Icon name="touch_app" size={13} />
              タップして意味を確認
            </p>
          </div>

          {/* 裏面 */}
          <div
            className="absolute inset-0 flex flex-col justify-center rounded-[20px] border-[1.5px] border-[#1a1a1a] bg-white p-8 shadow-[4px_6px_0_#1a1a1a]"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="mb-2 rounded-full border border-[#1a1a1a]/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
              {word.pos}
            </span>
            <p className="font-display text-[22px] font-black leading-snug text-[#1a1a1a]">
              {word.ja}
            </p>
            <div className="mt-5 rounded-[12px] border border-[#1a1a1a]/10 bg-[#faf7f1] px-4 py-3">
              <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Example</p>
              <p className="text-[13px] leading-6 text-[#555]">{word.example}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[#1a1a1a] bg-white shadow-[2px_2px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          aria-label="前のカード"
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <span className="min-w-[52px] text-center font-mono text-[11px] font-bold text-[#8a857a]">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[#1a1a1a] bg-white shadow-[2px_2px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          aria-label="次のカード"
        >
          <Icon name="arrow_forward" size={18} />
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
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="w-full max-w-[400px] rounded-[20px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-8 text-center shadow-[4px_6px_0_#1a1a1a]">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Result</p>
          <p className="mt-2 font-display text-[60px] font-black leading-none text-[#1a1a1a]">
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
        </div>
        <button
          type="button"
          onClick={handleRestart}
          className="inline-flex items-center gap-2 rounded-[12px] border-[1.5px] border-[#1a1a1a] bg-white px-5 py-3 text-sm font-bold shadow-[2px_3px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
        >
          <Icon name="replay" size={16} />
          もう一度
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1a1a1a]/10">
          <div
            className="h-full rounded-full bg-[#1a1a1a] transition-all duration-300"
            style={{ width: `${((index) / DEMO_WORDS.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-bold text-[#8a857a]">{index + 1}/{DEMO_WORDS.length}</span>
      </div>

      {/* Question */}
      <div className="rounded-[16px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-6 shadow-[3px_4px_0_#1a1a1a]">
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">
          次の英単語の意味は？
        </p>
        <p className="font-display text-[clamp(28px,5vw,40px)] font-black text-[#1a1a1a]">{word.en}</p>
        <span className="mt-1 inline-block rounded-full border border-[#1a1a1a]/20 px-2 py-0.5 font-mono text-[10px] text-[#8a857a]">
          {word.pos}
        </span>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
              className={`relative flex items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left text-sm font-bold transition-all duration-150 ${
                state === 'correct'
                  ? 'border-[#15803d] bg-[#dcfce7] text-[#15803d] shadow-[2px_3px_0_#15803d]'
                  : state === 'wrong'
                  ? 'border-[#dc2626] bg-[#fee2e2] text-[#dc2626] shadow-[2px_3px_0_#dc2626]'
                  : state === 'dim'
                  ? 'border-[#1a1a1a]/20 bg-white/50 text-[#1a1a1a]/30'
                  : 'border-[#1a1a1a] bg-white shadow-[2px_3px_0_#1a1a1a] hover:bg-[#faf7f1] active:translate-x-px active:translate-y-px active:shadow-none'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                  state === 'correct'
                    ? 'border-[#15803d] bg-[#15803d] text-white'
                    : state === 'wrong'
                    ? 'border-[#dc2626] bg-[#dc2626] text-white'
                    : state === 'dim'
                    ? 'border-[#1a1a1a]/20 text-[#1a1a1a]/30'
                    : 'border-[#1a1a1a]/30 text-[#8a857a]'
                }`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 leading-5">{opt}</span>
              {state === 'correct' && <Icon name="check_circle" size={16} filled className="shrink-0" />}
              {state === 'wrong' && <Icon name="cancel" size={16} filled className="shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Next button */}
      {isAnswered && (
        <div className="flex items-center gap-3">
          <div className={`flex flex-1 items-center gap-2 rounded-[12px] border px-4 py-3 text-sm font-bold ${
            isCorrect
              ? 'border-[#15803d]/30 bg-[#dcfce7] text-[#15803d]'
              : 'border-[#dc2626]/30 bg-[#fee2e2] text-[#dc2626]'
          }`}>
            <Icon name={isCorrect ? 'check_circle' : 'cancel'} size={16} filled />
            {isCorrect ? '正解！' : `不正解。正解は「${word.options[word.correctIndex]}」`}
          </div>
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-[12px] border-[1.5px] border-[#1a1a1a] bg-[#1a1a1a] px-4 py-3 text-sm font-bold text-white shadow-[2px_3px_0_rgba(26,26,26,0.3)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
          >
            {index + 1 >= DEMO_WORDS.length ? '結果を見る' : '次へ'}
            <Icon name="arrow_forward" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── メインのデモセクション ── */
export function LpDemoSection() {
  const [tab, setTab] = useState<TabType>('flashcard');

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

      <div className="mx-auto max-w-[640px]">
        {/* Tab bar */}
        <div className="mb-7 flex gap-2 rounded-[16px] border-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-1.5 shadow-[3px_4px_0_#1a1a1a]">
          <TabBtn
            active={tab === 'flashcard'}
            onClick={() => setTab('flashcard')}
            icon="style"
            label="フラッシュカード"
          />
          <TabBtn
            active={tab === 'quiz'}
            onClick={() => setTab('quiz')}
            icon="quiz"
            label="4択クイズ"
          />
        </div>

        {/* Demo content */}
        <div className="min-h-[360px]">
          {tab === 'flashcard' ? <FlashcardDemo /> : <QuizDemo />}
        </div>

        {/* CTA */}
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-[#1a1a1a]/30 bg-[#faf7f1] px-6 py-6 text-center">
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
      </div>
    </section>
  );
}
