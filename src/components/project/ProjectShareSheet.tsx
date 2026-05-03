'use client';

import { Icon } from '@/components/ui/Icon';
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
      ? '公開単語帳として共有ページに表示されます'
      : '非公開のまま招待コードで参加できます';

  const scopeDescription =
    shareScope === 'public'
      ? '共有タブの公開単語帳一覧からそのまま見つけられます。'
      : '非公開の単語帳です。招待コードで参加してもらえます。';

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />

      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 480,
            background: '#faf7f1',
            border: '1.5px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                SHARE
              </div>
              <div className="mt-0.5 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
                {projectTitle}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              <Icon name="chevron_right" size={11} />
              公開設定
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={updatingScope || preparing}
                onClick={() => void onSelectScope('public')}
                className="rounded-[10px] border-[1.25px] border-[var(--solid-ink)] p-3 text-left transition-all disabled:opacity-50"
                style={{
                  background: shareScope === 'public' ? 'var(--solid-ink)' : '#fff',
                  color: shareScope === 'public' ? '#fff' : 'var(--solid-ink)',
                  boxShadow: shareScope === 'public' ? '2px 2px 0 var(--solid-ink)' : 'none',
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13px] font-bold">公開</span>
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ border: shareScope === 'public' ? '1.5px solid #fff' : '1.5px solid var(--solid-ink)' }}
                  >
                    {shareScope === 'public' && <div className="h-[7px] w-[7px] rounded-full bg-white" />}
                  </div>
                </div>
                <p
                  className="mt-1 text-[10.5px] leading-[1.4]"
                  style={{ color: shareScope === 'public' ? 'rgba(255,255,255,0.65)' : 'var(--color-muted)' }}
                >
                  共有ページに一覧表示
                </p>
              </button>
              <button
                type="button"
                disabled={updatingScope || preparing}
                onClick={() => void onSelectScope('private')}
                className="rounded-[10px] border-[1.25px] border-[var(--solid-ink)] p-3 text-left transition-all disabled:opacity-50"
                style={{
                  background: shareScope === 'private' ? 'var(--solid-ink)' : '#fff',
                  color: shareScope === 'private' ? '#fff' : 'var(--solid-ink)',
                  boxShadow: shareScope === 'private' ? '2px 2px 0 var(--solid-ink)' : 'none',
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13px] font-bold">非公開</span>
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ border: shareScope === 'private' ? '1.5px solid #fff' : '1.5px solid var(--solid-ink)' }}
                  >
                    {shareScope === 'private' && <div className="h-[7px] w-[7px] rounded-full bg-white" />}
                  </div>
                </div>
                <p
                  className="mt-1 text-[10.5px] leading-[1.4]"
                  style={{ color: shareScope === 'private' ? 'rgba(255,255,255,0.65)' : 'var(--color-muted)' }}
                >
                  招待コードで参加
                </p>
              </button>
            </div>

            {updatingScope && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
                <Icon name="progress_activity" size={14} className="animate-spin" />
                公開設定を更新中...
              </div>
            )}
          </div>

          <div className="mb-3 rounded-[10px] border border-dashed border-[var(--solid-ink)] bg-[rgba(26,26,26,0.04)] p-[11px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                招待コード
              </span>
              <button
                type="button"
                disabled={preparing || !shareId}
                onClick={onCopyInviteCode}
                className="inline-flex items-center gap-1 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-2.5 py-1 text-[10.5px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
              >
                <Icon name={inviteCodeCopied ? 'check' : 'content_copy'} size={11} />
                {inviteCodeCopied ? 'コピー済み' : 'コピー'}
              </button>
            </div>
            {preparing || !shareId ? (
              <div className="flex h-9 items-center gap-2 text-[12px] text-[var(--color-muted)]">
                <Icon name="progress_activity" size={14} className="animate-spin" />
                準備中...
              </div>
            ) : (
              <p className="break-all font-mono text-[18px] font-bold tracking-wide text-[var(--solid-ink)]">
                {formatShareInviteCode(shareId)}
              </p>
            )}
            <p className="mt-1.5 text-[10.5px] leading-[1.5] text-[var(--color-muted)]">{scopeDescription}</p>
            <p className="mt-0.5 text-[10.5px] font-bold leading-[1.5] text-[var(--solid-ink)]">{scopeSummary}</p>
          </div>

          <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-[rgba(19,127,236,0.3)] bg-[rgba(19,127,236,0.06)] px-[11px] py-[9px]">
            <Icon name="info" size={14} className="text-[#137fec]" />
            <span className="text-[11px] leading-[1.5] text-[var(--color-muted)]">
              招待コードまたは共有ページから他のユーザーがこの単語帳を取得できます。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
