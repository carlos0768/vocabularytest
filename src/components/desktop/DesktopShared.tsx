'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import type { SharedProjectCard, StudyGroupSummary } from '@/lib/shared-projects/types';

export type SharedLibraryTab = 'public' | 'groups';

export function DesktopSharedView({
  activeTab,
  onActiveTabChange,
  publicProjects,
  groupProjects,
  groups,
  selectedGroup,
  selectedGroupId,
  groupsLoading,
  groupProjectsLoading,
  publicNextCursor,
  publicLoadingMore,
  publicError,
  groupsError,
  groupProjectsError,
  createGroupName,
  joinGroupCode,
  groupActionLoading,
  onLoadMorePublic,
  onSelectGroup,
  onCreateGroupNameChange,
  onJoinGroupCodeChange,
  onCreateGroup,
  onJoinGroup,
  onCopyGroupInvite,
}: {
  activeTab: SharedLibraryTab;
  onActiveTabChange: (tab: SharedLibraryTab) => void;
  publicProjects: SharedProjectCard[];
  groupProjects: SharedProjectCard[];
  groups: StudyGroupSummary[];
  selectedGroup: StudyGroupSummary | null;
  selectedGroupId: string | null;
  groupsLoading: boolean;
  groupProjectsLoading: boolean;
  publicNextCursor: string | null;
  publicLoadingMore: boolean;
  publicError: string | null;
  groupsError: string | null;
  groupProjectsError: string | null;
  createGroupName: string;
  joinGroupCode: string;
  groupActionLoading: 'create' | 'join' | null;
  onLoadMorePublic: () => void;
  onSelectGroup: (groupId: string) => void;
  onCreateGroupNameChange: (value: string) => void;
  onJoinGroupCodeChange: (value: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  onCopyGroupInvite: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'popular' | 'public'>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const sourceProjects = activeTab === 'public' ? publicProjects : groupProjects;
  const popularCount = sourceProjects.filter((project) => (project.likeCount ?? 0) > 0).length;
  const rows = useMemo(() => {
    const base = filter === 'popular'
      ? [...sourceProjects].filter((project) => (project.likeCount ?? 0) > 0).sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      : sourceProjects;
    return base.filter((project) => !q || project.project.title.toLowerCase().includes(q));
  }, [filter, q, sourceProjects]);

  const emptyMessage = activeTab === 'public'
    ? '公開中の単語帳はまだありません'
    : selectedGroup
      ? 'このグループの単語帳はまだありません'
      : 'グループを選択してください';

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar
        title="共有ライブラリ"
        crumb={activeTab === 'public' ? 'コレクション / みんなの単語帳' : 'コレクション / グループ'}
      >
        <DesktopSearchBox
          placeholder={activeTab === 'public' ? '公開単語帳を検索' : 'グループ内を検索'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </DesktopTopbar>
      <div className="ds-scroll">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button type="button" className={'ds-chip' + (activeTab === 'public' ? ' active' : '')} onClick={() => onActiveTabChange('public')}>公開 <span className="tnum" style={{ opacity: 0.7 }}>{publicProjects.length}</span></button>
          <button type="button" className={'ds-chip' + (activeTab === 'groups' ? ' active' : '')} onClick={() => onActiveTabChange('groups')}>グループ <span className="tnum" style={{ opacity: 0.7 }}>{groups.length}</span></button>
          <span style={{ width: 8 }} />
          <button type="button" className={'ds-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>すべて <span className="tnum" style={{ opacity: 0.7 }}>{sourceProjects.length}</span></button>
          <button type="button" className={'ds-chip' + (filter === 'popular' ? ' active' : '')} onClick={() => setFilter('popular')}>人気 <span className="tnum" style={{ opacity: 0.7 }}>{popularCount}</span></button>
          {activeTab === 'public' && (
            <button type="button" className={'ds-chip' + (filter === 'public' ? ' active' : '')} onClick={() => setFilter('public')}>公開中 <span className="tnum" style={{ opacity: 0.7 }}>{publicProjects.length}</span></button>
          )}
        </div>

        {activeTab === 'groups' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(0, 1.2fr)', gap: 14, marginBottom: 18 }}>
            <div className="ds-card" style={{ padding: 14 }}>
              <div className="ds-sec-head" style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 15 }}>所属グループ</h2>
                {groupsLoading && <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 16 }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onSelectGroup(group.id)}
                    className={'ds-set-row' + (selectedGroupId === group.id ? ' active' : '')}
                    style={{ width: '100%', textAlign: 'left', border: '1px solid var(--color-border)', borderRadius: 8, background: selectedGroupId === group.id ? 'rgba(26,26,26,0.05)' : '#fff' }}
                  >
                    <div className="ic"><Icon name="group" /></div>
                    <div className="lab">
                      <div className="t">{group.name}</div>
                      <div className="d">{group.memberCount}人 · {group.projectCount}冊</div>
                    </div>
                  </button>
                ))}
                {!groupsLoading && groups.length === 0 && (
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>所属グループはまだありません</div>
                )}
              </div>
              {groupsError && <div style={{ marginTop: 10, color: 'var(--color-error)', fontSize: 12, fontWeight: 700 }}>{groupsError}</div>}
            </div>

            <div className="ds-card" style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                <input
                  className="ds-input"
                  value={createGroupName}
                  onChange={(event) => onCreateGroupNameChange(event.target.value)}
                  placeholder="新しいグループ名"
                />
                <button type="button" className="ds-btn" onClick={onCreateGroup} disabled={groupActionLoading === 'create' || !createGroupName.trim()}>
                  {groupActionLoading === 'create' ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="add" />}
                  作成
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input
                  className="ds-input"
                  value={joinGroupCode}
                  onChange={(event) => onJoinGroupCodeChange(event.target.value)}
                  placeholder="招待コード"
                />
                <button type="button" className="ds-btn" onClick={onJoinGroup} disabled={groupActionLoading === 'join' || !joinGroupCode.trim()}>
                  {groupActionLoading === 'join' ? <Icon name="progress_activity" className="animate-spin" /> : <Icon name="login" />}
                  参加
                </button>
              </div>

              {selectedGroup && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span className="ds-tag plain">{selectedGroup.role === 'owner' ? 'オーナー' : 'メンバー'}</span>
                  <span className="mono muted" style={{ fontSize: 12 }}>招待 {formatInviteCode(selectedGroup.inviteCode)}</span>
                  <button type="button" className="ds-btn ghost sm" onClick={onCopyGroupInvite}><Icon name="content_copy" />コピー</button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'groups' && groupProjectsLoading && (
          <div className="ds-card" style={{ padding: 18, marginBottom: 16, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="progress_activity" className="animate-spin" />
            読み込み中...
          </div>
        )}

        {groupProjectsError && (
          <div className="ds-card" style={{ marginBottom: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
            {groupProjectsError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {rows.map((project) => (
            <DesktopSharedCard key={project.project.id} project={project} />
          ))}
        </div>
        {rows.length === 0 && !groupProjectsLoading && (
          <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
            {emptyMessage}
          </div>
        )}
        {publicError && activeTab === 'public' && (
          <div className="ds-card" style={{ marginTop: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
            {publicError}
          </div>
        )}
        {publicNextCursor && activeTab === 'public' && (
          <button type="button" onClick={onLoadMorePublic} disabled={publicLoadingMore} className="ds-btn" style={{ marginTop: 18 }}>
            <Icon name={publicLoadingMore ? 'progress_activity' : 'expand_more'} className={publicLoadingMore ? 'animate-spin' : undefined} />
            {publicLoadingMore ? '読み込み中...' : 'もっと見る'}
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopSharedCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';
  const subject = project.accessRole === 'owner' ? '公開中' : project.accessRole === 'editor' ? '参加中' : '共有中';

  return (
    <Link href={href} className="ds-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div
          className="ds-project-icon ds-project-icon--lg"
          style={{
            background: desktopThumbColor(project.project.id),
            backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
          }}
        >
          {!project.project.iconImage && project.project.title.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{project.project.title}</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{ownerLabel}</div>
        </div>
        <span className="ds-tag plain">{subject}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
          {project.wordCount ?? 0}<span style={{ fontSize: 12, color: 'var(--color-secondary-text)' }}> 語</span>
        </span>
        <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="thumb_up" style={{ fontSize: 15 }} />{project.likeCount ?? 0}
        </span>
      </div>
      <span className="ds-btn" style={{ width: '100%' }}><Icon name="add" />詳細を見る</span>
    </Link>
  );
}

function formatInviteCode(value: string): string {
  const compact = value.replace(/-/g, '');
  const parts: string[] = [];
  for (let index = 0; index < compact.length; index += 4) {
    parts.push(compact.slice(index, index + 4));
  }
  return parts.join('-');
}
