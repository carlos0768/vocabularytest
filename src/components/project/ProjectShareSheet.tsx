'use client';

import { Icon } from '@/components/ui';
import type { ProjectShareScope } from '@/types';

export function formatShareInviteCode(shareId: string): string {
  const compact = shareId.replace(/-/g, '');
  const parts: string[] = [];
  for (let i = 0; i < compact.length; i += 4) {
    parts.push(compact.slice(i, i + 4));
  }
  return parts.join('-');
}

type ProjectShareSheetProps = {
  open: boolean;
  onClose: () => void;
  projectTitle: string;
  shareId: string | undefined;
  shareScope: ProjectShareScope;
  preparing: boolean;
  updatingScope: boolean;
  onSelectScope: (scope: ProjectShareScope) => Promise<void>;
  onCopyInviteCode: () => void;
  inviteCodeCopied: boolean;
};

export function ProjectShareSheet({
  open,
  onClose,
  projectTitle,
  shareId,
  shareScope,
  preparing,
  updatingScope,
  onSelectScope,
  onCopyInviteCode,
  inviteCodeCopied,
}: ProjectShareSheetProps) {
  if (!open) return null;

  const scopeSummary =
    shareScope === 'public'
      ? '公開ノートとして共有ページに表示されます'
      : '非公開のまま招待コードで参加できます';

  const scopeDescription =
    shareScope === 'public'
      ? '共有タブの公開ノート一覧からそのまま見つけられます。'
      : '非公開のノートです。招待コードで参加してもらえます。';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg bg-[var(--color-background)] rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[min(90vh,640px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--color-border-light)]">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center text-[var(--color-foreground)]"
            aria-label="閉じる"
          >
            <Icon name="close" size={20} />
          </button>
          <h2 className="text-base font-bold text-[var(--color-foreground)]">共有</h2>
          <span className="w-10" />
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-5">
          <p className="text-sm text-[var(--color-muted)] line-clamp-2">{projectTitle}</p>

          <div>
            <h3 className="text-base font-bold text-[var(--color-foreground)]">公開設定</h3>
            <p className="text-sm text-[var(--color-muted)] mt-2">
              公開ノートは共有ページの一覧からそのまま見られます。非公開は招待コードでの参加に限定されます。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={updatingScope || preparing}
              onClick={() => void onSelectScope('public')}
              className={`rounded-2xl border p-3.5 text-left transition-colors disabled:opacity-50 ${
                shareScope === 'public'
                  ? 'border-[var(--color-success)] bg-[var(--color-success)]/10 ring-1 ring-[var(--color-success)]/40'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-secondary)]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-[var(--color-foreground)]">公開</span>
                <Icon
                  name={shareScope === 'public' ? 'check_circle' : 'radio_button_unchecked'}
                  size={18}
                  className={shareScope === 'public' ? 'text-[var(--color-success)]' : 'text-[var(--color-muted)]'}
                />
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1.5 leading-snug">共有ページに一覧表示</p>
            </button>
            <button
              type="button"
              disabled={updatingScope || preparing}
              onClick={() => void onSelectScope('private')}
              className={`rounded-2xl border p-3.5 text-left transition-colors disabled:opacity-50 ${
                shareScope === 'private'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/30'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-secondary)]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-[var(--color-foreground)]">非公開</span>
                <Icon
                  name={shareScope === 'private' ? 'check_circle' : 'radio_button_unchecked'}
                  size={18}
                  className={shareScope === 'private' ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}
                />
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1.5 leading-snug">招待コードで参加</p>
            </button>
          </div>

          {updatingScope ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Icon name="progress_activity" size={18} className="animate-spin" />
              公開設定を更新中...
            </div>
          ) : null}

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--color-muted)]">招待コード</span>
              <button
                type="button"
                disabled={preparing || !shareId}
                onClick={onCopyInviteCode}
                className="text-xs font-bold text-[var(--color-primary)] disabled:opacity-40"
              >
                {inviteCodeCopied ? 'コピー済み' : 'コピー'}
              </button>
            </div>
            {preparing || !shareId ? (
              <div className="h-9 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                <Icon name="progress_activity" size={18} className="animate-spin" />
                準備中...
              </div>
            ) : (
              <p className="text-xl font-bold font-mono tracking-wide text-[var(--color-foreground)] break-all">
                {formatShareInviteCode(shareId)}
              </p>
            )}
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">{scopeDescription}</p>
            <p className="text-xs font-medium text-[var(--color-foreground)]/80">{scopeSummary}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
