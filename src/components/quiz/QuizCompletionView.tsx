'use client';

/**
 * クイズを解き終えたあとの画面 (スコア + 解答一覧 + 次へ / 終了する)。
 * 一般・タイムアタック (`/quiz`) と空所補充 (`/cloze-quiz`) で同じものを出す。
 * PC は専用の表、スマホ・タブレットはカードの一覧。
 */

import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { calculateQuizScorePercentage, getQuizCompletionMessage } from '@/lib/quiz/quiz-progress';
import { formatJapaneseForDisplay } from '@/lib/words/display';
import type { Word } from '@/types';
import type { QuizBoardResult } from './QuizBattleParts';

export type QuizCompletionRow = { word: Word; result: QuizBoardResult };

export function QuizCompletionView({
  results,
  rows,
  onNext,
  onFinish,
}: {
  results: { correct: number; total: number };
  /** 出題順の語とその結果。 */
  rows: readonly QuizCompletionRow[];
  onNext: () => void;
  onFinish: () => void;
}) {
  const percentage = calculateQuizScorePercentage(results);
  const answerResults = rows.map((row) => row.result);
  const wordResultRows = rows.map(({ word, result }) => {
    const isIncorrect = result === false || result === 'skip';
    const marker = result === true ? '○' : result === 'skip' ? '？' : '×';
    const markerColor = result === true ? 'var(--color-success)' : result === 'skip' ? 'var(--color-warning)' : 'var(--color-error)';
    return { word, marker, markerColor, isIncorrect };
  });

  return (
    <>
      {/* Desktop completion */}
      <div className="ds-fixed-main fixed inset-0 z-30 hidden flex-col bg-[var(--color-background)] font-[var(--font-body)] desktop:flex">
        <div className="flex-1 overflow-y-auto">
          <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', padding: '40px 0 24px' }}>
            {/* Score card */}
            <div className="ds-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, lineHeight: 1 }}>
                  {results.correct}<span style={{ fontSize: 16, color: 'var(--color-secondary-text)' }}>/{results.total}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="ds-prog"><div className="fi" style={{ width: `${percentage}%` }} /></div>
                </div>
                <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>{percentage}%</span>
              </div>
              <p style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--color-secondary-text)' }}>{getQuizCompletionMessage(percentage)}</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <span className="ds-status mastered"><span className="ds-sdot c-mastered" />正解 {answerResults.filter(r => r === true).length}</span>
                <span className="ds-status review"><span className="ds-sdot c-review" />不正解 {answerResults.filter(r => r === false).length}</span>
                <span className="ds-status new"><span className="ds-sdot c-new" />スキップ {answerResults.filter(r => r === 'skip').length}</span>
              </div>
            </div>
            {/* Desktop word results */}
            <div className="ds-card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid color-mix(in srgb, var(--solid-ink) 10%, transparent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="format_list_bulleted" style={{ fontSize: 18, color: 'var(--color-muted)' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>解答一覧</span>
              </div>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }} />
                    <th style={{ minWidth: 120 }}>英単語</th>
                    <th>日本語</th>
                  </tr>
                </thead>
                <tbody>
                  {wordResultRows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, color: row.markerColor }}>{row.marker}</td>
                      <td className="en" style={row.isIncorrect ? { color: 'var(--color-error)' } : undefined}>{row.word.english}</td>
                      <td className="ja" style={row.isIncorrect ? { color: 'var(--color-error)', opacity: 0.8 } : undefined}><TranslationDisplay word={row.word} compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Fixed footer buttons */}
        <div style={{ borderTop: '1px solid color-mix(in srgb, var(--solid-ink) 10%, transparent)', background: 'var(--color-background)', padding: '14px 0' }}>
          <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" className="ds-btn accent" onClick={onNext}>
              <Icon name="arrow_forward" />次へ
            </button>
            <button type="button" className="ds-btn dark" onClick={onFinish}>
              <Icon name="check" />終了する
            </button>
          </div>
        </div>
      </div>
      {/* Mobile completion */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-[100dvh] flex-col bg-[var(--color-background)] font-[var(--font-body)] desktop:hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ paddingTop: 'max(16px, calc(env(safe-area-inset-top) + 16px))' }}>
          <div className="mx-auto w-full max-w-sm px-5 pb-4 tablet:max-w-[560px]">
            {/* Score card */}
            <div className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="font-display text-[32px] font-black tabular-nums text-[var(--solid-ink)]">
                  {results.correct}<span className="text-[16px] text-[var(--color-muted)]">/{results.total}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="h-[6px] w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,_var(--solid-ink)_8%,_transparent)]">
                    <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
                <span className="font-display text-[20px] font-black tabular-nums text-[var(--solid-ink)]">{percentage}%</span>
              </div>
              <p className="mt-2.5 text-[13px] font-bold text-[var(--color-secondary-text)]">{getQuizCompletionMessage(percentage)}</p>
              <div className="mt-3 flex gap-3">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-muted)]">
                  <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--color-success)]" />正解 {answerResults.filter(r => r === true).length}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-muted)]">
                  <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--color-error)]" />不正解 {answerResults.filter(r => r === false).length}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-muted)]">
                  <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--color-warning)]" />スキップ {answerResults.filter(r => r === 'skip').length}
                </span>
              </div>
            </div>
            {/* Word results list */}
            <div className="mt-3 w-full overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
              <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,_var(--solid-ink)_10%,_transparent)] px-4 py-3">
                <Icon name="format_list_bulleted" size={16} className="text-[var(--color-muted)]" />
                <h3 className="font-display text-[14px] font-extrabold text-[var(--solid-ink)]">解答一覧</h3>
              </div>
              <div className="divide-y divide-[color-mix(in_srgb,_var(--solid-ink)_8%,_transparent)]">
                {wordResultRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-center text-[16px] font-black" style={{ color: row.markerColor }}>
                      {row.marker}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span
                        className="text-[14px] font-bold"
                        style={{ color: row.isIncorrect ? 'var(--color-error)' : 'var(--solid-ink)' }}
                      >
                        {row.word.english}
                      </span>
                      <span
                        className="ml-2 text-[12px]"
                        style={{ color: row.isIncorrect ? 'var(--color-error)' : 'var(--color-muted)', opacity: row.isIncorrect ? 0.8 : 1 }}
                      >
                        {formatJapaneseForDisplay(row.word)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Fixed bottom buttons */}
        <div className="shrink-0 border-t border-[color-mix(in_srgb,_var(--solid-ink)_10%,_transparent)] bg-[var(--color-background)]" style={{ paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 16px))' }}>
          <div className="mx-auto w-full max-w-sm space-y-2 px-5 pt-3">
            <SolidButton variant="accent" onClick={onNext} iconRight="arrow_forward" className="w-full justify-center">次へ</SolidButton>
            <SolidButton onClick={onFinish} className="w-full justify-center">終了する</SolidButton>
          </div>
        </div>
      </div>
    </>
  );
}
