'use client';

/**
 * 単語帳の単語一覧の行。単語帳詳細 (/project/[id]) と
 * 単語帳をまたぐ単語一覧 (/words) で共用する。
 *
 * 元は project/[id]/page.tsx 内のローカル定義だったものを、同じ見た目・
 * 同じ操作 (3段チェックボックス / 語彙タイプ / ブックマーク) を他の画面でも
 * 使えるようにここへ切り出した。
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { getVocabularyTypeLabel, getVocabularyTypeShortLabel } from '@/lib/vocabulary-type';
import { STATUS_LABELS } from '@/lib/words/word-filter';
import {
  getNextWordStatus,
  getWordStatusForStep,
  getWordStatusStep,
} from '@/lib/words/status-cycle';
import type { VocabularyType, Word, WordStatus } from '@/types';

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

export function posShort(tag: string): string {
  const jp = POS_JP[tag] ?? tag;
  return `(${jp[0]})`;
}

const PP_ARIA: Record<WordStatus, string> = { new: '未学習', review: '学習中', active: '定着中', mastered: '習得済み' };

/**
 * 塗られたマスの色。段階ごとに色を変える (黄緑 = 習得 / 青 = 定着中 / オレンジ = 学習中)。
 *
 * 色は「そのマスが何段目か」ではなく現在の段階で決まるので、定着中なら2マスとも青、
 * 習得なら3マスとも黄緑になる。段数と色の両方が同じことを指すので、色だけ・数だけ
 * どちらを見ても習得度が分かる。未学習は塗らない (白のまま)。
 *
 * 青とオレンジはデスクトップの一覧の点 (`.c-active` / `.c-review`) と同じ色。
 * 習得だけは黄緑を使い、緑系のアクセント色 (リンクや Pro 表示) と取り違えないようにする。
 */
const PP_FILL: Record<WordStatus, string> = {
  new: 'transparent',
  review: 'var(--color-warning)',
  active: '#2563eb',
  mastered: '#84cc16',
};

/**
 * 習得度のラベル (習得 / 定着中 / 学習中 / 未学習)。
 *
 * 3マスだけだと「何段目まで塗られているか」は見えても、その段が4段階の
 * どれなのかは覚えていないと読み取れない。デスクトップの一覧は行ごとに
 * 文言を出しているので (DesktopProjectDetail)、モバイルの行にもマスの下に
 * 同じ文言を添える。文言は `STATUS_LABELS` を共用して表記ゆれを防ぐ。
 *
 * 色はマスと同じ黒一色にしている (未学習だけ淡く落とす)。段階そのものは
 * マスが示しているので、ここで色を増やすと行の情報量が上がるだけで、
 * ダークモードでのコントラストも取りづらい。
 */
export function WordStatusLabel({ status }: { status: WordStatus }) {
  return (
    <span
      className="font-display text-[8.5px] font-bold leading-none tracking-[-0.02em]"
      style={{ color: status === 'new' ? 'var(--color-muted)' : 'var(--solid-ink)' }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatusSquares({
  wordId,
  status,
  onStatusChange,
  className,
}: {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
  className?: string;
}) {
  const [filledCount, setFilledCount] = useState(() => getWordStatusStep(status));

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFilledCount(getWordStatusStep(status));
    });
    return () => { cancelled = true; };
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // 未学習 → 学習中 → 定着中 → 習得済み → 未学習 と一方向に回す。
    // 表示中のマス目を起点にするので、書き込みのデバウンス中に連打しても
    // 進む順番が飛んだり止まったりしない。
    const next = getNextWordStatus(getWordStatusForStep(filledCount));
    setFilledCount(getWordStatusStep(next));
    onStatusChange(next);
  }, [filledCount, onStatusChange]);

  // タップした瞬間はまだ `status` が書き戻ってきていない (書き込みはデバウンス
  // される) ので、マスと同じく楽観更新した `filledCount` からラベルを引く。
  // そうしないとマスだけ先に塗られて文言が1タップ遅れる。
  const shownStatus = getWordStatusForStep(filledCount);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`ステータス: ${PP_ARIA[shownStatus] ?? shownStatus}`}
      className={`flex shrink-0 flex-col items-center gap-[3px] rounded transition-colors active:bg-[rgba(26,26,26,0.06)]${className ? ` ${className}` : ''}`}
    >
      <div className="flex flex-col gap-[1.5px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[13px] w-[13px] rounded-[2.5px] border-2 border-[var(--solid-ink)]"
            style={{ background: i < filledCount ? PP_FILL[shownStatus] : 'transparent' }}
          />
        ))}
      </div>
      <WordStatusLabel status={shownStatus} />
    </button>
  );
}

/**
 * 赤シート。訳の上に赤いベタを敷いて読めなくする。
 *
 * 文字を消さずに色だけ透明にするのは、隠しても行の高さと幅が動かないようにするため
 * (訳を消すと行が詰まって、赤シートを外すたびに一覧が跳ねる)。
 * 訳は `word.japanese` 直書きではなく複数語義を畳む TranslationDisplay 経由なので、
 * ここでもラッパごと覆って語義が漏れないようにする。
 */
function MaskedTranslation({
  word,
  hidden,
  interactive,
  stacked = false,
}: {
  word: Word;
  hidden: boolean;
  /** 赤い部分をタップして1行だけ表に戻せるか。選択モードでは行全体がボタンなので無効。 */
  interactive: boolean;
  /** 複数語義を1語義1行で縦に積む (収まらない語義はその行だけ `...` で省略)。 */
  stacked?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  // 赤シートを掛け直す / 外すたびに、1行だけ開けていた状態を畳んで次に備える。
  // effect ではなくレンダー中に直すのは、赤いベタを1フレーム挟まずに切り替えるため。
  const [lastHidden, setLastHidden] = useState(hidden);
  if (lastHidden !== hidden) {
    setLastHidden(hidden);
    setRevealed(false);
  }

  // 2行までなのは、行の高さを決めているステータス列 (3マス + 習得度ラベル) に
  // 収まる行数だから。3行にすると一覧の行が伸びてしまう。あふれた語義は末尾の
  // `...` で示す。
  const content = <TranslationDisplay word={word} compact stacked={stacked} maxLines={2} />;

  // 縦積みのときは語義ごとに `...` を出すので、ラッパ側では1行に潰さない。
  // flex-1 で伸ばさず内容幅のままにしているのは、赤シートのベタが訳のない余白まで
  // 広がらないようにするため (狭いときは flex の縮小で効いて各行が `...` になる)。
  const boxClass = stacked ? 'block min-w-0' : 'truncate';

  if (!hidden || revealed) {
    return <span className={boxClass}>{content}</span>;
  }

  const maskClass = `${boxClass} select-none rounded-[4px] bg-[#e0483f] text-transparent`;

  if (!interactive) {
    return (
      <span className={maskClass} aria-label="訳は赤シートで隠れています">
        {content}
      </span>
    );
  }

  const reveal = () => setRevealed(true);

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="訳を表示"
      className={`${maskClass} cursor-pointer`}
      onClick={(event) => {
        // 行タップ (単語詳細を開く) には伝えない
        event.stopPropagation();
        event.preventDefault();
        reveal();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.stopPropagation();
        event.preventDefault();
        reveal();
      }}
    >
      {content}
    </span>
  );
}

/** クイズで間違えた回数のバッジ。0回の単語には出さない。 */
function WrongCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="shrink-0 font-mono text-[9.5px] font-bold tabular-nums text-[var(--color-error)]"
      title={`クイズで ${count} 回間違えた単語`}
    >
      誤答{count}
    </span>
  );
}

/**
 * 行の本文 (見出し語 + 訳)。
 *
 * `splitMeaning` を立てると、訳を英語の下ではなく右のカラムに置き、間に縦の仕切りを
 * 入れる (単語帳詳細 /project/[id] のレイアウト)。見出し語側の幅を割合で固定して
 * いるのは、行ごとに仕切りの位置がずれると一覧が表に見えなくなるため。
 */
function WordRowText({
  word,
  pos,
  wrongCount,
  hideMeaning,
  interactive,
  splitMeaning,
}: {
  word: Word;
  pos: string | null;
  wrongCount: number;
  hideMeaning: boolean;
  interactive: boolean;
  splitMeaning: boolean;
}) {
  const english = (
    <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)] lg:text-[16px]">{word.english}</div>
  );
  const meaning = (
    <>
      {pos && <span className="shrink-0 font-mono text-[9px] lg:text-[11px]">{posShort(pos)}</span>}
      <MaskedTranslation word={word} hidden={hideMeaning} interactive={interactive} stacked={splitMeaning} />
      <WrongCountBadge count={wrongCount} />
    </>
  );

  if (!splitMeaning) {
    return (
      <>
        {english}
        <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)] lg:text-[13px]">{meaning}</div>
      </>
    );
  }

  // 仕切りは行の上下いっぱい (px-1 py-2.5 の padding の外) まで貫通させる。
  // 呼び出し側が親を self-stretch で行の高さまで伸ばしてあるので、ここは
  // self-stretch + `-my-2.5` (= 行の py-2.5) で padding の分だけはみ出させる。
  // マージンボックスは行の高さのままなので、行が伸びることはない。
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="min-w-0 shrink-0 basis-[46%]">{english}</div>
      <span aria-hidden className="-my-2.5 w-px shrink-0 self-stretch bg-[var(--color-border)]" />
      <div className="flex min-w-0 flex-1 items-baseline gap-1 text-[11px] text-[var(--color-muted)] lg:text-[13.5px] lg:text-[var(--color-secondary-text)]">{meaning}</div>
    </div>
  );
}

export function WordRow({
  word,
  selectMode,
  selected,
  tourAnchor = false,
  wrongCount = 0,
  hideMeaning = false,
  splitMeaning = false,
  onToggleSelect,
  onCycleStatus,
  onCycleVocabularyType,
  onToggleFavorite,
  onSelect,
}: {
  word: Word;
  selectMode: boolean;
  selected: boolean;
  tourAnchor?: boolean;
  /** クイズでの誤答回数。単語帳をまたぐ一覧で「間違えた単語」を見分けるために出す。 */
  wrongCount?: number;
  /** 赤シート。true の間は訳を赤いベタで覆う (行タップで1行だけ表に戻せる)。 */
  hideMeaning?: boolean;
  /** 訳を英語の下ではなく右のカラムに出し、間に仕切りを引く。 */
  splitMeaning?: boolean;
  onToggleSelect: () => void;
  onCycleStatus: (newStatus: WordStatus) => void;
  onCycleVocabularyType: () => void;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  const pos = word.partOfSpeechTags?.[0] ?? null;
  const displayStatus = word.status;

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        className={`block w-full px-1 py-2.5 text-left transition-colors ${
          selected ? 'bg-[rgba(19,127,236,0.06)]' : ''
        }`}
      >
        <div className="flex items-center gap-2.5">
          {/* 選択モードでもマスの代わりにラベルだけは残す (選ぶ前に習得度で
              選別できるように)。ここではタップで段階を変えられないので文言のみ。 */}
          <div className="flex shrink-0 flex-col items-center gap-[3px]">
            <SelectCheckbox checked={selected} size={26} />
            <WordStatusLabel status={word.status} />
          </div>
          <div className={`min-w-0 flex-1${splitMeaning ? ' flex self-stretch overflow-visible' : ''}`}>
            <WordRowText
              word={word}
              pos={pos}
              wrongCount={wrongCount}
              hideMeaning={hideMeaning}
              interactive={false}
              splitMeaning={splitMeaning}
            />
          </div>
          <VocabularyTypeBadge vocabularyType={word.vocabularyType} />
          <BookmarkBadge active={word.isFavorite} />
        </div>
      </button>
    );
  }

  return (
    <div className="px-1 py-2.5">
      <div className="flex items-center gap-2.5">
        <StatusSquares
          wordId={word.id}
          status={displayStatus}
          onStatusChange={onCycleStatus}
          className={tourAnchor ? 'tour-anchor-word-status' : undefined}
        />

        <button
          type="button"
          onClick={onSelect}
          className={`min-w-0 flex-1 text-left${splitMeaning ? ' flex self-stretch overflow-visible' : ''}`}
        >
          <WordRowText
            word={word}
            pos={pos}
            wrongCount={wrongCount}
            hideMeaning={hideMeaning}
            interactive
            splitMeaning={splitMeaning}
          />
        </button>

        <VocabularyTypeButton
          vocabularyType={word.vocabularyType}
          onClick={onCycleVocabularyType}
          className={tourAnchor ? 'shrink-0 tour-anchor-vocab-type' : 'shrink-0'}
        />
        <button
          type="button"
          onClick={onToggleFavorite}
          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center text-[var(--color-accent)]"
          aria-label="保存を切り替え"
        >
          <Icon name="bookmark" size={22} filled={word.isFavorite} />
        </button>
      </div>
    </div>
  );
}

export function VocabularyTypeBadge({
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

export function BookmarkBadge({ active }: { active: boolean }) {
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

export function SelectCheckbox({ checked, size = 20 }: { checked: boolean; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border-2 transition-colors ${
        checked
          ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
          : 'border-[var(--solid-ink)] bg-white text-transparent'
      }`}
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
      aria-hidden
    >
      {checked && <Icon name="check" size={Math.round(size * 0.65)} />}
    </span>
  );
}
