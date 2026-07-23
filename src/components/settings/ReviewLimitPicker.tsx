'use client';

import { useState } from 'react';
import {
  DAILY_REVIEW_LIMIT_OPTIONS,
  dailyReviewLimitLabel,
  getDailyReviewLimit,
  setDailyReviewLimit,
} from '@/lib/preferences/review-limit';

/**
 * 1日の復習上限のチップ選択 (設定ページのモバイル/デスクトップ共用)。
 * 選択は localStorage に即保存され、次回の復習クイズから反映される。
 */
export function ReviewLimitPicker({ className }: { className?: string }) {
  const [limit, setLimit] = useState(() => getDailyReviewLimit());

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {DAILY_REVIEW_LIMIT_OPTIONS.map((option) => {
        const active = limit === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              setDailyReviewLimit(option);
              setLimit(option);
            }}
            className={`rounded-full border-2 px-3 py-1.5 font-display text-[12.5px] font-bold transition-all ${
              active
                ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
                : 'border-[var(--color-border)] bg-white text-[var(--color-muted)]'
            }`}
          >
            {dailyReviewLimitLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
