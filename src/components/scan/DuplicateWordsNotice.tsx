'use client';

import { Icon } from '@/components/ui/Icon';

/**
 * スキャン確認画面の重複告知バナー。
 *
 * すでに単語帳にある見出し語を黙って作らないように、件数を知らせて
 * 「追加しない / 重複も追加する」をユーザーに選ばせる。モバイル版と
 * デスクトップ版で同じ文言を出すため、1コンポーネントに寄せている。
 */
export function DuplicateWordsNotice({
  duplicateCount,
  skippedDuplicateCount,
  isAddingToExisting,
  includeDuplicates,
  checking,
  failed,
  onIncludeDuplicatesChange,
  className,
}: {
  duplicateCount: number;
  /** 重複のうち、いま実際に追加しない語数（1語ずつ切り替えられるので件数は一致しない） */
  skippedDuplicateCount: number;
  isAddingToExisting: boolean;
  includeDuplicates: boolean;
  checking: boolean;
  failed: boolean;
  onIncludeDuplicatesChange: (include: boolean) => void;
  className?: string;
}) {
  if (checking) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[11px] text-[var(--color-muted)] ${className ?? ''}`}>
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-transparent" />
        すでにある単語を確認中...
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 ${className ?? ''}`}>
        <Icon name="info" size={14} className="mt-px shrink-0 text-[var(--color-muted)]" />
        <p className="text-[11px] leading-snug text-[var(--color-muted)]">
          単語帳の中身を読み込めなかったため、すでにある単語かどうかを確認できませんでした。同じ単語が重複して追加される場合があります。
        </p>
      </div>
    );
  }

  if (duplicateCount === 0) return null;

  return (
    <div
      className={`rounded-lg border border-[var(--color-warning)] bg-[rgba(255,165,0,0.06)] px-3 py-2.5 ${className ?? ''}`}
      role="status"
    >
      <div className="flex items-start gap-2">
        <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[var(--solid-ink)]">
            {isAddingToExisting
              ? `すでにこの単語帳にある単語が${duplicateCount}語あります`
              : `スキャン結果の中で重複している単語が${duplicateCount}語あります`}
          </p>
          <p className="mt-px text-[11px] leading-snug text-[var(--color-muted)]">
            {skippedDuplicateCount === 0
              ? '重複した単語も追加します。同じ単語が2つ並びます。'
              : skippedDuplicateCount === duplicateCount
                ? `重複した${duplicateCount}語は追加しません。追加したい場合は「重複も追加」を選んでください。`
                : `重複した${duplicateCount}語のうち${skippedDuplicateCount}語は追加しません。`}
          </p>
          <div className="mt-2 flex gap-1.5">
            <DuplicateChoiceButton
              label="追加しない"
              active={!includeDuplicates}
              onClick={() => onIncludeDuplicatesChange(false)}
            />
            <DuplicateChoiceButton
              label="重複も追加"
              active={includeDuplicates}
              onClick={() => onIncludeDuplicatesChange(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateChoiceButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-md border px-2.5 py-[5px] text-[11px] font-bold transition-colors ' +
        (active
          ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
          : 'border-[var(--color-border)] bg-white text-[var(--color-muted)]')
      }
    >
      {label}
    </button>
  );
}

/** 単語行に出す「重複」バッジ。 */
export function DuplicateWordBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded border border-[var(--color-warning)] bg-[rgba(255,165,0,0.1)] px-1 py-px font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-warning)] ${className ?? ''}`}
    >
      重複
    </span>
  );
}
