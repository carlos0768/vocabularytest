'use client';

// フラッシュカード画面 (`/flashcard/[projectId]`) のヘッダー・送り・評価ボタン。
import { triggerHaptic } from '@/lib/haptics';
import {
  FLASHCARD_GRADES,
  FLASHCARD_GRADE_HINTS,
  FLASHCARD_GRADE_KEYS,
  FLASHCARD_GRADE_LABELS,
  type FlashcardGrade,
} from '@/lib/quiz/flashcard-grade';

/* ---------- HeaderBtn (立体スケッチ風) ---------- */
export function HeaderBtn({
  children,
  onClick,
  active,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  'aria-haspopup': ariaHasPopup,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: 'menu';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
      style={{ background: active ? 'var(--solid-ink)' : 'var(--color-surface)', color: active ? 'var(--color-on-ink)' : 'var(--solid-ink)' }}
    >
      {children}
    </button>
  );
}

/* ---------- NavBtn (前へ / 回転 / 次へ の丸ボタン) ---------- */
export function NavBtn({
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => { triggerHaptic(); onClick?.(); }}
      aria-label={ariaLabel}
      className="flex h-[46px] w-[46px] items-center justify-center rounded-[23px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-shadow)]"
    >
      {children}
    </button>
  );
}

/* ---------- SM-2 4段階評価 (もう一度 / 難しい / 普通 / 簡単) ---------- */
export const GRADE_TINT: Record<FlashcardGrade, string> = {
  again: 'var(--color-error)',
  hard: 'var(--color-warning)',
  good: 'var(--color-accent)',
  easy: 'var(--color-success)',
};

export function GradeBar({
  visible,
  disabled,
  onGrade,
  showKeys = false,
}: {
  /** 裏面を見ているときだけ押せる。表面のときは同じ高さの余白に差し替える。 */
  visible: boolean;
  disabled?: boolean;
  onGrade: (grade: FlashcardGrade) => void;
  /** デスクトップではキーの数字を添える。 */
  showKeys?: boolean;
}) {
  if (!visible) {
    // 表面のあいだは案内を出さず、評価ボタンぶんの高さだけ空けておく
    // (裏返したときに下のボタン列が跳ねないようにするため)。
    return <div className="h-[64px] w-full" aria-hidden />;
  }
  return (
    <div className="grid h-[64px] w-full grid-cols-4 gap-2" role="group" aria-label="思い出せた度合い">
      {FLASHCARD_GRADES.map((grade) => {
        const tint = GRADE_TINT[grade];
        return (
          <button
            key={grade}
            type="button"
            disabled={disabled}
            onClick={() => onGrade(grade)}
            className="flex flex-col items-center justify-center gap-[2px] rounded-[12px] border-2 bg-[var(--color-surface)] px-1 py-1.5 transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
            style={{ borderColor: tint, boxShadow: `2px 3px 0 ${tint}`, color: tint }}
          >
            <span className="font-display text-[14px] font-extrabold leading-none">
              {FLASHCARD_GRADE_LABELS[grade]}
            </span>
            <span className="text-[10px] font-bold leading-none text-[var(--color-muted)]">
              {showKeys ? `${FLASHCARD_GRADE_KEYS[grade]} · ` : ''}{FLASHCARD_GRADE_HINTS[grade]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
