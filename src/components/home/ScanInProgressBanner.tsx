'use client';

export interface ScanInProgressItem {
  id: string;
  project_title: string;
  /** 既存の単語帳へ追加するスキャンなら true（新規作成なら false/未指定） */
  addingToExisting?: boolean;
}

/**
 * ホームの一番上に出す「スキャン中」バナー。バックグラウンドスキャンで
 * 単語帳を作成・追加している間だけ表示し、終わったら消える。
 */
export function ScanInProgressBanner({
  scans,
  className = '',
}: {
  scans: ScanInProgressItem[];
  className?: string;
}) {
  if (scans.length === 0) return null;

  const first = scans[0];
  const action = first.addingToExisting ? 'に単語を追加しています' : 'を作成しています';
  const detail =
    scans.length === 1
      ? `「${first.project_title}」${action}`
      : `「${first.project_title}」ほか${scans.length - 1}件を処理しています`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 shadow-[2px_3px_0_var(--solid-shadow)] ${className}`}
    >
      <div className="scanvocab-generating-spin h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-[0.22]" />
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="15.7 47.1"
          />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-[var(--solid-ink)]">スキャン中...</div>
        <div className="truncate text-[11px] text-[var(--color-muted)]">{detail}</div>
      </div>
    </div>
  );
}
