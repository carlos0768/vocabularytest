'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * LP（ゲスト向けランディング）のリール紹介セクション。
 * 実装（`/reels`）に合わせた縦スクロールのミニデモを置き、
 * 「単語が1枚ずつ流れてくる → 気に入った単語帳をその場で取り込む」
 * という体験を登録前に伝える。
 */

type ReelDemoCard = {
  english: string;
  pronunciation: string;
  pos: string;
  japanese: string;
  morphology: { text: string; meaningJa: string; kind: 'root' | 'affix' }[];
  explanation: string;
  book: { title: string; owner: string; wordCount: number; official: boolean };
};

const REEL_DEMO_CARDS: ReelDemoCard[] = [
  {
    english: 'unanimous',
    pronunciation: '/juːˈnænɪməs/',
    pos: '形容詞',
    japanese: '満場一致の',
    morphology: [
      { text: 'un(i)', meaningJa: '1つ', kind: 'affix' },
      { text: 'anim', meaningJa: '心', kind: 'root' },
      { text: 'ous', meaningJa: '形容詞化', kind: 'affix' },
    ],
    explanation: '「心が1つ」から、全員の意見がそろっている＝満場一致の。',
    book: { title: '英検準1級 コア単語', owner: '公式単語帳', wordCount: 420, official: true },
  },
  {
    english: 'transparent',
    pronunciation: '/trænsˈpærənt/',
    pos: '形容詞',
    japanese: '透明な、明白な',
    morphology: [
      { text: 'trans', meaningJa: '越えて', kind: 'affix' },
      { text: 'par', meaningJa: '現れる', kind: 'root' },
      { text: 'ent', meaningJa: '形容詞化', kind: 'affix' },
    ],
    explanation: '「向こう側まで現れて見える」から、透明な・隠しごとのない。',
    book: { title: '共通テスト頻出300', owner: 'みさき', wordCount: 300, official: false },
  },
  {
    english: 'reluctant',
    pronunciation: '/rɪˈlʌktənt/',
    pos: '形容詞',
    japanese: '気が進まない、いやがる',
    morphology: [
      { text: 're', meaningJa: '反対に', kind: 'affix' },
      { text: 'luct', meaningJa: 'もがく', kind: 'root' },
      { text: 'ant', meaningJa: '形容詞化', kind: 'affix' },
    ],
    explanation: '「逆らってもがいている」状態から、気が進まない。',
    book: { title: '長文で出会った単語', owner: 'ken', wordCount: 128, official: false },
  },
];

const REEL_POINTS = [
  {
    icon: 'swipe_vertical',
    title: '縦スワイプで、次の単語へ',
    body: '公開されている単語帳と公式単語帳から、単語が1枚ずつ流れてきます。すき間時間にスクロールするだけで新しい語彙に出会えます。',
  },
  {
    icon: 'flip',
    title: 'めくって意味を確認',
    body: '表は英単語と発音記号だけ。左右のスワイプかタップで和訳の面に切り替わるので、フラッシュカードのように使えます。',
  },
  {
    icon: 'hub',
    title: '語源つきカードは1画面で',
    body: '語源が用意されている単語は、接頭辞・語根・接尾辞の組み立てと解説をまとめて表示。丸暗記にしないための手がかりが付きます。',
  },
  {
    icon: 'library_add',
    title: '出典の単語帳をワンタップで取り込み',
    body: 'カードの下には、その単語が入っている単語帳と作成者が出ます。気に入ったらその場で自分の単語帳としてまるごと追加できます。',
  },
];

const CARD_INTERVAL_MS = 4200;

export function LpReelSection() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % REEL_DEMO_CARDS.length);
    }, CARD_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      id="reels"
      className="mx-auto max-w-[1200px] border-b-2 border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24"
    >
      <div className="mb-10 grid gap-5 lg:mb-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            <span className="mr-3 text-[#8a857a]">04 /</span>
            Reels
          </p>
          <h2 className="mt-3 font-display text-[clamp(30px,4vw,48px)] font-black leading-[1.06] tracking-normal text-[#1a1a1a]">
            スワイプするだけで、<br />単語に出会う。
          </h2>
        </div>
        <p className="max-w-[560px] text-[15px] leading-8 text-[#555] lg:pt-8">
          リールは、みんなが公開した単語帳と公式単語帳の単語が1枚ずつ流れてくる縦スクロールのフィードです。単語帳を自分で作る前でも、めくりながら語彙を増やせます。
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {REEL_POINTS.map((point) => (
            <article
              key={point.title}
              className="rounded-[16px] border-2 border-[#1a1a1a] bg-[#faf7f1] p-6 shadow-[4px_6px_0_#1a1a1a]"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white">
                <Icon name={point.icon} size={22} />
              </div>
              <h3 className="font-display text-lg font-black">{point.title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-[#555]">{point.body}</p>
            </article>
          ))}

          <div className="sm:col-span-2 rounded-[16px] border-2 border-dashed border-[#1a1a1a]/30 bg-[#faf7f1] px-6 py-5">
            <p className="text-[13px] leading-7 text-[#555]">
              リールの閲覧は<strong className="font-bold text-[#1a1a1a]">無料プランでも1日50枚まで</strong>使えます（ログインが必要です）。Proプランなら枚数の上限なし・広告なしで見続けられます。
            </p>
            <Link
              href="/signup?redirect=/reels"
              className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border-2 border-[#1a1a1a] bg-[#1a1a1a] px-6 text-sm font-bold text-white shadow-[2px_3px_0_rgba(26,26,26,0.3)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
            >
              リールを見てみる
              <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
        </div>

        <ReelPhoneDemo
          index={index}
          onSelect={setIndex}
          onPauseChange={setPaused}
        />
      </div>
    </section>
  );
}

function ReelPhoneDemo({
  index,
  onSelect,
  onPauseChange,
}: {
  index: number;
  onSelect: (next: number) => void;
  onPauseChange: (paused: boolean) => void;
}) {
  const total = REEL_DEMO_CARDS.length;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative mx-auto w-full max-w-[280px] rotate-[1.5deg] rounded-[36px] border-2 border-[#1a1a1a] bg-[#1a1a1a] p-2 shadow-[6px_8px_0_#1a1a1a]"
        onMouseEnter={() => onPauseChange(true)}
        onMouseLeave={() => onPauseChange(false)}
        onFocus={() => onPauseChange(true)}
        onBlur={() => onPauseChange(false)}
      >
        <div className="relative h-[520px] overflow-hidden rounded-[28px] bg-[#fffdf7]">
          <div className="absolute left-1/2 top-2 z-20 h-[20px] w-[80px] -translate-x-1/2 rounded-full bg-[#1a1a1a]" />

          <div
            className="h-full transition-transform duration-500 ease-out"
            style={{ transform: `translateY(-${index * 100}%)` }}
          >
            {REEL_DEMO_CARDS.map((card) => (
              <ReelDemoCardView key={card.english} card={card} />
            ))}
          </div>

          {/* フィード内の位置インジケーター（実装の縦スナップに対応） */}
          <div className="pointer-events-none absolute right-2.5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5">
            {REEL_DEMO_CARDS.map((card, cardIndex) => (
              <span
                key={card.english}
                className={`w-1.5 rounded-full transition-all duration-200 ${
                  cardIndex === index ? 'h-5 bg-[#1a1a1a]' : 'h-1.5 bg-[#1a1a1a]/25'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          aria-label="前のリールカード"
          onClick={() => onSelect((index - 1 + total) % total)}
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#1a1a1a] bg-[#faf7f1] text-[#1a1a1a] shadow-[2px_3px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
        >
          <Icon name="keyboard_arrow_up" size={20} />
        </button>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8a857a]">
          Swipe to next word
        </p>
        <button
          type="button"
          aria-label="次のリールカード"
          onClick={() => onSelect((index + 1) % total)}
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#1a1a1a] bg-[#faf7f1] text-[#1a1a1a] shadow-[2px_3px_0_#1a1a1a] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
        >
          <Icon name="keyboard_arrow_down" size={20} />
        </button>
      </div>
    </div>
  );
}

function ReelDemoCardView({ card }: { card: ReelDemoCard }) {
  return (
    <div className="flex h-full flex-col px-5 pb-4 pt-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className="rounded-full border border-[#1a1a1a]/25 bg-[#f3f0e9] px-2.5 py-0.5 text-[11px] font-bold text-[#555]">
          {card.pos}
        </span>
        <p className="font-display text-[28px] font-black leading-tight text-[#1a1a1a]">
          {card.english}
        </p>
        <p className="font-mono text-xs text-[#8a857a]">{card.pronunciation}</p>
        <p className="text-lg font-bold text-[#1a1a1a]">{card.japanese}</p>

        <div className="mt-1 flex w-full flex-col items-center gap-2 border-t border-[#1a1a1a]/15 pt-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#8a857a]">
            語源
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5">
            {card.morphology.map((part, partIndex) => (
              <span key={part.text} className="flex items-center gap-1">
                {partIndex > 0 && <span className="text-xs font-bold text-[#8a857a]">＋</span>}
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                    part.kind === 'root'
                      ? 'border-[#1a1a1a]/25 bg-[#f3f0e9] text-[#1a1a1a]'
                      : 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent-ink)]'
                  }`}
                >
                  {part.text}
                  <span className="ml-1 text-[10px] font-semibold opacity-80">({part.meaningJa})</span>
                </span>
              </span>
            ))}
          </div>
          <p className="text-[11px] leading-5 text-[#555]">{card.explanation}</p>
        </div>
      </div>

      {/* 出典の単語帳カード（実装の ReelBookCard に対応） */}
      <div className="flex items-center gap-2.5 rounded-[12px] border-2 border-[#1a1a1a] bg-white p-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px] border border-[#1a1a1a]/20 bg-[#f3f0e9] text-[#8a857a]">
          <Icon name="menu_book" size={18} />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[12px] font-bold text-[#1a1a1a]">{card.book.title}</p>
          <p className="truncate text-[10px] text-[#8a857a]">
            <span className={card.book.official ? 'font-bold text-[var(--color-accent)]' : ''}>
              {card.book.owner}
            </span>
            {' ・ '}
            {card.book.wordCount}語
          </p>
        </div>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#1a1a1a] bg-white text-[#1a1a1a]">
          <Icon name="add" size={18} />
        </span>
      </div>
    </div>
  );
}
