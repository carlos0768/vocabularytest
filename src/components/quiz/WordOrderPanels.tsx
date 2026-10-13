'use client';

// 語順クイズの回答パネル (デスクトップ / モバイル)。クイズ画面から切り出したもの。
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { WORD_ORDER_BLANK_TOKEN } from '@/lib/quiz/word-order';
import { getUsedWordOrderOptionIndexes, getWordOrderExample } from '@/lib/quiz/word-order-answer';
import type { WordOrderQuizQuestion } from '@/types';

export function DSDesktopWordOrderPanel({
  question,
  selectedTokens,
  result,
  isRevealed,
  onSelectToken,
  onRemoveToken,
}: {
  question: WordOrderQuizQuestion;
  selectedTokens: string[];
  result: 'correct' | 'wrong' | null;
  isRevealed: boolean;
  onSelectToken: (token: string) => void;
  onRemoveToken: (index: number) => void;
}) {
  const usedOptionIndexes = getUsedWordOrderOptionIndexes(question.options, selectedTokens);
  const answerStateClass = isRevealed ? (result === 'correct' ? ' correct' : ' wrong') : '';
  const answerIsFull = selectedTokens.length >= question.answerTokens.length;
  const example = getWordOrderExample(question);
  // モバイル版と同様に、文中の固定単語（デフォルト表示）と空欄を並べて表示する
  const sentenceItems = question.sentenceTokens.map((token, index) => ({
    token,
    index,
    answerIndex: token === WORD_ORDER_BLANK_TOKEN
      ? question.sentenceTokens
        .slice(0, index + 1)
        .filter((item) => item === WORD_ORDER_BLANK_TOKEN).length - 1
      : null,
  }));

  return (
    <div className="ds-word-order-stage">
      <div className="ds-word-order-prompt">
        <span className="ds-tag plain">日本語訳</span>
        <div className="ds-word-order-meaning"><TranslationDisplay word={question.word} /></div>
        <div className="muted ds-word-order-help">単語をクリックして正しい順に並べてください</div>
      </div>

      <div className={`ds-wo-answer${answerStateClass}`}>
        {sentenceItems.map(({ token, index, answerIndex }) => {
          if (token !== WORD_ORDER_BLANK_TOKEN) {
            return (
              <span key={`${token}-${index}`} className="ds-wo-fixed">
                {token}
              </span>
            );
          }

          const selected = answerIndex === null ? undefined : selectedTokens[answerIndex];

          if (!selected) {
            return <span key={`blank-${index}`} className="ds-wo-blank" aria-label="空欄" />;
          }

          return (
            <button
              key={`blank-${index}`}
              type="button"
              className="ds-tile in-answer"
              onClick={() => answerIndex !== null && onRemoveToken(answerIndex)}
              disabled={isRevealed}
            >
              {selected}
              {!isRevealed && (
                <Icon
                  name="close"
                  style={{ fontSize: 14, marginLeft: 6, verticalAlign: '-2px', opacity: 0.7 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="ds-wo-bank">
        {question.options.map((token, index) => {
          const isUsed = usedOptionIndexes.has(index);
          return (
            <button
              key={`${token}-${index}`}
              type="button"
              className={`ds-tile${isUsed ? ' used' : ''}`}
              onClick={() => onSelectToken(token)}
              disabled={isRevealed || isUsed || answerIsFull}
            >
              {token}
            </button>
          );
        })}
      </div>

      {isRevealed && example && (
        <div className="w-full max-w-[860px] rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-[13px_14px] text-left">
          <div className="mb-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">EXAMPLE</div>
          <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">
            {example.sentence}
          </div>
          {example.translation && (
            <div className="mt-1 text-xs leading-[1.55] text-[var(--color-muted)]">{example.translation}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function DSWordOrderPanel({
  question,
  selectedTokens,
  result,
  isRevealed,
  onSelectToken,
  onRemoveToken,
  onSubmit,
}: {
  question: WordOrderQuizQuestion;
  selectedTokens: string[];
  result: 'correct' | 'wrong' | null;
  isRevealed: boolean;
  onSelectToken: (token: string) => void;
  onRemoveToken: (index: number) => void;
  onSubmit: () => void;
}) {
  const usedOptionIndexes = getUsedWordOrderOptionIndexes(question.options, selectedTokens);
  const isReady = selectedTokens.length === question.answerTokens.length;
  const example = getWordOrderExample(question);
  const sentenceItems = question.sentenceTokens.map((token, index) => ({
    token,
    index,
    answerIndex: token === WORD_ORDER_BLANK_TOKEN
      ? question.sentenceTokens
        .slice(0, index + 1)
        .filter((item) => item === WORD_ORDER_BLANK_TOKEN).length - 1
      : null,
  }));

  return (
    <div className="mt-[18px] space-y-4">
      <div className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4">
        <div className="flex min-h-[76px] flex-wrap items-center gap-2">
          {sentenceItems.map(({ token, index, answerIndex }) => {
            if (token !== WORD_ORDER_BLANK_TOKEN) {
              return (
                <span
                  key={`${token}-${index}`}
                  className="inline-flex min-h-10 items-center rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,_var(--solid-ink)_4%,_transparent)] px-3 text-[15px] font-bold text-[var(--solid-ink)]"
                >
                  {token}
                </span>
              );
            }

            const selected = answerIndex === null ? undefined : selectedTokens[answerIndex];

            return (
              <button
                key={`blank-${index}`}
                type="button"
                onClick={() => selected && answerIndex !== null && onRemoveToken(answerIndex)}
                disabled={isRevealed || !selected}
                className="inline-flex min-h-10 min-w-[74px] items-center justify-center rounded-xl border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-[15px] font-black text-[var(--solid-ink)] disabled:cursor-default"
              >
                {selected || ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* 選んだ選択肢は取り除かずに透明にして場所を残す。詰めると残りの位置がずれて押し間違える */}
        {question.options.map((token, index) => {
          const isUsed = usedOptionIndexes.has(index);
          return (
            <button
              key={`${token}-${index}`}
              type="button"
              onClick={() => onSelectToken(token)}
              disabled={isRevealed || isUsed || selectedTokens.length >= question.answerTokens.length}
              aria-hidden={isUsed || undefined}
              tabIndex={isUsed ? -1 : undefined}
              className={`relative min-h-12 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-center text-[15px] font-black text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)]${isUsed ? ' invisible' : ''}`}
            >
              {token}
            </button>
          );
        })}
      </div>

      {!isRevealed && (
        <SolidButton
          variant="accent"
          onClick={onSubmit}
          disabled={!isReady}
          className="w-full justify-center"
        >
          回答する
        </SolidButton>
      )}

      {isRevealed && (
        <div
          className="rounded-xl border-2 p-3 text-center"
          style={{
            borderColor: result === 'correct' ? 'var(--color-accent-ink)' : '#b91c1c',
            background: result === 'correct' ? 'var(--color-accent)' : 'var(--color-error)',
          }}
        >
          <p className="text-sm font-bold text-white/85">
            {result === 'correct' ? '正解' : '不正解'}
          </p>
          <p className="mt-1 text-lg font-black text-white">{question.word.english}</p>
        </div>
      )}

      {isRevealed && example && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-[13px_14px]">
          <div className="mb-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">EXAMPLE</div>
          <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">
            {example.sentence}
          </div>
          {example.translation && (
            <div className="mt-1 text-xs leading-[1.55] text-[var(--color-muted)]">{example.translation}</div>
          )}
        </div>
      )}
    </div>
  );
}
