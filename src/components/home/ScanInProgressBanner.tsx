'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

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

export interface ScanCompletedItem {
  id: string;
  projectId: string;
  projectTitle: string;
  /** 追加された語数。不明なら null */
  wordCount: number | null;
}

/**
 * スキャンが終わったら「スキャン中」と同じ位置に出す完了バナー。
 * 追加した語数と、その単語帳を開くボタンを出す。開くか閉じるまで残る。
 */
export function ScanCompletedBanner({
  scans,
  onDismiss,
  className = '',
}: {
  scans: ScanCompletedItem[];
  onDismiss: (jobId: string) => void;
  className?: string;
}) {
  if (scans.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {scans.map((scan) => (
        <div
          key={scan.id}
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 shadow-[2px_3px_0_var(--solid-shadow)]"
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)] text-white"
            aria-hidden="true"
          >
            <Icon name="check" size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-[var(--solid-ink)]">スキャン完了</div>
            <div className="truncate text-[11px] text-[var(--color-muted)]">
              {scan.wordCount === null
                ? `「${scan.projectTitle}」に単語を追加しました`
                : `「${scan.projectTitle}」に${scan.wordCount}語追加しました`}
            </div>
          </div>
          <Link
            href={`/project/${scan.projectId}`}
            onClick={() => onDismiss(scan.id)}
            className="shrink-0 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] px-3 py-1 text-[12px] font-bold text-[var(--color-on-accent)] shadow-[2px_2px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)]"
          >
            開く
          </Link>
          <button
            type="button"
            onClick={() => onDismiss(scan.id)}
            aria-label="スキャン完了の表示を閉じる"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export interface ScanFailedItem {
  id: string;
  projectTitle: string;
  /** 既存の単語帳へ追加しようとして失敗したなら、その単語帳ID */
  targetProjectId: string | null;
  /** 失敗理由 */
  message: string;
}

/**
 * スキャンが失敗したら「スキャン中」と同じ位置に出す失敗バナー。
 * 理由と、撮り直すための導線を出す。既存の単語帳への追加だったなら
 * その単語帳へ、新規作成だったならスキャンをもう一度開く。閉じるまで残る。
 */
export function ScanFailedBanner({
  scans,
  onDismiss,
  onRetryScan,
  className = '',
}: {
  scans: ScanFailedItem[];
  onDismiss: (jobId: string) => void;
  /** 新規作成で失敗したときの「もう一度スキャン」。無ければボタンを出さない */
  onRetryScan?: () => void;
  className?: string;
}) {
  if (scans.length === 0) return null;

  const actionClassName =
    'shrink-0 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-1 text-[12px] font-bold text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)]';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {scans.map((scan) => (
        <div
          key={scan.id}
          role="alert"
          className="rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-surface)] px-3 py-2.5 shadow-[2px_3px_0_var(--solid-shadow)]"
        >
          <div className="flex items-start gap-3">
            <div
              className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-error)] text-white"
              aria-hidden="true"
            >
              <Icon name="priority_high" size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[var(--color-error)]">スキャン失敗</div>
              <div className="truncate text-[11px] font-bold text-[var(--solid-ink)]">
                {scan.targetProjectId
                  ? `「${scan.projectTitle}」に単語を追加できませんでした`
                  : `「${scan.projectTitle}」を作成できませんでした`}
              </div>
              <p className="mt-0.5 text-[11px] leading-[1.5] text-[var(--color-muted)]">{scan.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(scan.id)}
              aria-label="スキャン失敗の表示を閉じる"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {(scan.targetProjectId || onRetryScan) && (
            <div className="mt-2 flex justify-end">
              {scan.targetProjectId ? (
                <Link
                  href={`/project/${scan.targetProjectId}`}
                  onClick={() => onDismiss(scan.id)}
                  className={actionClassName}
                >
                  単語帳を開いて撮り直す
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onDismiss(scan.id);
                    onRetryScan?.();
                  }}
                  className={actionClassName}
                >
                  もう一度スキャン
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
