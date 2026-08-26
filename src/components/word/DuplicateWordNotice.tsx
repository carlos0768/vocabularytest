'use client';

import { Icon } from '@/components/ui/Icon';

/**
 * 手入力で単語を追加するときの重複告知。
 *
 * 入力中の見出し語がすでにその単語帳にある場合に、どの単語と重なるかを
 * 見せる。追加自体は止めない（同じ綴りで別の語義を足したいこともある）が、
 * 気づかずに二重登録することがないようにする。
 */
export function DuplicateWordNotice({
  duplicateWord,
  className,
}: {
  duplicateWord: { english: string; japanese?: string } | null | undefined;
  className?: string;
}) {
  if (!duplicateWord) return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-[10px] border border-[var(--color-warning)] bg-[rgba(255,165,0,0.08)] px-3 py-2 ${className ?? ''}`}
      role="status"
    >
      <Icon name="warning" size={14} className="mt-px shrink-0 text-[var(--color-warning)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-[var(--solid-ink)]">
          この単語はすでにこの単語帳にあります
        </p>
        <p className="mt-px truncate text-[11px] text-[var(--color-muted)]">
          {duplicateWord.english}
          {duplicateWord.japanese ? ` — ${duplicateWord.japanese}` : ''}
        </p>
        <p className="mt-px text-[10px] leading-snug text-[var(--color-muted)]">
          このまま追加すると同じ単語が2つ並びます。
        </p>
      </div>
    </div>
  );
}
