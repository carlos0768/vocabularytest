'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesktopSidebar } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { remoteRepository } from '@/lib/db/remote-repository';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { invalidateHomeCache } from '@/lib/home-cache';
import { triggerHaptic } from '@/lib/haptics';
import { parseSharedTagsInput } from '../../../../shared/shared-tags';
import type { Project } from '@/types';
import type { SharedProjectCard } from '@/lib/shared-projects/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

type PublishResponse = {
  success?: boolean;
  error?: string;
  wordbook?: { project?: { shareId?: string } };
};

type MySharedResponse = {
  success?: boolean;
  error?: string;
  wordbooks?: SharedProjectCard[];
};

export default function ShareWordbookClient() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [sharedWordbooks, setSharedWordbooks] = useState<SharedProjectCard[]>([]);
  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const loadProjects = useCallback(async () => {
    if (!user || !isPro) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [ownProjects, sharedResponse] = await Promise.all([
        remoteRepository.getProjects(user.id),
        fetch('/api/shared-projects/share-wordbook', { cache: 'no-store' })
          .then((response) => response.json().catch(() => null) as Promise<MySharedResponse | null>)
          .catch(() => null),
      ]);
      setProjects(excludeReelSavedProjects(ownProjects));
      if (sharedResponse?.success) {
        setSharedWordbooks(sharedResponse.wordbooks ?? []);
      }
    } catch (error) {
      console.error('Failed to load projects for sharing:', error);
      setLoadError('単語帳を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [isPro, user]);

  useEffect(() => {
    if (authLoading || !user || !isPro) return;
    void loadProjects();
  }, [authLoading, isPro, loadProjects, user]);

  const handleStopShare = async (card: SharedProjectCard) => {
    const sharedId = card.project.id;
    if (stoppingId) return;
    if (confirmingStopId !== sharedId) {
      triggerHaptic();
      setConfirmingStopId(sharedId);
      return;
    }
    setStoppingId(sharedId);
    try {
      const response = await fetch(`/api/shared-projects/share-wordbook/${encodeURIComponent(sharedId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'unpublish_failed');
      }
      setSharedWordbooks((current) => current.filter((item) => item.project.id !== sharedId));
      setConfirmingStopId(null);
      invalidateHomeCache();
      showToast({ message: '共有を停止しました', type: 'success' });
    } catch (error) {
      const message = error instanceof Error && error.message !== 'unpublish_failed'
        ? error.message
        : '共有の停止に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setStoppingId(null);
    }
  };

  const handlePublish = async () => {
    if (!selectedProject || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/shared-projects/share-wordbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          sharedTags: parseSharedTagsInput(tagDraft),
        }),
      });
      const payload = await response.json().catch(() => null) as PublishResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'publish_failed');
      }
      invalidateHomeCache();
      showToast({ message: '単語帳を共有しました', type: 'success' });
      router.push('/shared');
    } catch (error) {
      const message = error instanceof Error && error.message !== 'publish_failed'
        ? error.message
        : '共有に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ===== モバイル/デスクトップで共有する表示ブロック =====

  const sharedSection = user && isPro && sharedWordbooks.length > 0 ? (
    <div>
      <div className="mb-2 flex items-center gap-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <Icon name="public" size={13} />
        共有中の単語帳
        <span className="tabular-nums">{sharedWordbooks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {sharedWordbooks.map((card) => (
          <SharedWordbookRow
            key={card.project.id}
            card={card}
            confirming={confirmingStopId === card.project.id}
            stopping={stoppingId === card.project.id}
            onStop={() => void handleStopShare(card)}
            onCancel={() => setConfirmingStopId(null)}
          />
        ))}
      </div>
    </div>
  ) : null;

  // ログイン/Pro/読込などのゲート状態。null なら選択リストを表示できる。
  const gateState = authLoading ? (
    <CenterState icon="progress_activity" spin message="確認中..." />
  ) : !user ? (
    <ActionState
      icon="login"
      message="ログインすると単語帳を共有できます。"
      actionLabel="ログイン"
      onAction={() => router.push('/login?redirect=/shared/share-wordbook')}
    />
  ) : !isPro ? (
    <ActionState
      icon="auto_awesome"
      message="単語帳の共有はProプラン限定です。"
      actionLabel="Proを見る"
      onAction={() => router.push('/subscription')}
    />
  ) : loading ? (
    <CenterState icon="progress_activity" spin message="読み込み中..." />
  ) : loadError ? (
    <div className="px-[18px] pt-6">
      <div className="rounded-[12px] border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
        {loadError}
        <button type="button" className="ml-2 underline" onClick={() => void loadProjects()}>再読み込み</button>
      </div>
    </div>
  ) : projects.length === 0 ? (
    <div className="px-[18px] pt-10 text-center text-sm font-bold text-[var(--color-muted)]">
      共有できる単語帳がありません
    </div>
  ) : null;

  const selectionList = gateState === null ? (
    <div className="flex flex-col gap-2.5">
      {sharedWordbooks.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          <Icon name="add" size={13} />
          新しく共有する
        </div>
      )}
      {projects.map((project) => {
        const selected = selectedId === project.id;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => setSelectedId(project.id)}
            className="flex items-center gap-3 rounded-[14px] border-2 bg-white px-3 py-3 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
            style={{ borderColor: selected ? 'var(--color-accent)' : 'var(--solid-ink)' }}
          >
            <span
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[20px] font-extrabold text-white"
              style={{
                background: project.iconImage ? undefined : thumbColor(project.id),
                backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
              }}
            >
              {!project.iconImage && project.title.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{project.title}</span>
              {project.description && (
                <span className="mt-0.5 block truncate text-[11px] text-[var(--color-muted)]">{project.description}</span>
              )}
            </span>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
              style={{
                borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
                background: selected ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {selected && <Icon name="check" size={14} className="text-white" />}
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  const publishForm = (
    <>
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <Icon name="sell" size={11} />
        タグ（任意）
      </div>
      <input
        value={tagDraft}
        onChange={(event) => setTagDraft(event.target.value)}
        placeholder="例: #TOEIC, #熟語, #高校英語"
        className="mb-2.5 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] outline-none"
      />
      <button
        type="button"
        onClick={() => void handlePublish()}
        disabled={!selectedProject || saving}
        className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-45"
      >
        <Icon name={saving ? 'progress_activity' : 'ios_share'} size={17} className={saving ? 'animate-spin' : undefined} />
        {saving ? '共有中...' : selectedProject ? `「${selectedProject.title}」を共有` : '単語帳を選択'}
      </button>
    </>
  );

  const showPublishPanel = user && isPro && projects.length > 0 && gateState === null;

  return (
    <>
      {/* Desktop: サイドバー付きの標準シェル。公開フォームは右カラムに常設 */}
      <div className="hidden h-screen lg:block">
        <div className="ds-app">
          <DesktopSidebar />
          <div className="ds-main">
            <div className="ds-top">
              <button
                type="button"
                className="ds-iconbtn"
                onClick={() => router.back()}
                style={{ width: 38, height: 38 }}
                aria-label="戻る"
              >
                <Icon name="arrow_back" />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="crumb">共有ライブラリ / 共有</div>
                <h1>共有する単語帳を選ぶ</h1>
              </div>
            </div>
            <div
              className="ds-scroll"
              style={{
                display: 'grid',
                gridTemplateColumns: showPublishPanel ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
                gap: 26,
                alignItems: 'start',
                width: 'min(100%, 940px)',
                margin: '0 auto',
              }}
            >
              <div className="flex flex-col gap-5">
                {sharedSection}
                {gateState}
                {selectionList}
              </div>
              {showPublishPanel && (
                <div className="ds-card" style={{ position: 'sticky', top: 0, padding: '18px 20px' }}>
                  {publishForm}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[150px] font-[var(--font-body)] lg:hidden">
        <div className="flex items-center gap-3 px-[18px] pb-2 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="戻る"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="chevron_left" size={18} />
          </button>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">SHARE</div>
            <div className="font-display text-[20px] font-extrabold leading-[1.1] text-[var(--solid-ink)]">共有する単語帳を選ぶ</div>
          </div>
        </div>

        {sharedSection && <div className="px-[14px] pt-2">{sharedSection}</div>}
        {gateState}
        {selectionList && <div className="px-[14px] pt-3">{selectionList}</div>}

        {showPublishPanel && (
          <div
            className="fixed bottom-0 left-0 right-0 z-30 border-t-2 border-[var(--solid-ink)] bg-[#faf7f1] px-4 pt-3"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            {publishForm}
          </div>
        )}
      </div>
    </>
  );
}

function SharedWordbookRow({
  card,
  confirming,
  stopping,
  onStop,
  onCancel,
}: {
  card: SharedProjectCard;
  confirming: boolean;
  stopping: boolean;
  onStop: () => void;
  onCancel: () => void;
}) {
  const { project } = card;
  return (
    <div className="flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[16px] font-extrabold text-white"
        style={{
          background: project.iconImage ? undefined : thumbColor(project.id),
          backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
        }}
      >
        {!project.iconImage && project.title.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[14px] font-bold text-[var(--solid-ink)]">{project.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-0.5"><Icon name="menu_book" size={12} />{card.wordCount ?? 0}語</span>
          {(card.likeCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5"><Icon name="favorite" size={12} />{card.likeCount}</span>
          )}
        </span>
      </span>

      {stopping ? (
        <span className="inline-flex h-8 items-center gap-1 rounded-[9px] border-2 border-[var(--color-border)] px-2.5 text-[12px] font-bold text-[var(--color-muted)]">
          <Icon name="progress_activity" size={14} className="animate-spin" />
        </span>
      ) : confirming ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded-[9px] border-2 border-[var(--color-border)] bg-white px-2.5 text-[12px] font-bold text-[var(--color-muted)]"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-8 items-center gap-1 rounded-[9px] border-2 border-red-700 bg-red-700 px-2.5 text-[12px] font-extrabold text-white"
          >
            <Icon name="link_off" size={14} />
            停止する
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] border-2 border-red-700 bg-white px-2.5 text-[12px] font-bold text-red-700 transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="link_off" size={14} />
          共有停止
        </button>
      )}
    </div>
  );
}

function CenterState({ icon, message, spin = false }: { icon: string; message: string; spin?: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 px-6 py-16 text-sm font-bold text-[var(--color-muted)]">
      <Icon name={icon} size={18} className={spin ? 'animate-spin' : undefined} />
      {message}
    </div>
  );
}

function ActionState({
  icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="px-[18px] pt-10">
      <div className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-6 text-center">
        <Icon name={icon} size={30} className="text-[var(--solid-ink)]" />
        <div className="mt-3 text-[14px] font-bold text-[var(--solid-ink)]">{message}</div>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-2.5 text-[13px] font-extrabold text-white"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
