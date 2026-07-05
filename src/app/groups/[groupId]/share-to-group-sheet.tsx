'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Project } from '@/types';
import { thumbColor } from './member-ui';

export function ShareToGroupSheet({
  open,
  groupId,
  groupName,
  userId,
  isPro,
  sharedProjectIds,
  onClose,
  onShared,
}: {
  open: boolean;
  groupId: string;
  groupName: string;
  userId: string | null;
  isPro: boolean;
  sharedProjectIds: string[];
  onClose: () => void;
  onShared: () => void;
}) {
  const { showToast } = useToast();
  const [ownProjects, setOwnProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sharedSet = useMemo(() => new Set(sharedProjectIds), [sharedProjectIds]);

  useEffect(() => {
    if (!open || !userId || !isPro) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    remoteRepository.getProjects(userId)
      .then((projects) => {
        if (!cancelled) setOwnProjects(projects);
      })
      .catch((error) => {
        console.warn('Failed to load own projects for group share:', error);
        if (!cancelled) setLoadError('単語帳を読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId, isPro]);

  if (!open) return null;

  const handleShare = async (project: Project) => {
    if (savingId) return;
    triggerHaptic();
    setSavingId(project.id);
    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(groupId)}/projects/${encodeURIComponent(project.id)}`,
        { method: 'POST' },
      );
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; code?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'share_to_group_failed');
      }
      showToast({ message: `「${project.title}」を共有しました`, type: 'success' });
      onShared();
    } catch (error) {
      const message = error instanceof Error ? error.message : '共有に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 cursor-default" style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 520,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(82vh, 680px)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">SHARE TO GROUP</div>
              <div className="mt-0.5 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">{groupName}に共有</div>
            </div>
            <button type="button" onClick={onClose} aria-label="閉じる" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]">
              <Icon name="close" size={14} />
            </button>
          </div>

          {!userId ? (
            <SheetNote icon="login" message="ログインが必要です。" />
          ) : !isPro ? (
            <div className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white p-4 text-center">
              <Icon name="auto_awesome" size={28} className="text-[var(--solid-ink)]" />
              <div className="mt-2 text-[13px] font-bold text-[var(--solid-ink)]">グループへの単語帳共有はPro限定です。</div>
              <Link href="/subscription" className="mt-3 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 text-[12px] font-extrabold text-white">Proを見る</Link>
            </div>
          ) : loading ? (
            <SheetNote icon="progress_activity" spin message="単語帳を読み込み中..." />
          ) : loadError ? (
            <SheetNote icon="error" message={loadError} />
          ) : ownProjects.length === 0 ? (
            <SheetNote icon="menu_book" message="共有できる単語帳がありません。" />
          ) : (
            <div className="flex flex-col gap-2">
              {ownProjects.map((project) => {
                const alreadyShared = sharedSet.has(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    disabled={alreadyShared || Boolean(savingId)}
                    onClick={() => void handleShare(project)}
                    className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-55"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
                      style={{ backgroundColor: thumbColor(project.id) }}
                    >
                      {project.title.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold text-[var(--solid-ink)]">{project.title}</span>
                    {alreadyShared ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-accent)]"><Icon name="check_circle" size={15} />共有済み</span>
                    ) : (
                      <Icon name={savingId === project.id ? 'progress_activity' : 'add_circle'} size={20} className={`shrink-0 text-[var(--solid-ink)] ${savingId === project.id ? 'animate-spin' : ''}`} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetNote({ icon, message, spin = false }: { icon: string; message: string; spin?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-3 text-[12px] font-bold text-[var(--color-muted)]">
      <Icon name={icon} size={15} className={spin ? 'animate-spin' : undefined} />
      {message}
    </div>
  );
}
