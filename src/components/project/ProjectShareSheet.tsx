'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';
import type { ProjectShareScope } from '@/types';
import { formatSharedTag, parseSharedTagsInput } from '../../../shared/shared-tags';

function buildShareUrl(shareId: string): string {
  const path = `/share/${encodeURIComponent(shareId)}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

type ProjectShareSheetProps = {
  open: boolean;
  onClose: () => void;
  projectTitle: string;
  shareId: string | undefined;
  shareScope: ProjectShareScope;
  preparing: boolean;
  updatingScope: boolean;
  sharedTags?: string[];
  updatingTags?: boolean;
  onSelectScope: (scope: ProjectShareScope) => Promise<void>;
  onSaveSharedTags?: (tags: string[]) => Promise<void>;
  onCopyShareLink: (shareUrl: string) => void | Promise<void>;
  onShareLink: (shareUrl: string) => void | Promise<void>;
  shareLinkCopied: boolean;
  groups?: StudyGroupSummary[];
  groupsLoading?: boolean;
  groupsError?: string | null;
  groupSharingUpdatingId?: string | null;
  onToggleGroupShare?: (group: StudyGroupSummary) => void;
};

export function ProjectShareSheet({
  open,
  onClose,
  projectTitle,
  shareId,
  preparing,
  sharedTags = [],
  updatingTags = false,
  onSaveSharedTags,
  onCopyShareLink,
  onShareLink,
  shareLinkCopied,
}: ProjectShareSheetProps) {
  const sharedTagsValue = sharedTags.map(formatSharedTag).join(', ');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);

  if (!open) return null;

  const shareUrl = shareId ? buildShareUrl(shareId) : '';

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
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(88vh, 720px)',
            overflowY: 'auto',
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
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="mb-3">
            {!tagsOpen ? (
              <button
                type="button"
                disabled={preparing || !onSaveSharedTags}
                onClick={() => setTagsOpen(true)}
                className="flex w-full items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-left disabled:opacity-40"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]">
                  <Icon name="sell" size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-[var(--solid-ink)]">タグ</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-muted)]">
                    {sharedTagsValue || 'タグを追加'}
                  </div>
                </div>
                <Icon name="chevron_right" size={16} className="shrink-0 text-[var(--color-muted)]" />
              </button>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                  <Icon name="sell" size={11} />
                  タグ
                </div>
                <div className="flex gap-2">
                  <input
                    key={sharedTagsValue}
                    ref={tagInputRef}
                    defaultValue={sharedTagsValue}
                    autoFocus
                    placeholder="例: #TOEIC, #熟語, #高校英語"
                    className="min-w-0 flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-[12px] font-bold text-[var(--solid-ink)] outline-none"
                  />
                  <button
                    type="button"
                    disabled={preparing || updatingTags || !onSaveSharedTags}
                    onClick={() => void onSaveSharedTags?.(parseSharedTagsInput(tagInputRef.current?.value ?? sharedTagsValue))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-[12px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
                  >
                    <Icon name={updatingTags ? 'progress_activity' : 'check'} size={14} className={updatingTags ? 'animate-spin' : undefined} />
                    保存
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              <Icon name="group" size={11} />
              グループ
            </div>
            <div className="flex max-h-[150px] flex-col gap-2 overflow-y-auto pr-1">
              {groupsLoading ? (
                <div className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3 text-[12px] text-[var(--color-muted)]">
                  <Icon name="progress_activity" size={14} className="animate-spin" />
                  読み込み中...
                </div>
              ) : groups.length === 0 ? (
                <div className="rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-3 text-[12px] text-[var(--color-muted)]">
                  所属グループはまだありません
                </div>
              ) : (
                groups.map((group) => {
                  const updating = groupSharingUpdatingId === group.id;
                  const shared = Boolean(group.projectShared);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      aria-label={`${group.name}のグループ共有を${shared ? '解除' : '掲載'}`}
                      disabled={preparing || updating || !onToggleGroupShare}
                      onClick={() => onToggleGroupShare?.(group)}
                      className="flex items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-left disabled:opacity-50"
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--solid-ink)]"
                        style={{ background: shared ? 'var(--solid-ink)' : '#fff', color: shared ? '#fff' : 'var(--solid-ink)' }}
                      >
                        <Icon name={updating ? 'progress_activity' : shared ? 'check' : 'group'} size={15} className={updating ? 'animate-spin' : undefined} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-[var(--solid-ink)]">{group.name}</div>
                        <div className="mt-0.5 font-mono text-[9px] text-[var(--color-muted)]">
                          {group.memberCount}人 · {group.projectCount}冊
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--solid-ink)] px-2 py-0.5 text-[10px] font-bold text-[var(--solid-ink)]">
                        {shared ? '共有解除' : '掲載'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {groupsError && (
              <div className="mt-2 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
                {groupsError}
              </div>
            )}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={preparing || !shareUrl}
              onClick={() => void onShareLink(shareUrl)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
            >
              <Icon name={preparing ? 'progress_activity' : 'ios_share'} size={15} className={preparing ? 'animate-spin' : undefined} />
              共有
            </button>
            <button
              type="button"
              disabled={preparing || !shareUrl}
              onClick={() => void onCopyShareLink(shareUrl)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
            >
              <Icon name={shareLinkCopied ? 'check' : preparing ? 'progress_activity' : 'content_copy'} size={15} className={preparing ? 'animate-spin' : undefined} />
              コピー
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
