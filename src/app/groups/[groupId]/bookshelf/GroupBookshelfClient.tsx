'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DesktopButton } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { triggerHaptic } from '@/lib/haptics';
import type { SharedProjectCard, StudyGroupSummary } from '@/lib/shared-projects/types';
import { thumbColor } from '../member-ui';
import { ShareToGroupSheet } from '../share-to-group-sheet';

type OverviewResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  projects?: SharedProjectCard[];
  error?: string;
};

export default function GroupBookshelfClient() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const { user, isPro, loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as OverviewResponse | null;
      if (!response.ok || !payload?.success || !payload.group) {
        throw new Error(payload?.error || 'group_overview_failed');
      }
      setGroup(payload.group);
      setProjects(payload.projects ?? []);
    } catch (loadError) {
      console.warn('Failed to load group bookshelf:', loadError);
      setError('本棚を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load]);

  const handleRemoveProject = useCallback(async (card: SharedProjectCard) => {
    if (!groupId || removingProjectId) return;
    triggerHaptic();
    setRemovingProjectId(card.project.id);
    try {
      const response = await fetch(
        `/api/shared-projects/groups/${encodeURIComponent(groupId)}/projects/${encodeURIComponent(card.project.id)}`,
        { method: 'DELETE' },
      );
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'remove_group_project_failed');
      }

      setProjects((current) => current.filter((entry) => entry.project.id !== card.project.id));
      setGroup((current) => current ? {
        ...current,
        projectCount: Math.max(0, current.projectCount - 1),
      } : current);
      showToast({ message: 'グループ共有を解除しました', type: 'success' });
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'グループ共有の解除に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setRemovingProjectId(null);
    }
  }, [groupId, removingProjectId, showToast]);

  const stateView = authLoading || loading ? (
    <LoadingState />
  ) : !isAuthenticated ? (
    <CenteredCard icon="lock" title="ログインが必要です">
      <Link href="/login?redirect=/shared" className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-3 font-display text-sm font-bold text-white">
        ログイン
      </Link>
    </CenteredCard>
  ) : error || !group ? (
    <CenteredCard icon="error" title={error ?? 'グループが見つかりません'}>
      <button type="button" onClick={() => void load()} className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-5 py-3 font-display text-sm font-bold text-[var(--solid-ink)]">
        再読み込み
      </button>
    </CenteredCard>
  ) : null;

  const emptyShelf = (
    <div className="rounded-[16px] border-2 border-dashed border-[var(--color-border)] bg-white px-4 py-10 text-center">
      <Icon name="auto_stories" size={34} className="mx-auto text-[var(--color-muted)]" />
      <div className="mt-2 text-[13px] font-extrabold text-[var(--solid-ink)]">本棚はまだ空っぽ</div>
      <div className="mt-1 text-[12px] font-bold text-[var(--color-muted)]">最初の1冊を共有して本棚を作ろう！</div>
    </div>
  );

  const renderBooks = () => projects.map((card) => (
    <BookCard
      key={card.project.id}
      card={card}
      removing={removingProjectId === card.project.id}
      removeDisabled={removingProjectId !== null}
      onRemove={() => void handleRemoveProject(card)}
    />
  ));

  return (
    <>
      {/* Desktop */}
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <div className="ds-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">
              {group ? `共有ライブラリ / ${group.name}` : '共有ライブラリ / グループ'}
            </div>
            <h1>本棚{group ? `・${projects.length}冊` : ''}</h1>
          </div>
          <DesktopButton
            href={`/groups/${encodeURIComponent(groupId)}`}
            icon="arrow_back"
            variant="ghost"
          >
            グループへ戻る
          </DesktopButton>
          {group && (
            <DesktopButton variant="dark" icon="library_add" onClick={() => setShareSheetOpen(true)}>
              単語帳を共有
            </DesktopButton>
          )}
        </div>
        <div className="ds-scroll">
          {stateView ?? (group && (
            projects.length === 0 ? emptyShelf : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>
                {renderBooks()}
              </div>
            )
          ))}
        </div>
      </div>

      {/* Mobile */}
      <div
        className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] font-[var(--font-body)] lg:hidden"
        style={{
          paddingTop: 0,
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        {stateView ?? (group && (
          <div className="flex flex-col gap-4 px-[14px]">
            <BookshelfHeader groupId={groupId} groupName={group.name} bookCount={projects.length} />

            {projects.length === 0 ? emptyShelf : (
              <div className="grid grid-cols-2 gap-3">
                {renderBooks()}
              </div>
            )}

            <button
              type="button"
              onClick={() => { triggerHaptic(); setShareSheetOpen(true); }}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 font-display text-[14px] font-extrabold text-white shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <Icon name="library_add" size={18} />
              単語帳を共有
            </button>
          </div>
        ))}
      </div>

      <ShareToGroupSheet
        open={shareSheetOpen}
        groupId={groupId}
        groupName={group?.name ?? ''}
        userId={user?.id ?? null}
        isPro={isPro}
        sharedProjectIds={projects.map((card) => card.project.id)}
        onClose={() => setShareSheetOpen(false)}
        onShared={() => { setShareSheetOpen(false); void load(); }}
      />
    </>
  );
}

function BookshelfHeader({ groupId, groupName, bookCount }: { groupId: string; groupName: string; bookCount: number }) {
  return (
    <section
      className="rounded-[18px] border-2 border-[var(--solid-ink)] p-4"
      style={{ background: 'linear-gradient(150deg, #FFF6DE 0%, #FFE7BC 100%)' }}
    >
      <div className="flex items-center gap-2">
        <Link
          href={`/groups/${encodeURIComponent(groupId)}`}
          aria-label="グループに戻る"
          onClick={() => triggerHaptic()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="arrow_back" size={16} />
        </Link>
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          GROUP BOOKSHELF
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[#F5A623] text-white">
          <Icon name="auto_stories" size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-extrabold leading-tight text-[var(--solid-ink)]">本棚</h1>
          <div className="truncate text-[12px] font-bold text-[var(--color-muted)]">{groupName}・{bookCount}冊</div>
        </div>
      </div>
    </section>
  );
}

// A shared wordbook rendered as a pop "book": colorful cover with a spine
// strip, chunky border, and press-down shadow so it begs to be tapped.
function BookCard({
  card,
  removing,
  removeDisabled,
  onRemove,
}: {
  card: SharedProjectCard;
  removing: boolean;
  removeDisabled: boolean;
  onRemove: () => void;
}) {
  const href = card.project.shareId ? `/share/${card.project.shareId}` : '#';
  const canRemove = Boolean(card.canRemoveFromGroup);

  return (
    <div className="relative">
      {canRemove && (
        <button
          type="button"
          aria-label={`「${card.project.title}」のグループ共有を解除`}
          disabled={removeDisabled}
          onClick={onRemove}
          className="absolute -right-2 -top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          <Icon name={removing ? 'progress_activity' : 'remove_circle'} size={16} className={removing ? 'animate-spin' : undefined} />
        </button>
      )}
      <Link
        href={href}
        onClick={() => triggerHaptic()}
        className="block overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-white shadow-[4px_4px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
      >
        <div
          className="relative flex h-[104px] items-center justify-center bg-cover bg-center"
          style={{
            backgroundColor: thumbColor(card.project.id),
            backgroundImage: card.project.iconImage ? `url(${card.project.iconImage})` : undefined,
          }}
        >
          <div className="absolute inset-y-0 left-0 w-[10px] border-r-2 border-[var(--solid-ink)] bg-[rgba(0,0,0,0.22)]" />
          {!card.project.iconImage && (
            <span className="font-display text-[34px] font-extrabold text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.25)]">
              {card.project.title.charAt(0)}
            </span>
          )}
          <span className="absolute bottom-1.5 right-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-2 py-0.5 font-mono text-[10px] font-extrabold tabular-nums text-[var(--solid-ink)]">
            {card.wordCount ?? 0}語
          </span>
        </div>
        <div className="border-t-2 border-[var(--solid-ink)] p-2.5">
          <div className="line-clamp-2 font-display text-[13px] font-extrabold leading-snug text-[var(--solid-ink)]">
            {card.project.title}
          </div>
          <div className="mt-1 truncate text-[10px] font-bold text-[var(--color-muted)]">
            {card.ownerUsername ? `@${card.ownerUsername}` : '共有ユーザー'}
          </div>
        </div>
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24 text-[var(--color-muted)]">
      <Icon name="progress_activity" className="animate-spin" size={22} />
      <span className="ml-2 text-sm font-bold">読み込み中...</span>
    </div>
  );
}

function CenteredCard({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-[18px] py-20">
      <div className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-6 text-center">
        <Icon name={icon} size={30} className="mx-auto text-[var(--color-muted)]" />
        <div className="mt-3 font-display text-lg font-bold text-[var(--solid-ink)]">{title}</div>
        {children}
      </div>
    </div>
  );
}
