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

const PP_FILLED: Record<WordStatus, number> = { new: 0, review: 1, active: 2, mastered: 3 };
const PP_STATUS: WordStatus[] = ['new', 'review', 'active', 'mastered'];
const PP_ARIA: Record<WordStatus, string> = { new: '未学習', review: '学習中', active: '定着中', mastered: '習得済み' };

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
  const [filledCount, setFilledCount] = useState(() => PP_FILLED[status] ?? 0);
  const [direction, setDirection] = useState<'up' | 'down'>(() =>
    status === 'mastered' ? 'down' : 'up'
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFilledCount(PP_FILLED[status] ?? 0);
      setDirection(status === 'mastered' ? 'down' : 'up');
    });
    return () => { cancelled = true; };
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'up') {
      if (filledCount < 3) {
        const next = filledCount + 1;
        setFilledCount(next);
        if (next === 3) setDirection('down');
        onStatusChange(PP_STATUS[next]);
      }
    } else {
      if (filledCount > 0) {
        const next = filledCount - 1;
        setFilledCount(next);
        if (next === 0) setDirection('up');
        onStatusChange(PP_STATUS[next]);
      }
    }
  }, [filledCount, direction, onStatusChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`ステータス: ${PP_ARIA[status] ?? status}`}
      className={`shrink-0 rounded transition-colors active:bg-[rgba(26,26,26,0.06)]${className ? ` ${className}` : ''}`}
    >
      <div className="flex flex-col gap-[1.5px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[13px] w-[13px] rounded-[2.5px] border-2 border-[var(--solid-ink)]"
            style={{ background: i < filledCount ? 'var(--solid-ink)' : 'transparent' }}
          />
        ))}
      </div>
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
}: {
  word: Word;
  hidden: boolean;
  /** 赤い部分をタップして1行だけ表に戻せるか。選択モードでは行全体がボタンなので無効。 */
  interactive: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  // 赤シートを掛け直す / 外すたびに、1行だけ開けていた状態を畳んで次に備える。
  // effect ではなくレンダー中に直すのは、赤いベタを1フレーム挟まずに切り替えるため。
  const [lastHidden, setLastHidden] = useState(hidden);
  if (lastHidden !== hidden) {
    setLastHidden(hidden);
    setRevealed(false);
  }

  const content = <TranslationDisplay word={word} compact />;

  if (!hidden || revealed) {
    return <span className="truncate">{content}</span>;
  }

  const maskClass = 'truncate select-none rounded-[4px] bg-[#e0483f] text-transparent';

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

export function WordRow({
  word,
  selectMode,
  selected,
  tourAnchor = false,
  wrongCount = 0,
  hideMeaning = false,
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
          <SelectCheckbox checked={selected} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
            <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
              {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
              <MaskedTranslation word={word} hidden={hideMeaning} interactive={false} />
              <WrongCountBadge count={wrongCount} />
            </div>
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

        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
          <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
            {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
            <MaskedTranslation word={word} hidden={hideMeaning} interactive />
            <WrongCountBadge count={wrongCount} />
          </div>
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
