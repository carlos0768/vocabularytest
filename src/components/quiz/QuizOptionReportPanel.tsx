'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

type PanelState = 'idle' | 'choosing' | 'sending' | 'done';

/**
 * 四択の「選択肢がおかしい」報告。答えを確認したあとに出す。
 * タップで誤答の一覧（正解は除く）を見せ、選んだ選択肢を親に渡す。
 * 判定の結果は親がトーストで見せるので、ここは送信中と送信済みだけを持つ。
 * 問題が変わったら親が key を変えて状態を捨てる。
 */
export function QuizOptionReportPanel({
  options,
  correctIndex,
  onReport,
}: {
  options: readonly string[];
  correctIndex: number;
  onReport: (option: string) => Promise<void>;
}) {
  const [state, setState] = useState<PanelState>('idle');
  const candidates = options
    .map((option, index) => ({ option, index }))
    .filter(({ index }) => index !== correctIndex);

  if (candidates.length === 0) return null;

  if (state === 'done') {
    return (
      <div className="mt-2 text-center text-[11px] font-semibold text-[var(--color-muted)]">
        報告ありがとうございます
      </div>
    );
  }

  if (state === 'idle') {
    return (
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={() => setState('choosing')}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[var(--color-muted)]"
        >
          <Icon name="flag" size={12} /> 選択肢がおかしい？
        </button>
      </div>
    );
  }

  const sending = state === 'sending';

  return (
    <div className="mt-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-bold text-[var(--solid-ink)]">
          {sending ? 'AIが確認しています…' : 'おかしい選択肢をタップ'}
        </div>
        {!sending && (
          <button
            type="button"
            onClick={() => setState('idle')}
            className="text-[11px] font-semibold text-[var(--color-muted)]"
          >
            やめる
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {candidates.map(({ option, index }) => (
          <button
            key={index}
            type="button"
            disabled={sending}
            onClick={async () => {
              setState('sending');
              try {
                await onReport(option);
                setState('done');
              } catch {
                setState('choosing');
              }
            }}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-[12px] font-semibold text-[var(--solid-ink)] disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[10px] leading-[1.5] text-[var(--color-muted)]">
        正解としても通る訳や、正解と区別がつかない選択肢を報告できます。本当におかしければその場で別の選択肢に差し替えます。
      </div>
    </div>
  );
}
