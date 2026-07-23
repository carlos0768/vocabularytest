'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { Project, SubscriptionStatus } from '@/types';

// バインダー (フォルダ) 詳細。中の単語帳を一覧し、単語帳の追加/解除と、
// バインダーごとの共有ライブラリ公開を行う。マイ単語帳と同じ配色のタイルを使う。

// 単語帳タイルと同じ配色 (home-client / projects の THUMBS と同一)
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];
function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

function normalizeBinder(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export default function BinderDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = use(params);
  const binderName = decodeURIComponent(rawName);
  const router = useRouter();
  const { user, subscription, isPro } = useAuth();
  const { showToast } = useToast();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userId = user ? user.id : getGuestUserId();
      setProjects(await repository.getProjects(userId));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [repository, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const inBinder = useMemo(
    () => projects.filter((p) => normalizeBinder(p.binder) === binderName),
    [projects, binderName],
  );
  const addable = useMemo(
    () => projects.filter((p) => normalizeBinder(p.binder) !== binderName),
    [projects, binderName],
  );

  const setBinder = async (projectId: string, binder: string | null, failMessage: string) => {
    if (busyId) return;
    setBusyId(projectId);
    try {
      await repository.updateProject(projectId, { binder });
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, binder } : p)));
      invalidateHomeCache();
    } catch {
      showToast({ message: failMessage, type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  // バインダー内の単語帳をまとめて共有ライブラリに公開する (Pro限定)
  const handlePublishBinder = async () => {
    if (publishing || inBinder.length === 0) return;
    if (!isPro) {
      showToast({ message: '共有ライブラリへの公開はProプラン限定です', type: 'error' });
      return;
    }
    if (!window.confirm(`「${binderName}」内の${inBinder.length}冊を共有ライブラリに公開しますか？`)) return;
    setPublishing(true);
    let ok = 0;
    for (const project of inBinder) {
      try {
        const res = await fetch('/api/shared-projects/share-wordbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, sharedTags: [binderName] }),
        });
        const payload = (await res.json().catch(() => null)) as { success?: boolean } | null;
        if (res.ok && payload?.success) ok += 1;
      } catch {
        // 続行して残りを公開する
      }
    }
    setPublishing(false);
    invalidateHomeCache();
    showToast({
      message: ok === inBinder.length ? `${ok}冊を公開しました` : `${ok}/${inBinder.length}冊を公開しました`,
      type: ok > 0 ? 'success' : 'error',
    });
  };

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-32 pt-3 font-[var(--font-body)] lg:max-w-[720px] lg:px-8 lg:pt-8">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 pt-1">
        <button
          type="button"
          onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push('/'))}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">BINDER</div>
          <div className="flex items-center gap-1.5">
            <Icon name="folder" size={18} filled className="shrink-0 text-[var(--solid-ink)]" />
            <span className="truncate font-display text-xl font-extrabold text-[var(--solid-ink)]">{binderName}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{inBinder.length}冊</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white text-[13px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="add" size={17} />
          単語帳を追加
        </button>
        <button
          type="button"
          onClick={() => void handlePublishBinder()}
          disabled={publishing || inBinder.length === 0}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[13px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
        >
          <Icon name={publishing ? 'progress_activity' : 'public'} size={17} className={publishing ? 'animate-spin' : ''} />
          {publishing ? '公開中...' : 'バインダーを公開'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="ml-2 text-sm">読み込み中...</span>
        </div>
      ) : inBinder.length === 0 ? (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
          <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
            このバインダーにはまだ単語帳がありません。「単語帳を追加」から入れましょう。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {inBinder.map((project) => (
            <div
              key={project.id}
              className="flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-[13px]"
            >
              <Link href={`/project/${project.id}`} className="flex min-w-0 flex-1 items-center gap-3 no-underline">
                <span
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[18px] font-extrabold text-white"
                  style={{ backgroundColor: thumbColor(project.id), backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
                >
                  {!project.iconImage && project.title.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--solid-ink)]">{project.title}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void setBinder(project.id, null, '解除に失敗しました')}
                disabled={busyId !== null}
                aria-label="バインダーから外す"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 単語帳を追加するピッカー */}
      {addOpen && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div className="absolute inset-0" style={{ background: 'rgba(26,26,26,0.45)' }} onClick={() => setAddOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[560px] rounded-t-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)]" style={{ maxHeight: '78dvh' }}>
            <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] px-4 py-3">
              <span className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">バインダーに追加</span>
              <button type="button" onClick={() => setAddOpen(false)} aria-label="閉じる" className="flex h-8 w-8 items-center justify-center text-[var(--color-secondary-text)]">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(78dvh - 52px)' }}>
              {addable.length === 0 ? (
                <p className="m-0 px-2 py-8 text-center text-[13px] text-[var(--color-muted)]">追加できる単語帳がありません。</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {addable.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void setBinder(project.id, binderName, '追加に失敗しました')}
                      disabled={busyId !== null}
                      className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white p-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[14px] font-extrabold text-white"
                        style={{ backgroundColor: thumbColor(project.id), backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
                      >
                        {!project.iconImage && project.title.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-[var(--solid-ink)]">{project.title}</span>
                        {normalizeBinder(project.binder) && (
                          <span className="block truncate font-mono text-[9px] text-[var(--color-muted)]">現在: {normalizeBinder(project.binder)}</span>
                        )}
                      </span>
                      <Icon name="add" size={17} className="shrink-0 text-[var(--solid-ink)]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
