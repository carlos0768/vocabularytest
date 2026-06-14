'use client';

import { startTransition, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DesktopSharedView, type SharedLibraryTab } from '@/components/desktop/DesktopShared';
import { Icon } from '@/components/ui';
import type {
  SharedProjectCard,
  SharedProjectMetricsMap,
  StudyGroupProjectListPayload,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import {
  collectMetricProjectIds,
  mergeMetricsIntoCards,
  mergeUniqueProjectCards,
} from './shared-page-utils';

type SharedPageClientProps = {
  initialPublicItems: SharedProjectCard[];
  initialPublicNextCursor: string | null;
};

type PublicProjectsResponse = {
  items?: SharedProjectCard[];
  nextCursor?: string | null;
};

type MetricsResponse = {
  metrics?: SharedProjectMetricsMap;
};

type StudyGroupsResponse = {
  success?: boolean;
  groups?: StudyGroupSummary[];
  error?: string;
};

type StudyGroupMutationResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  error?: string;
};

type StudyGroupProjectsResponse =
  | ({ success: true } & StudyGroupProjectListPayload)
  | { success?: false; error?: string };

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

type FilterKey = 'all' | 'popular' | 'public';

export default function SharedPageClient({
  initialPublicItems,
  initialPublicNextCursor,
}: SharedPageClientProps) {
  const [activeTab, setActiveTab] = useState<SharedLibraryTab>('public');
  const [publicProjects, setPublicProjects] = useState<SharedProjectCard[]>(initialPublicItems);
  const [publicNextCursor, setPublicNextCursor] = useState<string | null>(initialPublicNextCursor);
  const [loadingMorePublic, setLoadingMorePublic] = useState(false);
  const [publicSectionError, setPublicSectionError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [groups, setGroups] = useState<StudyGroupSummary[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupProjectsByGroupId, setGroupProjectsByGroupId] = useState<Record<string, SharedProjectCard[]>>({});
  const [groupProjectsLoading, setGroupProjectsLoading] = useState(false);
  const [groupProjectsError, setGroupProjectsError] = useState<string | null>(null);
  const [createGroupName, setCreateGroupName] = useState('');
  const [joinGroupCode, setJoinGroupCode] = useState('');
  const [groupActionLoading, setGroupActionLoading] = useState<'create' | 'join' | null>(null);
  const pendingMetricIdsRef = useRef(new Set<string>());

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const selectedGroupProjects = selectedGroupId ? (groupProjectsByGroupId[selectedGroupId] ?? []) : [];

  const applyMetrics = useEffectEvent((metrics: SharedProjectMetricsMap) => {
    startTransition(() => {
      setPublicProjects((current) => mergeMetricsIntoCards(current, metrics));
      setGroupProjectsByGroupId((current) => {
        const next: Record<string, SharedProjectCard[]> = {};
        for (const [groupId, cards] of Object.entries(current)) {
          next[groupId] = mergeMetricsIntoCards(cards, metrics);
        }
        return next;
      });
    });
  });

  const requestMetrics = useEffectEvent(async (projectIds: string[]) => {
    const nextIds = projectIds.filter((projectId) => !pendingMetricIdsRef.current.has(projectId));
    if (nextIds.length === 0) return;

    for (const projectId of nextIds) pendingMetricIdsRef.current.add(projectId);

    try {
      const response = await fetch(`/api/shared-projects/metrics?projectIds=${encodeURIComponent(nextIds.join(','))}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;

      const payload = await response.json() as MetricsResponse;
      if (payload.metrics) applyMetrics(payload.metrics);
    } catch {
      // Keep placeholders when metrics fail.
    } finally {
      for (const projectId of nextIds) pendingMetricIdsRef.current.delete(projectId);
    }
  });

  useEffect(() => {
    const groupProjects = Object.values(groupProjectsByGroupId).flat();
    const projectIds = collectMetricProjectIds([], [], [...publicProjects, ...groupProjects]);
    if (projectIds.length > 0) requestMetrics(projectIds);
  }, [groupProjectsByGroupId, publicProjects]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);

    try {
      const response = await fetch('/api/shared-projects/groups', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as StudyGroupsResponse | null;

      if (response.status === 401) {
        setGroups([]);
        setGroupsLoaded(true);
        setSelectedGroupId(null);
        setGroupsError('ログインするとグループを使えます。');
        return;
      }
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'study_groups_fetch_failed');
      }

      const nextGroups = payload.groups ?? [];
      startTransition(() => {
        setGroups(nextGroups);
        setGroupsLoaded(true);
        setSelectedGroupId((current) => {
          if (current && nextGroups.some((group) => group.id === current)) return current;
          return nextGroups[0]?.id ?? null;
        });
      });
    } catch (error) {
      console.warn('Failed to load study groups:', error);
      setGroups([]);
      setSelectedGroupId(null);
      setGroupsLoaded(true);
      setGroupsError('グループ一覧を読み込めませんでした。');
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadGroupProjects = useCallback(async (groupId: string) => {
    setGroupProjectsLoading(true);
    setGroupProjectsError(null);

    try {
      const response = await fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}/projects`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as StudyGroupProjectsResponse | null;

      if (!response.ok || !payload || payload.success !== true) {
        const message = payload && 'error' in payload ? payload.error : undefined;
        throw new Error(message || 'study_group_projects_fetch_failed');
      }

      startTransition(() => {
        setGroupProjectsByGroupId((current) => ({
          ...current,
          [groupId]: payload.projects ?? [],
        }));
        setGroups((current) => current.map((group) => (
          group.id === payload.group.id ? { ...group, ...payload.group } : group
        )));
      });
    } catch (error) {
      console.warn('Failed to load group projects:', error);
      setGroupProjectsError('グループ内の単語帳を読み込めませんでした。');
    } finally {
      setGroupProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'groups' || groupsLoaded || groupsLoading) return;
    void loadGroups();
  }, [activeTab, groupsLoaded, groupsLoading, loadGroups]);

  useEffect(() => {
    if (activeTab !== 'groups' || !selectedGroupId) return;
    if (groupProjectsByGroupId[selectedGroupId]) return;
    void loadGroupProjects(selectedGroupId);
  }, [activeTab, groupProjectsByGroupId, loadGroupProjects, selectedGroupId]);

  async function handleLoadMorePublic() {
    if (!publicNextCursor || loadingMorePublic) return;

    setLoadingMorePublic(true);
    setPublicSectionError(null);

    try {
      const response = await fetch(
        `/api/shared-projects/public?limit=8&cursor=${encodeURIComponent(publicNextCursor)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) throw new Error('shared_public_fetch_failed');

      const payload = await response.json() as PublicProjectsResponse;
      startTransition(() => {
        setPublicProjects((current) => mergeUniqueProjectCards(current, payload.items ?? []));
        setPublicNextCursor(payload.nextCursor ?? null);
      });
    } catch (error) {
      console.error('Failed to load more public projects:', error);
      setPublicSectionError('公開単語帳を追加で読み込めませんでした。');
    } finally {
      setLoadingMorePublic(false);
    }
  }

  async function handleCreateGroup() {
    const name = createGroupName.trim();
    if (!name || groupActionLoading) return;

    setGroupActionLoading('create');
    setGroupsError(null);

    try {
      const response = await fetch('/api/shared-projects/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null) as StudyGroupMutationResponse | null;
      if (!response.ok || !payload?.success || !payload.group) {
        throw new Error(payload?.error || 'study_group_create_failed');
      }

      startTransition(() => {
        setGroups((current) => [payload.group!, ...current.filter((group) => group.id !== payload.group!.id)]);
        setGroupProjectsByGroupId((current) => ({ ...current, [payload.group!.id]: [] }));
        setSelectedGroupId(payload.group!.id);
        setGroupsLoaded(true);
        setActiveTab('groups');
      });
      setCreateGroupName('');
    } catch (error) {
      console.error('Failed to create group:', error);
      setGroupsError(error instanceof Error ? error.message : 'グループの作成に失敗しました。');
    } finally {
      setGroupActionLoading(null);
    }
  }

  async function handleJoinGroup() {
    const inviteCode = joinGroupCode.trim();
    if (!inviteCode || groupActionLoading) return;

    setGroupActionLoading('join');
    setGroupsError(null);

    try {
      const response = await fetch('/api/shared-projects/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });
      const payload = await response.json().catch(() => null) as StudyGroupMutationResponse | null;
      if (!response.ok || !payload?.success || !payload.group) {
        throw new Error(payload?.error || 'グループへの参加に失敗しました。');
      }

      startTransition(() => {
        setGroups((current) => [payload.group!, ...current.filter((group) => group.id !== payload.group!.id)]);
        setSelectedGroupId(payload.group!.id);
        setGroupsLoaded(true);
        setActiveTab('groups');
        setGroupProjectsByGroupId((current) => {
          if (current[payload.group!.id]) return current;
          return { ...current, [payload.group!.id]: [] };
        });
      });
      setJoinGroupCode('');
      void loadGroupProjects(payload.group.id);
    } catch (error) {
      console.error('Failed to join group:', error);
      setGroupsError(error instanceof Error ? error.message : 'グループへの参加に失敗しました。');
    } finally {
      setGroupActionLoading(null);
    }
  }

  async function handleCopyGroupInvite() {
    if (!selectedGroup) return;
    await copyToClipboard(formatInviteCode(selectedGroup.inviteCode));
  }

  const popularCount = publicProjects.filter((project) => (project.likeCount ?? 0) > 0).length;

  const filteredPublicProjects = activeFilter === 'popular'
    ? [...publicProjects].filter((p) => (p.likeCount ?? 0) > 0).sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    : publicProjects;

  const mobileProjects = activeTab === 'public' ? filteredPublicProjects : selectedGroupProjects;

  return (
    <>
      <DesktopSharedView
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        publicProjects={publicProjects}
        groupProjects={selectedGroupProjects}
        groups={groups}
        selectedGroup={selectedGroup}
        selectedGroupId={selectedGroupId}
        groupsLoading={groupsLoading}
        groupProjectsLoading={groupProjectsLoading}
        publicNextCursor={publicNextCursor}
        publicLoadingMore={loadingMorePublic}
        publicError={publicSectionError}
        groupsError={groupsError}
        groupProjectsError={groupProjectsError}
        createGroupName={createGroupName}
        joinGroupCode={joinGroupCode}
        groupActionLoading={groupActionLoading}
        onLoadMorePublic={() => void handleLoadMorePublic()}
        onSelectGroup={setSelectedGroupId}
        onCreateGroupNameChange={setCreateGroupName}
        onJoinGroupCodeChange={setJoinGroupCode}
        onCreateGroup={() => void handleCreateGroup()}
        onJoinGroup={() => void handleJoinGroup()}
        onCopyGroupInvite={() => void handleCopyGroupInvite()}
      />
      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-2 pt-1">
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          COMMUNITY
        </div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">
          共有単語帳
        </div>
        <div className="mt-1 text-xs leading-[1.5] text-[var(--color-muted)]">
          みんなの単語帳と所属グループの単語帳を閲覧できます。
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-[14px] py-3">
        <FilterChip label="公開" count={publicProjects.length} active={activeTab === 'public'} onClick={() => setActiveTab('public')} />
        <FilterChip label="グループ" count={groups.length} active={activeTab === 'groups'} onClick={() => setActiveTab('groups')} />
        {activeTab === 'public' && (
          <>
            <FilterChip label="すべて" count={publicProjects.length} active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
            <FilterChip label="人気" count={popularCount} active={activeFilter === 'popular'} onClick={() => setActiveFilter('popular')} />
            <FilterChip label="公開中" count={publicProjects.length} active={activeFilter === 'public'} onClick={() => setActiveFilter('public')} />
          </>
        )}
      </div>

      {activeTab === 'groups' && (
        <div className="px-[14px] pb-3">
          <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              value={createGroupName}
              onChange={(event) => setCreateGroupName(event.target.value)}
              placeholder="新しいグループ名"
              className="min-w-0 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2 text-[13px] font-bold text-[var(--solid-ink)]"
            />
            <button
              type="button"
              onClick={() => void handleCreateGroup()}
              disabled={groupActionLoading === 'create' || !createGroupName.trim()}
              className="inline-flex items-center gap-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 text-[12px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              <Icon name={groupActionLoading === 'create' ? 'progress_activity' : 'add'} size={14} className={groupActionLoading === 'create' ? 'animate-spin' : undefined} />
              作成
            </button>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={joinGroupCode}
              onChange={(event) => setJoinGroupCode(event.target.value)}
              placeholder="招待コード"
              className="min-w-0 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2 text-[13px] font-bold text-[var(--solid-ink)]"
            />
            <button
              type="button"
              onClick={() => void handleJoinGroup()}
              disabled={groupActionLoading === 'join' || !joinGroupCode.trim()}
              className="inline-flex items-center gap-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 text-[12px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              <Icon name={groupActionLoading === 'join' ? 'progress_activity' : 'login'} size={14} className={groupActionLoading === 'join' ? 'animate-spin' : undefined} />
              参加
            </button>
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto">
            {groups.map((group) => (
              <FilterChip
                key={group.id}
                label={group.name}
                count={group.projectCount}
                active={selectedGroupId === group.id}
                onClick={() => setSelectedGroupId(group.id)}
              />
            ))}
          </div>

          {selectedGroup && (
            <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--solid-ink)] bg-white px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold text-[var(--color-muted)]">
                招待 {formatInviteCode(selectedGroup.inviteCode)}
              </span>
              <button type="button" onClick={() => void handleCopyGroupInvite()} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--solid-ink)]">
                <Icon name="content_copy" size={12} />
                コピー
              </button>
            </div>
          )}

          {groupsError && (
            <div className="mt-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
              {groupsError}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 px-[14px]">
        {activeTab === 'groups' && groupProjectsLoading && (
          <div className="rounded-xl border-[1.25px] border-[var(--color-border)] bg-white px-4 py-4 text-sm text-[var(--color-muted)]">
            <Icon name="progress_activity" size={16} className="mr-1 inline animate-spin" />
            読み込み中...
          </div>
        )}

        {mobileProjects.length === 0 && !(activeTab === 'groups' && groupProjectsLoading) ? (
          <div className="rounded-xl border-[1.25px] border-[var(--color-border)] bg-white px-4 py-12 text-center text-sm text-[var(--color-muted)]">
            {activeTab === 'public'
              ? '公開中の単語帳はまだありません'
              : selectedGroup
                ? 'このグループの単語帳はまだありません'
                : 'グループを選択してください'}
          </div>
        ) : (
          mobileProjects.map((project) => (
            <ProjectCard key={project.project.id} project={project} />
          ))
        )}

        {groupProjectsError && activeTab === 'groups' && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {groupProjectsError}
          </div>
        )}

        {publicSectionError && activeTab === 'public' && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {publicSectionError}
          </div>
        )}

        {publicNextCursor && activeTab === 'public' && (
          <button
            type="button"
            onClick={handleLoadMorePublic}
            disabled={loadingMorePublic}
            className="relative mt-2 disabled:opacity-60"
          >
            <span className="absolute inset-0 translate-x-[2px] translate-y-[2px] rounded-xl bg-[var(--solid-ink)]" />
            <span className="relative flex items-center justify-center gap-2 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-4 py-3 text-sm font-bold text-[var(--solid-ink)]">
              {loadingMorePublic ? (
                <>
                  <Icon name="progress_activity" size={18} className="animate-spin" />
                  読み込み中...
                </>
              ) : (
                <>
                  <Icon name="expand_more" size={18} />
                  もっと見る
                </>
              )}
            </span>
          </button>
        )}
      </div>
      </div>
    </>
  );
}

function FilterChip({ label, count, active = false, onClick }: { label: string; count: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[11px] py-1.5 text-[11px] font-bold transition-colors"
      style={{
        background: active ? 'var(--solid-ink)' : '#fff',
        color: active ? '#fff' : 'var(--solid-ink)',
        border: `1.25px solid ${active ? 'var(--solid-ink)' : 'var(--color-border)'}`,
      }}
    >
      {label}
      <span className="font-mono text-[9px] font-bold tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function ProjectCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const bg = thumbColor(project.project.id);
  const badgeLabel = project.accessRole === 'owner'
    ? '公開中'
    : project.accessRole === 'editor'
      ? '参加中'
      : '共有中';
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';

  return (
    <Link href={href} className="relative block">
      <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
      <div className="relative flex items-center gap-[11px] rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white p-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
        <div
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[10px] border-[1.25px] bg-cover bg-center font-display text-[22px] font-extrabold text-white"
          style={{
            backgroundColor: bg,
            backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
            borderColor: 'var(--solid-ink)',
          }}
        >
          {!project.project.iconImage && project.project.title.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-[14px] font-bold text-[var(--solid-ink)]">
              {project.project.title}
            </span>
          </div>
          <div className="mt-[3px] flex items-center gap-1.5">
            <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-[rgba(26,26,26,0.06)] font-mono text-[8px] font-bold text-[var(--color-muted)]">
              {ownerLabel.charAt(0).replace('@', '')}
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--color-muted)]">
              {ownerLabel}
            </span>
            <span className="text-[11px] text-[var(--color-muted)] opacity-50">.</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
              {project.wordCount === undefined ? '読込中' : `${project.wordCount} 語`}
            </span>
            {(project.likeCount ?? 0) > 0 && (
              <>
                <span className="text-[11px] text-[var(--color-muted)] opacity-50">.</span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                  {project.likeCount} likes
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="shrink-0 rounded px-[7px] py-[3px] font-mono text-[9px] font-bold tracking-[0.04em]"
          style={{ background: project.accessRole === 'owner' ? 'var(--solid-ink)' : '#fff', color: project.accessRole === 'owner' ? '#fff' : 'var(--solid-ink)', border: '1px solid var(--solid-ink)' }}
        >
          {badgeLabel}
        </div>
      </div>
    </Link>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatInviteCode(value: string): string {
  const compact = value.replace(/-/g, '');
  const parts: string[] = [];
  for (let index = 0; index < compact.length; index += 4) {
    parts.push(compact.slice(index, index + 4));
  }
  return parts.join('-');
}
